export type ProfilCatalogue = { id: string; nom: string; age: number; avatar: string; couleur: string }

export type Podcast = {
  id: string
  titre: string
  appleId: number | null
  profils: string[]
  image: string | null
  feedUrl: string | null
  statut: 'ok' | 'erreur' | 'sans-flux'
  message?: string
  nbEpisodes: number
  serie?: boolean
}

export type Episode = {
  id: string
  podcastId: string
  titre: string
  date: string | null
  duree: number | null
  audio: string
  type: string
  taille: number | null
  image?: string
}

export type Catalogue = {
  genereLe: string
  depot: string | null
  profils: ProfilCatalogue[]
  podcasts: Podcast[]
  episodes: Episode[]
}

export type Suggestion = { appleId: number; titre: string; producteur: string; image: string | null; resume: string }
