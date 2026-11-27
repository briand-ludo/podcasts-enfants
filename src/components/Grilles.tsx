import { useEffect, useRef, useState } from 'react'
import { formatDate, formatDuree, type Index } from '../data'
import { estTelecharge, useHorsLigne } from '../offline'
import { episodesDuPodcast, lecteur, suiteDe, useLecteur } from '../player'
import { avatarProfil, choisirProfil, estNouveau, podcastsVisibles, profil, useStore } from '../store'
import type { Episode } from '../types'
import { Coche, Etoile, Fleche, Horloge, Lecture, Pause, Retour } from './Icones'

/** Pseudo-podcast : tous les épisodes visibles du profil, du plus récent au plus ancien. */
export const RECENTS = '__recents'

function useEnLigne() {
  const [enLigne, set] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => set(true)
    const off = () => set(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => (removeEventListener('online', on), removeEventListener('offline', off))
  }, [])
  return enLigne
}

function Vignette({ src, className = 'vignette' }: { src: string | null; className?: string }) {
  return src ? <img className={className} src={src} alt="" loading="lazy" decoding="async" /> : <div className={`${className} vide`} />
}

// ---------- accueil d'un profil : les podcasts ----------

export function EcranAccueil({ idx, profilId, ouvrirPodcast, ouvrirLecteur }: { idx: Index; profilId: string; ouvrirPodcast: (id: string) => void; ouvrirLecteur: () => void }) {
  useStore()
  const c = idx.catalogue
  const l = useLecteur()
  const couleur = c.profils.find((p) => p.id === profilId)?.couleur
  const photo = profil(profilId).photo
  const podcasts = podcastsVisibles(c, profilId)

  return (
    <div className="ecran" style={{ '--couleur': couleur } as React.CSSProperties}>
      <header className="entete">
        <button className="pastille-profil" onClick={() => choisirProfil(undefined)} aria-label="Changer de profil">
          {photo ? <img src={photo} alt="" /> : avatarProfil(c, profilId)}
        </button>
      </header>

      {l.episode && (
        <button className="reprendre" onClick={() => (l.enLecture ? ouvrirLecteur() : (lecteur.lecture(), ouvrirLecteur()))} aria-label="Reprendre">
          <Vignette src={idx.image(l.episode)} className="reprendre-image" />
          <span className="reprendre-texte">
            <span className="reprendre-titre">{l.episode.titre}</span>
            <span className="barre-progression"><span style={{ width: `${l.duree ? (100 * l.temps) / l.duree : 0}%` }} /></span>
          </span>
          <span className="reprendre-bouton">{l.enLecture ? <Pause taille={34} /> : <Lecture taille={34} />}</span>
        </button>
      )}

      <div className="grille grille-podcasts">
        {(() => {
          const nouveaux = podcasts.reduce((n, p) => n + (idx.parPodcast.get(p.id) ?? []).filter((e) => estNouveau(profilId, e)).length, 0)
          return (
            <button className="tuile" onClick={() => ouvrirPodcast(RECENTS)} aria-label="Les plus récents">
              <span className="vignette vignette-recents">
                <Horloge taille={72} />
              </span>
              {nouveaux > 0 && (
                <span className="badge-nouveau" aria-label={`${nouveaux} nouveaux`}>
                  <Etoile taille={18} />
                  {nouveaux}
                </span>
              )}
            </button>
          )
        })()}
        {podcasts.map((p) => {
          const nouveaux = (idx.parPodcast.get(p.id) ?? []).filter((e) => estNouveau(profilId, e)).length
          return (
            <button key={p.id} className="tuile" onClick={() => ouvrirPodcast(p.id)} aria-label={p.titre}>
              <Vignette src={p.image} />
              {nouveaux > 0 && (
                <span className="badge-nouveau" aria-label={`${nouveaux} nouveaux`}>
                  <Etoile taille={18} />
                  {nouveaux}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- un podcast : ses épisodes ----------

const PAR_PAGE = 40

export function EcranPodcast({ idx, profilId, podcastId, retour, ouvrirLecteur }: { idx: Index; profilId: string; podcastId: string; retour: () => void; ouvrirLecteur: () => void }) {
  useStore()
  useHorsLigne()
  const l = useLecteur()
  const enLigne = useEnLigne()
  const recents = podcastId === RECENTS
  const podcast = recents ? undefined : idx.podcasts.get(podcastId)
  // Le catalogue est déjà trié du plus récent au plus ancien.
  const liste = recents
    ? (() => {
        const visibles = new Set(podcastsVisibles(idx.catalogue, profilId).map((p) => p.id))
        return idx.catalogue.episodes.filter((e) => visibles.has(e.podcastId))
      })()
    : episodesDuPodcast(idx, podcastId)
  const [nb, setNb] = useState(PAR_PAGE)
  const fin = useRef<HTMLDivElement>(null)
  const couleur = idx.catalogue.profils.find((p) => p.id === profilId)?.couleur

  useEffect(() => {
    const el = fin.current
    if (!el) return
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && setNb((n) => n + PAR_PAGE), { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [podcastId])

  const p = profil(profilId)
  const jouer = (ep: Episode) => {
    if (l.episode?.id === ep.id && l.enLecture) return ouvrirLecteur()
    lecteur.jouer(ep.id, suiteDe(liste, ep.id))
    ouvrirLecteur()
  }

  return (
    <div className="ecran" style={{ '--couleur': couleur } as React.CSSProperties}>
      <header className="entete">
        <button className="bouton-rond" onClick={retour} aria-label="Retour">
          <Retour taille={30} />
        </button>
        {recents ? (
          <span className="entete-image vignette-recents">
            <Horloge taille={32} />
          </span>
        ) : (
          <Vignette src={podcast?.image ?? null} className="entete-image" />
        )}
        <h1 className="entete-titre">{recents ? 'Les plus récents' : podcast?.titre}</h1>
      </header>

      <div className="grille grille-episodes">
        {liste.slice(0, nb).map((ep) => {
          const telecharge = estTelecharge(ep.id)
          const indispo = !enLigne && !telecharge
          const pos = p.positions[ep.id]
          const ecoute = !!p.ecoutes[ep.id]
          const courant = l.episode?.id === ep.id
          return (
            <button key={ep.id} className={`tuile tuile-episode${ecoute ? ' ecoute' : ''}${courant ? ' courant' : ''}`} disabled={indispo} onClick={() => jouer(ep)}>
              <span className="tuile-image">
                <Vignette src={idx.image(ep)} />
                {estNouveau(profilId, ep) && (
                  <span className="badge-nouveau" aria-label="Nouveau">
                    <Etoile taille={18} />
                  </span>
                )}
                {ecoute && <span className="badge-ecoute" aria-label="Déjà écouté"><Coche taille={20} /></span>}
                {telecharge && <span className="badge-telecharge" aria-label="Téléchargé"><Fleche taille={16} /></span>}
                {courant && <span className="badge-lecture">{l.enLecture ? <Pause taille={30} /> : <Lecture taille={30} />}</span>}
                {!ecoute && pos && ep.duree ? (
                  <span className="barre-progression sur-image"><span style={{ width: `${Math.min(100, (100 * pos) / ep.duree)}%` }} /></span>
                ) : null}
              </span>
              <span className="tuile-titre">{ep.titre}</span>
              <span className="tuile-duree">{[formatDate(ep.date), formatDuree(ep.duree)].filter(Boolean).join(' · ')}</span>
            </button>
          )
        })}
      </div>
      <div ref={fin} />
    </div>
  )
}
