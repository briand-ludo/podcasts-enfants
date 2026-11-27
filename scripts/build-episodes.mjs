#!/usr/bin/env node
// Génère public/episodes.json à partir de podcasts.json.
//
//   node scripts/build-episodes.mjs            → lit les flux et écrit public/episodes.json
//   node scripts/build-episodes.mjs --chercher → propose des ids Apple pour les podcasts qui n'en ont pas
//                                                (n'écrit rien : le parent vérifie puis met à jour podcasts.json)
//
// Pour chaque podcast : flux = feedUrl forcé dans podcasts.json, sinon feedUrl donné par
// l'API lookup d'Apple. Si un flux échoue, on garde les épisodes de la génération
// précédente pour ce podcast, pour qu'une panne d'un soir ne vide pas l'app.

import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOGUE = resolve(ROOT, 'podcasts.json')
const SORTIE = resolve(ROOT, 'public/episodes.json')
const SORTIE_SUGGESTIONS = resolve(ROOT, 'public/suggestions.json')
// Sous-catégories d'« Enfants et famille » : Histoires pour enfants, Éducation pour enfants.
// (La catégorie entière mélange des podcasts pour les parents.)
const GENRES_SUGGESTIONS = [1520, 1519]
const MAX_EPISODES_PAR_PODCAST = 300
const UA = 'podcasts-enfants/1.0 (+usage familial)'

// ---------- utilitaires ----------

async function telecharger(url, { tentatives = 3, delaiMs = 20000 } = {}) {
  let derniereErreur
  for (let i = 1; i <= tentatives; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, application/json, */*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(delaiMs),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      derniereErreur = e
      if (i < tentatives) await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
  throw new Error(`${url} : ${derniereErreur?.message ?? derniereErreur}`)
}

const texte = (v) => {
  if (v == null) return ''
  if (typeof v === 'object') return String(v['#text'] ?? '')
  return String(v)
}

const MOTS_VIDES = new Set(['et', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'un', 'une', 'a', 'au', 'aux'])

/**
 * Titre normalisé pour comparer deux épisodes : minuscules, sans accents, sans ponctuation
 * ni petits mots (« Pierrot, Poupouche et le consentement » = « Pierrot et Poupouche et le consentement »).
 */
export function normaliserTitre(t) {
  return texte(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`"«»“”]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((m) => m && !MOTS_VIDES.has(m))
    .join(' ')
}

/** "1:02:03", "12:34", "754" → secondes. */
function dureeEnSecondes(v) {
  const s = texte(v).trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s))
  const parts = s.split(':').map(Number)
  if (parts.some(Number.isNaN)) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

const idCourt = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)

const premier = (v) => (Array.isArray(v) ? v[0] : v)

// ---------- Apple ----------

async function lookupApple(ids) {
  const res = new Map()
  for (let i = 0; i < ids.length; i += 50) {
    const lot = ids.slice(i, i + 50)
    const json = JSON.parse(await telecharger(`https://itunes.apple.com/lookup?id=${lot.join(',')}&country=FR&entity=podcast`))
    for (const r of json.results ?? []) res.set(r.collectionId, r)
  }
  return res
}

async function chercherIds(catalogue) {
  const manquants = catalogue.podcasts.filter((p) => !p.appleId)
  if (!manquants.length) return console.log('Tous les podcasts ont un id Apple.')
  for (const p of manquants) {
    const q = new URLSearchParams({ term: p.titre, media: 'podcast', country: 'FR', limit: '5' })
    const json = JSON.parse(await telecharger(`https://itunes.apple.com/search?${q}`))
    console.log(`\n${p.titre} (${p.producteur})`)
    if (!json.results?.length) console.log('  aucun résultat')
    for (const r of json.results ?? [])
      console.log(`  ${r.collectionId}  ${r.collectionName} — ${r.artistName} (${r.trackCount} ép.)  ${r.feedUrl ?? 'sans flux'}`)
  }
  console.log('\nVérifie les candidats, puis renseigne appleId dans podcasts.json.')
}

async function suggestions(catalogue) {
  const dejaLa = new Set(catalogue.podcasts.map((p) => String(p.appleId)))
  const vus = new Set()
  const liste = []
  for (const genre of GENRES_SUGGESTIONS) {
    const json = JSON.parse(await telecharger(`https://itunes.apple.com/fr/rss/toppodcasts/limit=50/genre=${genre}/json`))
    for (const e of json.feed?.entry ?? []) {
      const appleId = e.id?.attributes?.['im:id']
      if (!appleId || dejaLa.has(appleId) || vus.has(appleId)) continue
      vus.add(appleId)
      liste.push({
        appleId: Number(appleId),
        titre: e['im:name']?.label ?? '',
        producteur: e['im:artist']?.label ?? '',
        image: e['im:image']?.at(-1)?.label?.replace(/\/\d+x\d+bb/, '/300x300bb') ?? null,
        resume: (e.summary?.label ?? '').slice(0, 280),
      })
    }
  }
  return liste
}

// ---------- RSS ----------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (nom) => nom === 'item',
  processEntities: true,
  htmlEntities: true,
})

