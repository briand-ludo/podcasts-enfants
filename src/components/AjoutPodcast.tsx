import { useEffect, useMemo, useRef, useState } from 'react'
import { chargerSuggestions, depotGitHub, formatDate, formatDuree, type Index } from '../data'
import { enregistrerCle, envoyerDemande, lireCle, oublierCle, suivreDemande, urlCreationCle, type Suivi } from '../github'
import { lecteur } from '../player'
import { avatarProfil, nomProfil } from '../store'
import type { Suggestion } from '../types'
import { Lecture, Pause } from './Icones'

// ---------- section « Ajouter un podcast » ----------

export function SectionAjout({ idx }: { idx: Index }) {
  const c = idx.catalogue
  const depot = depotGitHub(c)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState<Suggestion[] | null>(null)
  const [choix, setChoix] = useState<Suggestion | null>(null)
  const [cle, setCle] = useState<string | null | undefined>(undefined)
  const dejaLa = useMemo(() => new Set(c.podcasts.map((p) => p.appleId)), [c])

  useEffect(() => {
    chargerSuggestions().then(setSuggestions)
    lireCle().then((k) => setCle(k ?? null))
  }, [])

  const chercher = async (e: React.FormEvent) => {
    e.preventDefault()
    const lien = q.match(/id(\d{6,})/)
    const url = lien
      ? `https://itunes.apple.com/lookup?id=${lien[1]}&country=FR&entity=podcast`
      : `https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: 'podcast', country: 'FR', limit: '15' })}`
    try {
      const json = await (await fetch(url)).json()
      setResultats(
        (json.results ?? [])
          .filter((r: { kind?: string }) => r.kind === 'podcast')
          .map((r: Record<string, string | number>) => ({
            appleId: Number(r.collectionId),
            titre: String(r.collectionName),
            producteur: String(r.artistName ?? ''),
            image: (r.artworkUrl600 as string) ?? null,
            resume: '',
          })),
      )
    } catch {
      setResultats([])
    }
  }

  const liste = (resultats ?? suggestions).filter((s) => !dejaLa.has(s.appleId))
  return (
    <section className="carte">
      <h2>Ajouter un podcast</h2>
      {depot && cle !== undefined && <ConnexionGitHub depot={depot} cle={cle} setCle={setCle} />}
      <form onSubmit={chercher} className="recherche">
        <input className="champ" type="search" value={q} onChange={(e) => (setQ(e.target.value), !e.target.value && setResultats(null))} placeholder="Nom ou lien Apple Podcasts" />
        <button className="bouton-secondaire">Chercher</button>
      </form>
      <p className="aide">{resultats ? `${liste.length} résultat(s)` : 'Suggestions : les plus écoutés en « Histoires » et « Éducation pour enfants » sur Apple Podcasts.'}</p>
      <div className="liste-suggestions">
        {liste.slice(0, 40).map((s) => (
          <button key={s.appleId} className="suggestion" onClick={() => setChoix(s)}>
            {s.image ? <img src={s.image} alt="" loading="lazy" /> : <span className="image-vide" />}
            <span>
              <strong>{s.titre}</strong>
              <small>{s.producteur}</small>
              {s.resume && <small className="resume">{s.resume}</small>}
            </span>
          </button>
        ))}
      </div>
      {choix && <FichePodcast idx={idx} podcast={choix} depot={depot} cle={cle ?? null} fermer={() => setChoix(null)} />}
    </section>
  )
}

// ---------- clé GitHub (une seule fois) ----------

