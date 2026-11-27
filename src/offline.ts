// « Pour la route » : téléchargement des prochains épisodes dans Cache Storage.
// Le téléchargement d'un MP3 externe n'est possible que si l'hébergeur autorise le CORS ;
// sinon l'épisode reste en streaming seul, et le podcast est noté comme bloquant.
import { get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { Episode } from './types'

const CACHE = 'audio-hors-ligne'
const BASE = import.meta.env.BASE_URL

type Meta = { taille: number; date: number; podcastId: string }
type Etat = {
  telecharges: Record<string, Meta>
  bloques: Record<string, string> // podcastId → hôte audio qui refuse le CORS
  enCours: { fait: number; total: number; episode?: string } | null
}

let etat: Etat = { telecharges: {}, bloques: {}, enCours: null }
const abonnes = new Set<() => void>()
function maj(p: Partial<Etat>) {
  etat = { ...etat, ...p }
  abonnes.forEach((f) => f())
}

export const urlLocale = (id: string) => `${BASE}audio-hors-ligne/${id}`
export const estTelecharge = (id: string) => id in etat.telecharges

export async function initHorsLigne() {
  const [meta, bloques] = await Promise.all([get<Record<string, Meta>>('hors-ligne'), get<Record<string, string>>('cors-bloques')])
  // On ne garde que ce qui est réellement dans le cache (iOS a pu le vider).
  const telecharges: Record<string, Meta> = {}
  try {
    const cache = await caches.open(CACHE)
    const presents = new Set((await cache.keys()).map((r) => new URL(r.url).pathname.split('/').pop()!))
    for (const [id, m] of Object.entries(meta ?? {})) if (presents.has(id)) telecharges[id] = m
  } catch {
    /* Cache Storage indisponible */
  }
  maj({ telecharges, bloques: bloques ?? {} })
}

/** Met la vignette en cache pour qu'elle s'affiche aussi sans réseau (réponse opaque : pas besoin de CORS). */
async function garderImage(url: string | null | undefined) {
  if (!url) return
  try {
    const cache = await caches.open('vignettes')
    if (await cache.match(url)) return
    await cache.put(url, await fetch(url, { mode: 'no-cors' }))
  } catch {
    /* pas grave */
  }
}

async function telechargerUn(ep: Episode, image?: string | null): Promise<'ok' | 'cors' | 'erreur'> {
  let r: Response
  try {
    r = await fetch(ep.audio, { mode: 'cors', credentials: 'omit' })
  } catch {
    // TypeError sans réponse : refus CORS si on est en ligne (sinon simple coupure réseau)
    return navigator.onLine ? 'cors' : 'erreur'
  }
  if (!r.ok) return 'erreur'
  await garderImage(image)
  const blob = await r.blob()
  const cache = await caches.open(CACHE)
  await cache.put(
    urlLocale(ep.id),
    new Response(blob, {
      headers: { 'Content-Type': ep.type || blob.type || 'audio/mpeg', 'Content-Length': String(blob.size), 'Accept-Ranges': 'bytes' },
    }),
  )
  const telecharges = { ...etat.telecharges, [ep.id]: { taille: blob.size, date: Date.now(), podcastId: ep.podcastId } }
  maj({ telecharges })
  await set('hors-ligne', telecharges)
  return 'ok'
}

export type Bilan = { ok: number; dejaLa: number; cors: string[]; erreurs: number }

/** Télécharge les épisodes donnés (dans l'ordre), en sautant ceux déjà présents. */
export async function telecharger(episodes: Episode[], image: (e: Episode) => string | null = () => null): Promise<Bilan> {
  const bilan: Bilan = { ok: 0, dejaLa: 0, cors: [], erreurs: 0 }
  // Un même épisode peut être prévu pour les deux enfants : une seule fois.
  const uniques = [...new Map(episodes.map((e) => [e.id, e])).values()]
  const aFaire = uniques.filter((e) => {
    if (estTelecharge(e.id)) return bilan.dejaLa++, false
    return true
  })
  const bloques = { ...etat.bloques }
  maj({ enCours: { fait: 0, total: aFaire.length } })
  try {
    for (const [i, ep] of aFaire.entries()) {
      maj({ enCours: { fait: i, total: aFaire.length, episode: ep.titre } })
      // Inutile d'insister sur un podcast dont l'hébergeur a déjà refusé
      if (bloques[ep.podcastId]) {
        bilan.cors.push(ep.podcastId)
        continue
      }
      const res = await telechargerUn(ep, image(ep))
      if (res === 'ok') {
        bilan.ok++
        delete bloques[ep.podcastId]
      } else if (res === 'cors') {
        bloques[ep.podcastId] = new URL(ep.audio).hostname
        bilan.cors.push(ep.podcastId)
      } else bilan.erreurs++
    }
  } finally {
    maj({ enCours: null, bloques })
    await set('cors-bloques', bloques)
  }
  bilan.cors = [...new Set(bilan.cors)]
  return bilan
}

export async function supprimer(ids: string[]) {
  const cache = await caches.open(CACHE)
  await Promise.all(ids.map((id) => cache.delete(urlLocale(id))))
  const telecharges = { ...etat.telecharges }
  for (const id of ids) delete telecharges[id]
  maj({ telecharges })
  await set('hors-ligne', telecharges)
}

/** Permet de retenter les podcasts bloqués (par ex. si l'hébergeur a changé). */
export async function oublierBlocages() {
  maj({ bloques: {} })
  await set('cors-bloques', {})
}

export function useHorsLigne() {
  return useSyncExternalStore(
    (f) => (abonnes.add(f), () => abonnes.delete(f)),
    () => etat,
  )
}

export const espaceUtilise = (t: Record<string, Meta>) => Object.values(t).reduce((s, m) => s + m.taille, 0)

export async function stockagePersistant(demander = false): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null
  if (await navigator.storage.persisted()) return true
  return demander && navigator.storage.persist ? navigator.storage.persist() : false
}