function lireFlux(xml, podcast) {
  const doc = parser.parse(xml)
  const channel = doc?.rss?.channel
  if (!channel) throw new Error("ce n'est pas un flux RSS")
  const imageFlux = premier(channel['itunes:image'])?.['@href'] ?? texte(channel.image?.url) ?? null

  const episodes = []
  for (const item of channel.item ?? []) {
    const enclosure = premier(item.enclosure)
    const audio = enclosure?.['@url']
    if (!audio) continue
    const guid = texte(item.guid) || audio
    const date = new Date(texte(item.pubDate))
    const image = premier(item['itunes:image'])?.['@href']
    episodes.push({
      id: idCourt(guid),
      guid,
      podcastId: podcast.id,
      titre: texte(item.title).trim(),
      date: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      duree: dureeEnSecondes(item['itunes:duration']),
      audio,
      type: enclosure['@type'] || 'audio/mpeg',
      taille: Number(enclosure['@length']) || null,
      ...(image && image !== imageFlux ? { image } : {}),
    })
  }
  episodes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    // « serial » = série à écouter dans l'ordre (épisode 1, 2, 3…)
  const serie = texte(premier(channel['itunes:type'])).trim().toLowerCase() === 'serial'
  return { titreFlux: texte(channel.title).trim(), image: imageFlux, serie, episodes: episodes.slice(0, MAX_EPISODES_PAR_PODCAST) }
}

// ---------- dédoublonnage ----------

/**
 * Un épisode présent dans deux flux n'apparaît qu'une fois.
 * - même guid : doublon, quels que soient les podcasts ;
 * - même titre normalisé : doublon seulement entre podcasts liés par `plusSpecifiqueQue`
 *   (deux podcasts sans lien peuvent raconter chacun « Le Petit Chaperon rouge »).
 * L'épisode est gardé dans le podcast le plus spécifique.
 */
export function dedoublonner(catalogue, episodesParPodcast) {
  const liens = new Map() // podcastId → Set des podcasts qu'il « domine »
  for (const p of catalogue.podcasts) liens.set(p.id, new Set(p.plusSpecifiqueQue ?? []))

  // Les plus spécifiques d'abord : ils réservent leurs épisodes.
  const ordre = [...catalogue.podcasts].sort((a, b) => {
    if (liens.get(a.id).has(b.id)) return -1
    if (liens.get(b.id).has(a.id)) return 1
    return 0
  })

  const parGuid = new Map()
  const parTitre = new Map() // titre normalisé → podcastId
  const garde = []
  let retires = 0
  for (const p of ordre) {
    for (const ep of episodesParPodcast.get(p.id) ?? []) {
      const titre = normaliserTitre(ep.titre)
      const proprio = parTitre.get(titre)
      const doublonTitre = proprio && proprio !== p.id && liens.get(proprio)?.has(p.id)
      if (parGuid.has(ep.guid) || doublonTitre) {
        retires++
        continue
      }
      parGuid.set(ep.guid, p.id)
      if (titre && !parTitre.has(titre)) parTitre.set(titre, p.id)
      garde.push(ep)
    }
  }
  return { episodes: garde, retires }
}

