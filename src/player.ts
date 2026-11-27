// Lecteur unique de l'app : un seul élément <audio>, gardé pendant toute la vie de l'app
// (sur iOS, c'est ce qui permet d'enchaîner les épisodes écran verrouillé).
import { useSyncExternalStore } from 'react'
import type { Index } from './data'
import { estTelecharge, urlLocale } from './offline'
import { modifierProfil, profil } from './store'
import type { Episode } from './types'

export type Minuteur = { type: 'minutes'; fin: number; minutes: number } | { type: 'episode' } | null

export type EtatLecteur = {
  profilId?: string
  episode?: Episode
  enLecture: boolean
  attente: boolean
  temps: number
  duree: number
  minuteur: Minuteur
  erreur?: string
}

const RECUL = 15
const SEUIL_ECOUTE = 0.95 // au-delà de 95 %, l'épisode compte comme écouté

class Lecteur {
  private audio = new Audio()
  private idx?: Index
  private abonnes = new Set<() => void>()
  private derniereSauvegarde = 0
  private positionACharger: number | null = null
  etat: EtatLecteur = { enLecture: false, attente: false, temps: 0, duree: 0, minuteur: null }

  constructor() {
    this.audio.preload = 'metadata'
    const a = this.audio
    a.addEventListener('play', () => this.maj({ enLecture: true, erreur: undefined }))
    a.addEventListener('pause', () => {
      this.maj({ enLecture: false })
      this.sauverPosition(true)
    })
    a.addEventListener('waiting', () => this.maj({ attente: true }))
    a.addEventListener('playing', () => this.maj({ attente: false }))
    a.addEventListener('canplay', () => this.maj({ attente: false }))
    a.addEventListener('loadedmetadata', () => {
      if (this.positionACharger != null) {
        a.currentTime = this.positionACharger
        this.positionACharger = null
      }
      this.maj({ duree: a.duration })
      this.positionMediaSession()
    })
    a.addEventListener('durationchange', () => this.maj({ duree: a.duration }))
    a.addEventListener('timeupdate', () => this.surTemps())
    a.addEventListener('ended', () => this.surFin())
    a.addEventListener('error', () => {
      if (!a.src) return
      this.maj({
        enLecture: false,
        attente: false,
        erreur: navigator.onLine ? 'Lecture impossible' : 'Pas de réseau et épisode non téléchargé',
      })
    })
    this.installerMediaSession()
    // L'app peut être fermée à tout moment : on note la position exacte en partant.
    const auRevoir = () => this.sauverPosition(true)
    addEventListener('pagehide', auRevoir)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && auRevoir())
  }

  // ---------- abonnement React ----------
  abonner = (f: () => void) => (this.abonnes.add(f), () => void this.abonnes.delete(f))
  private maj(p: Partial<EtatLecteur>) {
    this.etat = { ...this.etat, ...p }
    this.abonnes.forEach((f) => f())
  }

  attacher(idx: Index) {
    this.idx = idx
  }

  // ---------- profils ----------
  /** Change de profil : on met l'autre en pause et on prépare là où ce profil s'était arrêté. */
  ouvrirProfil(profilId: string | undefined) {
    if (profilId === this.etat.profilId) return
    this.audio.pause()
    this.maj({ profilId, minuteur: null })
    const courant = profilId ? profil(profilId).courant : undefined
    const ep = courant ? this.idx?.episodes.get(courant) : undefined
    if (ep) this.charger(ep, false)
    else this.vider()
  }

  // ---------- commandes ----------
  /** Lance un épisode ; `suite` = épisodes à enchaîner ensuite. */
  jouer(episodeId: string, suite: string[]) {
    const pid = this.etat.profilId
    const ep = this.idx?.episodes.get(episodeId)
    if (!pid || !ep) return
    if (this.etat.episode?.id === episodeId) {
      modifierProfil(pid, () => ({ file: suite }))
      return void this.lecture()
    }
    modifierProfil(pid, () => ({ courant: episodeId, file: suite }), true)
    this.charger(ep, true)
  }

  lecture() {
    if (!this.audio.src) return
    this.audio.play().catch((e) => {
      if (e?.name !== 'AbortError') this.maj({ enLecture: false })
    })
  }
  pause() {
    this.audio.pause()
  }
  basculer() {
    if (this.audio.paused) this.lecture()
    else this.pause()
  }
  reculer() {
    this.audio.currentTime = Math.max(0, this.audio.currentTime - RECUL)
    this.positionMediaSession()
  }
  chercher(t: number) {
    this.audio.currentTime = Math.max(0, Math.min(t, this.audio.duration || t))
    this.positionMediaSession()
  }
  suivant(autoplay = true) {
    const pid = this.etat.profilId
    if (!pid) return
    const [prochain, ...reste] = profil(pid).file.filter((id) => this.idx?.episodes.has(id))
    const ep = prochain ? this.idx!.episodes.get(prochain)! : undefined
    if (!ep) {
      this.audio.pause()
      return
    }
    modifierProfil(pid, () => ({ courant: ep.id, file: reste }), true)
    this.charger(ep, autoplay)
  }

  definirMinuteur(m: Minuteur) {
    this.maj({ minuteur: m })
  }

  // ---------- interne ----------
  private vider() {
    this.audio.removeAttribute('src')
    this.audio.load()
    this.maj({ episode: undefined, temps: 0, duree: 0, enLecture: false, attente: false, erreur: undefined })
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }

  private charger(ep: Episode, autoplay: boolean) {
    const pid = this.etat.profilId!
    const p = profil(pid)
    const deja = p.ecoutes[ep.id] ? 0 : (p.positions[ep.id] ?? 0)
    this.positionACharger = deja > 5 ? deja - 2 : null // on recule de 2 s pour reprendre le fil
    this.audio.src = estTelecharge(ep.id) ? urlLocale(ep.id) : ep.audio
    this.maj({ episode: ep, temps: deja, duree: ep.duree ?? 0, attente: autoplay, erreur: undefined })
    this.metadataMediaSession(ep)
    if (autoplay) this.lecture()
    else this.audio.load()
  }

  private surTemps() {
    const a = this.audio
    this.maj({ temps: a.currentTime })
    this.sauverPosition()
    const m = this.etat.minuteur
    if (m?.type === 'minutes' && Date.now() >= m.fin) {
      this.maj({ minuteur: null })
      this.pause()
    }
  }

  private sauverPosition(force = false) {
    const { profilId: pid, episode: ep } = this.etat
    if (!pid || !ep || !this.audio.duration) return
    const now = Date.now()
    if (!force && now - this.derniereSauvegarde < 5000) return
    this.derniereSauvegarde = now
    const t = this.audio.currentTime
    const fini = t / this.audio.duration >= SEUIL_ECOUTE
    modifierProfil(pid, (p) => ({
      positions: { ...p.positions, [ep.id]: t },
      ecoutes: fini && !p.ecoutes[ep.id] ? { ...p.ecoutes, [ep.id]: now } : p.ecoutes,
    }), force)
  }

  private surFin() {
    const { profilId: pid, episode: ep, minuteur } = this.etat
    if (pid && ep) {
      modifierProfil(
        pid,
        (p) => {
          const positions = { ...p.positions }
          delete positions[ep.id]
          return { positions, ecoutes: { ...p.ecoutes, [ep.id]: Date.now() } }
        },
        true,
      )
    }
    if (minuteur?.type === 'episode') {
      // Minuteur « fin de l'épisode » : on prépare le suivant sans le lancer.
      this.maj({ minuteur: null })
      this.suivant(false)
      return
    }
    this.suivant(true) // lecture enchaînée
  }

  // ---------- écran verrouillé, enceinte, « À l'écoute » ----------
  private installerMediaSession() {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const h = (action: MediaSessionAction, f: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, f)
      } catch {
        /* action non gérée par ce navigateur */
      }
    }
    h('play', () => this.lecture())
    h('pause', () => this.pause())
    h('seekbackward', () => this.reculer())
    h('previoustrack', () => this.reculer())
    h('nexttrack', () => this.suivant(true))
    h('seekto', (d) => d.seekTime != null && this.chercher(d.seekTime))
  }

  private metadataMediaSession(ep: Episode) {
    if (!('mediaSession' in navigator) || !this.idx) return
    const podcast = this.idx.podcasts.get(ep.podcastId)
    const image = this.idx.image(ep)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.titre,
      artist: podcast?.titre ?? '',
      album: 'Podcasts des enfants',
      artwork: image ? [{ src: image, sizes: '512x512' }] : [],
    })
  }

  private positionMediaSession() {
    const a = this.audio
    if (!('mediaSession' in navigator) || !a.duration || !Number.isFinite(a.duration)) return
    try {
      navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: 1 })
    } catch {
      /* ignoré */
    }
  }
}

