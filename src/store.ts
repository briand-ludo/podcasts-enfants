// Tout ce qui est propre à la famille reste sur l'iPhone (IndexedDB) :
// prénoms, avatars/photos, visibilité, positions, épisodes écoutés, file de lecture.
import { get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { Catalogue } from './types'

export type EtatProfil = {
  nom?: string
  avatar?: string
  photo?: string // data URL, jamais envoyée nulle part
  visibilite: Record<string, boolean> // podcastId → visible ; absent = valeur par défaut du catalogue
  positions: Record<string, number> // episodeId → secondes
  ecoutes: Record<string, number> // episodeId → date d'écoute (ms)
  courant?: string // épisode en cours
  file: string[] // épisodes à enchaîner après le courant
  debut?: number // première ouverture du profil (sert au badge « Nouveau »)
}

type Etat = { pret: boolean; dernierProfil?: string; profils: Record<string, EtatProfil> }

const vide = (): EtatProfil => ({ visibilite: {}, positions: {}, ecoutes: {}, file: [] })

let etat: Etat = { pret: false, profils: {} }
const abonnes = new Set<() => void>()
const emettre = () => abonnes.forEach((f) => f())

export async function initStore() {
  const [dernierProfil, profils] = await Promise.all([get<string>('dernierProfil'), get<Record<string, EtatProfil>>('profils')])
  etat = { pret: true, dernierProfil, profils: profils ?? {} }
  emettre()
}

let ecriture: ReturnType<typeof setTimeout> | undefined
function sauver(immediat = false) {
  clearTimeout(ecriture)
  const f = () => set('profils', etat.profils).catch(() => {})
  if (immediat) f()
  else ecriture = setTimeout(f, 400)
}
// Quand l'app passe en arrière-plan, on écrit tout de suite.
addEventListener('pagehide', () => sauver(true))
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && sauver(true))

export function profil(id: string): EtatProfil {
  return etat.profils[id] ?? vide()
}

export function modifierProfil(id: string, f: (p: EtatProfil) => Partial<EtatProfil>, immediat = false) {
  const avant = profil(id)
  etat = { ...etat, profils: { ...etat.profils, [id]: { ...avant, ...f(avant) } } }
  sauver(immediat)
  emettre()
}

export function choisirProfil(id: string | undefined) {
  if (id && !profil(id).debut) etat = { ...etat, profils: { ...etat.profils, [id]: { ...profil(id), debut: Date.now() } } }
  etat = { ...etat, dernierProfil: id }
  sauver()
  set('dernierProfil', id).catch(() => {})
  emettre()
}

export function useStore(): Etat {
  return useSyncExternalStore(
    (f) => (abonnes.add(f), () => abonnes.delete(f)),
    () => etat,
  )
}

// ---- dérivés ----

export function nomProfil(c: Catalogue, id: string) {
  return profil(id).nom || c.profils.find((p) => p.id === id)?.nom || id
}
export function avatarProfil(c: Catalogue, id: string) {
  return profil(id).avatar || c.profils.find((p) => p.id === id)?.avatar || '🙂'
}

export function estVisible(c: Catalogue, profilId: string, podcastId: string): boolean {
  const choix = profil(profilId).visibilite[podcastId]
  if (choix !== undefined) return choix
  return c.podcasts.find((p) => p.id === podcastId)?.profils.includes(profilId) ?? false
}

export function podcastsVisibles(c: Catalogue, profilId: string) {
  return c.podcasts.filter((p) => p.nbEpisodes > 0 && estVisible(c, profilId, p.id))
}

const FENETRE_NOUVEAU = 30 * 24 * 3600 * 1000

/** « Nouveau » = pas encore écouté ni commencé, et sorti depuis peu (30 jours avant la 1re ouverture du profil, ou après). */
export function estNouveau(profilId: string, ep: { id: string; date: string | null }): boolean {
  const p = profil(profilId)
  if (p.ecoutes[ep.id] || p.positions[ep.id] || !ep.date) return false
  const depuis = Math.min(p.debut ?? Date.now(), Date.now()) - FENETRE_NOUVEAU
  return Date.parse(ep.date) >= depuis
}