// ---------- principal ----------

async function main() {
  const catalogue = JSON.parse(await readFile(CATALOGUE, 'utf8'))
  if (process.argv.includes('--chercher')) return chercherIds(catalogue)

  let precedent = null
  try {
    precedent = JSON.parse(await readFile(SORTIE, 'utf8'))
  } catch {
    /* première génération */
  }

  const ids = catalogue.podcasts.map((p) => p.appleId).filter(Boolean)
  let apple = new Map()
  try {
    apple = await lookupApple(ids)
  } catch (e) {
    console.warn(`⚠️  API Apple injoignable (${e.message}) : seuls les feedUrl forcés seront lus.`)
  }

  const episodesParPodcast = new Map()
  const etat = []
  await Promise.all(
    catalogue.podcasts.map(async (p) => {
      const infoApple = p.appleId ? apple.get(p.appleId) : null
      const feedUrl = p.feedUrl || infoApple?.feedUrl || null
      const base = {
        id: p.id,
        titre: p.titre,
        appleId: p.appleId,
        profils: p.profils,
        image: infoApple?.artworkUrl600 ?? null,
        feedUrl,
      }
      if (!feedUrl) {
        const raison = !p.appleId ? "pas d'id Apple" : !infoApple ? 'id inconnu chez Apple' : 'Apple ne fournit pas de flux'
        etat.push({ ...base, statut: 'sans-flux', message: raison, nbEpisodes: 0 })
        return
      }
      try {
        const flux = lireFlux(await telecharger(feedUrl), p)
        episodesParPodcast.set(p.id, flux.episodes)
        etat.push({ ...base, image: base.image ?? flux.image, serie: flux.serie, statut: 'ok', nbEpisodes: flux.episodes.length })
      } catch (e) {
        const anciens = precedent?.episodes?.filter((ep) => ep.podcastId === p.id) ?? []
        const ancienEtat = precedent?.podcasts?.find((x) => x.id === p.id)
        episodesParPodcast.set(p.id, anciens.map((ep) => ({ ...ep, guid: ep.guid ?? ep.id })))
        etat.push({ ...base, image: base.image ?? ancienEtat?.image ?? null, serie: ancienEtat?.serie ?? false, statut: 'erreur', message: e.message, nbEpisodes: anciens.length })
      }
    }),
  )

  const { episodes, retires } = dedoublonner(catalogue, episodesParPodcast)
  episodes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  // Recompte après dédoublonnage, dans l'ordre du catalogue.
  const compte = new Map()
  for (const ep of episodes) compte.set(ep.podcastId, (compte.get(ep.podcastId) ?? 0) + 1)
  const podcasts = catalogue.podcasts.map((p) => {
    const e = etat.find((x) => x.id === p.id)
    return { ...e, nbEpisodes: compte.get(p.id) ?? 0 }
  })

  const sortie = {
    genereLe: new Date().toISOString(),
    depot: process.env.GITHUB_REPOSITORY ?? null,
    profils: catalogue.profils,
    podcasts,
    episodes,
  }
  await mkdir(dirname(SORTIE), { recursive: true })
  await writeFile(SORTIE, JSON.stringify(sortie))

  try {
    const liste = await suggestions(catalogue)
    await writeFile(SORTIE_SUGGESTIONS, JSON.stringify({ genereLe: sortie.genereLe, suggestions: liste }))
    console.log(`${liste.length} suggestions « Enfants et famille »`)
  } catch (e) {
    console.warn(`⚠️  Suggestions non mises à jour : ${e.message}`)
  }

  // Résumé lisible dans les logs de l'Action
  console.log(`\n${episodes.length} épisodes, ${retires} doublons retirés\n`)
  for (const p of podcasts) {
    const icone = { ok: '✅', erreur: '❌', 'sans-flux': '⚪' }[p.statut]
    console.log(`${icone} ${p.titre.padEnd(42)} ${String(p.nbEpisodes).padStart(4)} ép.${p.message ? '  — ' + p.message : ''}`)
  }

  if (!podcasts.some((p) => p.statut === 'ok')) {
    console.error('\nAucun flux lu : échec.')
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