function ConnexionGitHub({ depot, cle, setCle }: { depot: string; cle: string | null; setCle: (k: string | null) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [etat, setEtat] = useState<{ ok?: string; erreur?: string; attente?: boolean }>({})

  if (cle)
    return (
      <p className="aide connexion-ok">
        ✅ Les ajouts partent directement d'ici.{' '}
        <button className="lien" onClick={() => confirm('Oublier la clé GitHub sur cet iPhone ?') && oublierCle().then(() => setCle(null))}>
          Oublier la clé
        </button>
      </p>
    )

  const valider = async () => {
    setEtat({ attente: true })
    try {
      const compte = await enregistrerCle(saisie, depot)
      setEtat({ ok: compte })
      setCle(saisie.trim())
    } catch (e) {
      setEtat({ erreur: (e as Error).message })
    }
  }

  return (
    <div className="encart-github">
      <p>
        <strong>Ajouter sans quitter l'app</strong> : à régler une seule fois.
      </p>
      {!ouvert ? (
        <button className="bouton-secondaire" onClick={() => setOuvert(true)}>
          Configurer (2 min)
        </button>
      ) : (
        <ol className="etapes">
          <li>
            <a className="lien" href={urlCreationCle(depot)} target="_blank" rel="noopener">
              Créer une clé sur GitHub
            </a>{' '}
            (connecte-toi si besoin).
          </li>
          <li>
            Dans <em>Repository access</em>, choisis <em>Only select repositories</em> → <strong>{depot.split('/')[1]}</strong>.
          </li>
          <li>
            Dans <em>Permissions</em> → <em>Repository permissions</em>, mets <strong>Issues</strong> sur <em>Read and write</em> (rien d'autre).
          </li>
          <li>
            <em>Generate token</em>, copie la clé (<code>github_pat_…</code>) et colle-la ici :
            <div className="recherche">
              <input className="champ" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="github_pat_…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button className="bouton-principal" onClick={valider} disabled={!saisie.trim() || etat.attente}>
                {etat.attente ? '…' : 'Valider'}
              </button>
            </div>
          </li>
        </ol>
      )}
      {etat.erreur && <p className="erreur-texte">{etat.erreur}</p>}
      <p className="aide">La clé reste sur cet iPhone et ne permet que de créer des issues dans ce dépôt.</p>
    </div>
  )
}

// ---------- fiche détaillée d'un podcast ----------

type EpisodeApple = { id: number; titre: string; date: string; duree: number | null; resume: string; audio: string | null }
type Details = {
  genres: string[]
  nbEpisodes: number | null
  dernier: string | null
  rythme: string | null
  dureeMoyenne: number | null
  sansFlux: boolean
  episodes: EpisodeApple[]
}

async function chargerDetails(appleId: number): Promise<Details> {
  const json = await (await fetch(`https://itunes.apple.com/lookup?id=${appleId}&country=FR&entity=podcastEpisode&limit=10`)).json()
  const [p, ...eps] = json.results ?? []
  const episodes: EpisodeApple[] = eps
    .filter((e: { kind?: string; wrapperType?: string }) => e.wrapperType === 'podcastEpisode' || e.kind === 'podcast-episode')
    .map((e: Record<string, string | number>) => ({
      id: Number(e.trackId),
      titre: String(e.trackName ?? ''),
      date: String(e.releaseDate ?? ''),
      duree: e.trackTimeMillis ? Math.round(Number(e.trackTimeMillis) / 1000) : null,
      resume: String(e.description ?? e.shortDescription ?? '').trim(),
      audio: (e.episodeUrl as string) ?? null,
    }))
    .sort((a: EpisodeApple, b: EpisodeApple) => b.date.localeCompare(a.date))
  // Rythme de publication d'après l'écart médian entre les derniers épisodes
  const ecarts = episodes.slice(0, 8).flatMap((e, i, l) => (i ? [(Date.parse(l[i - 1].date) - Date.parse(e.date)) / 86_400_000] : [])).sort((a, b) => a - b)
  const med = ecarts.length ? ecarts[Math.floor(ecarts.length / 2)] : null
  const rythme = med == null ? null : med <= 1.5 ? 'chaque jour' : med <= 4 ? 'plusieurs fois par semaine' : med <= 10 ? 'chaque semaine' : med <= 20 ? 'toutes les deux semaines' : med <= 45 ? 'chaque mois' : 'de temps en temps'
  const durees = episodes.map((e) => e.duree).filter((d): d is number => !!d)
  return {
    genres: (p?.genres ?? []).filter((g: string) => g !== 'Podcasts'),
    nbEpisodes: p?.trackCount ?? null,
    dernier: episodes[0]?.date ?? p?.releaseDate ?? null,
    rythme,
    dureeMoyenne: durees.length ? durees.reduce((a, b) => a + b, 0) / durees.length : null,
    sansFlux: !!p && !p.feedUrl,
    episodes,
  }
}

function texteSimple(html: string) {
  const d = document.createElement('div')
  d.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
  return (d.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

type EtatEnvoi = { etape: 'repos' } | { etape: 'envoi' } | { etape: 'suivi'; numero: number; url: string; suivi: Suivi } | { etape: 'erreur'; message: string }

function FichePodcast({ idx, podcast, depot, cle, fermer }: { idx: Index; podcast: Suggestion; depot: string | null; cle: string | null; fermer: () => void }) {
  const c = idx.catalogue
  const [details, setDetails] = useState<Details | null>(null)
  const [profils, setProfils] = useState<string[]>(c.profils.map((p) => p.id))
  const [envoi, setEnvoi] = useState<EtatEnvoi>({ etape: 'repos' })
  const [ecoute, setEcoute] = useState<number | null>(null)
  const [toutLire, setToutLire] = useState(false)
  const extrait = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    chargerDetails(podcast.appleId).then(setDetails).catch(() => setDetails(null))
    return () => extrait.current?.pause()
  }, [podcast.appleId])

  // Suivi de l'Action : on regarde toutes les 8 s, 5 min au plus.
  useEffect(() => {
    if (envoi.etape !== 'suivi' || envoi.suivi.etat !== 'en-cours' || !depot || !cle) return
    const debut = Date.now()
    const t = setInterval(async () => {
      try {
        const suivi = await suivreDemande(depot, cle, envoi.numero)
        if (suivi.etat !== 'en-cours' || Date.now() - debut > 5 * 60_000) {
          clearInterval(t)
          setEnvoi({ ...envoi, suivi })
        }
      } catch {
        /* on réessaie au tour suivant */
      }
    }, 8000)
    return () => clearInterval(t)
  }, [envoi, depot, cle])

  const ecouter = (e: EpisodeApple) => {
    if (!e.audio) return
    if (ecoute === e.id) {
      extrait.current?.pause()
      return setEcoute(null)
    }
    lecteur.pause()
    extrait.current?.pause()
    const a = new Audio(e.audio)
    a.currentTime = 0
    a.play().catch(() => setEcoute(null))
    a.onended = () => setEcoute(null)
    extrait.current = a
    setEcoute(e.id)
  }

  const corps = [
    '<!-- ajout-podcast -->',
    "Ajout demandé depuis l'app.",
    '',
    '```json',
    JSON.stringify({ appleId: podcast.appleId, titre: podcast.titre, producteur: podcast.producteur, profils }, null, 2),
    '```',
  ].join('\n')
  const titreIssue = `Ajouter : ${podcast.titre}`
  const urlSecours = depot ? `https://github.com/${depot}/issues/new?${new URLSearchParams({ title: titreIssue, labels: 'ajout-podcast', body: corps })}` : null

  const ajouter = async () => {
    if (!depot || !cle) return
    setEnvoi({ etape: 'envoi' })
    try {
      const d = await envoyerDemande(depot, cle, titreIssue, corps)
      setEnvoi({ etape: 'suivi', numero: d.numero, url: d.url, suivi: { etat: 'en-cours' } })
    } catch (e) {
      setEnvoi({ etape: 'erreur', message: (e as Error).message })
    }
  }

  const description = podcast.resume || ''
  return (
    <div className="voile" onClick={fermer}>
      <div className="dialogue fiche" onClick={(e) => e.stopPropagation()}>
        <div className="fiche-entete">
          {podcast.image && <img src={podcast.image} alt="" className="dialogue-image" />}
          <div>
            <h3>{podcast.titre}</h3>
            <p className="aide">{podcast.producteur}</p>
            {details && details.genres.length > 0 && (
              <div className="genres">
                {details.genres.map((g) => (
                  <span key={g}>{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {details ? (
          <p className="fiche-chiffres">
            {[
              details.nbEpisodes ? `${details.nbEpisodes} épisodes` : null,
              details.rythme ? `nouveau ${details.rythme}` : null,
              details.dureeMoyenne ? `≈ ${formatDuree(details.dureeMoyenne)} par épisode` : null,
              details.dernier ? `dernier : ${formatDate(details.dernier)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : (
          <p className="aide">Chargement des informations…</p>
        )}
        {details?.sansFlux && <p className="erreur-texte">⚠️ Apple ne fournit pas de flux RSS pour ce podcast : il faudra le renseigner à la main.</p>}

        {description && (
          <>
            <p className={`fiche-description${toutLire ? '' : ' replie'}`}>{description}</p>
            {description.length > 260 && (
              <button className="lien lire-suite" onClick={() => setToutLire((v) => !v)}>
                {toutLire ? 'Réduire' : 'Lire la suite'}
              </button>
            )}
          </>
        )}

        {details && details.episodes.length > 0 && (
          <div className="fiche-episodes">
            <h4>Derniers épisodes</h4>
            {details.episodes.slice(0, 5).map((e) => (
              <div key={e.id} className="fiche-episode">
                <button className="mini-play" onClick={() => ecouter(e)} disabled={!e.audio} aria-label={ecoute === e.id ? 'Arrêter' : 'Écouter'}>
                  {ecoute === e.id ? <Pause taille={18} /> : <Lecture taille={18} />}
                </button>
                <div>
                  <strong>{e.titre}</strong>
                  <small>{[formatDate(e.date), formatDuree(e.duree)].filter(Boolean).join(' · ')}</small>
                  {e.resume && <p>{texteSimple(e.resume).slice(0, 260)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {envoi.etape === 'repos' || envoi.etape === 'erreur' ? (
          <>
            <p>
              <strong>Pour qui ?</strong>
            </p>
            <div className="choix-profils">
              {c.profils.map((p) => (
                <label key={p.id} className="case">
                  <input type="checkbox" checked={profils.includes(p.id)} onChange={(e) => setProfils((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
                  {avatarProfil(c, p.id)} {nomProfil(c, p.id)}
                </label>
              ))}
            </div>
            {envoi.etape === 'erreur' && <p className="erreur-texte">{envoi.message}</p>}
            <div className="dialogue-actions">
              <button className="bouton-secondaire" onClick={fermer}>
                Fermer
              </button>
              {cle ? (
                <button className="bouton-principal" onClick={ajouter} disabled={!profils.length}>
                  Ajouter
                </button>
              ) : urlSecours ? (
                <a className="bouton-principal" href={urlSecours} target="_blank" rel="noopener" aria-disabled={!profils.length}>
                  Ajouter via GitHub
                </a>
              ) : null}
            </div>
            {!cle && <p className="aide">Astuce : configure la clé GitHub (plus haut) pour ajouter sans quitter l'app.</p>}
          </>
        ) : (
          <div className="fiche-suivi">
            {envoi.etape === 'envoi' && <p>Envoi de la demande…</p>}
            {envoi.etape === 'suivi' && envoi.suivi.etat === 'en-cours' && (
              <p>
                <span className="chargement petit" /> Demande envoyée. Ajout au catalogue en cours (1 à 2 min)…
              </p>
            )}
            {envoi.etape === 'suivi' && envoi.suivi.etat === 'ajoute' && (
              <>
                <p>✅ Ajouté au catalogue ! Il apparaîtra dans l'app d'ici quelques minutes, le temps que le site se mette à jour.</p>
                <button className="bouton-principal" onClick={() => location.reload()}>
                  Recharger l'app plus tard
                </button>
              </>
            )}
            {envoi.etape === 'suivi' && envoi.suivi.etat === 'refuse' && <p className="erreur-texte">{envoi.suivi.message}</p>}
            <div className="dialogue-actions">
              <button className="bouton-secondaire" onClick={fermer}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