export const lecteur = new Lecteur()

export function useLecteur(): EtatLecteur {
  return useSyncExternalStore(lecteur.abonner, () => lecteur.etat)
}

// ---------- ordre de lecture ----------

/** Épisodes d'un podcast dans l'ordre d'affichage : série = du 1er au dernier, sinon les plus récents d'abord. */
export function episodesDuPodcast(idx: Index, podcastId: string): Episode[] {
  const liste = idx.parPodcast.get(podcastId) ?? []
  return idx.podcasts.get(podcastId)?.serie ? [...liste].reverse() : liste
}

/** Ce qui suit un épisode dans sa liste : c'est la file de lecture enchaînée. */
export function suiteDe(liste: Episode[], episodeId: string): string[] {
  const i = liste.findIndex((e) => e.id === episodeId)
  return liste.slice(i + 1, i + 31).map((e) => e.id)
}

/**
 * Les prochains épisodes probables d'un profil (pour « Pour la route ») :
 * l'épisode en cours et sa file, puis le plus récent non écouté de chaque podcast visible, à tour de rôle.
 */
export function prochainsEpisodes(idx: Index, profilId: string, podcastsVisibles: string[], n: number): Episode[] {
  const p = profil(profilId)
  const res: Episode[] = []
  const pris = new Set<string>()
  const ajouter = (id: string | undefined) => {
    const ep = id ? idx.episodes.get(id) : undefined
    if (ep && !pris.has(ep.id) && !p.ecoutes[ep.id] && res.length < n) {
      res.push(ep)
      pris.add(ep.id)
    }
  }
  ajouter(p.courant)
  p.file.slice(0, 2).forEach(ajouter)
  const files = podcastsVisibles.map((id) => episodesDuPodcast(idx, id).filter((e) => !p.ecoutes[e.id]))
  for (let rang = 0; res.length < n && files.some((f) => f.length > rang); rang++) for (const f of files) ajouter(f[rang]?.id)
  return res
}
