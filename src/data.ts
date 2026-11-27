import type { Catalogue, Episode, Podcast, Suggestion } from './types'

const BASE = import.meta.env.BASE_URL

export async function chargerCatalogue(): Promise<Catalogue> {
  const r = await fetch(`${BASE}episodes.json`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`episodes.json : HTTP ${r.status}`)
  return r.json()
}

export async function chargerSuggestions(): Promise<Suggestion[]> {
  try {
    const r = await fetch(`${BASE}suggestions.json`, { cache: 'no-cache' })
    if (!r.ok) return []
    return (await r.json()).suggestions ?? []
  } catch {
    return []
  }
}

/** Index pratique construit une fois par catalogue. */
export class Index {
  readonly episodes = new Map<string, Episode>()
  readonly podcasts = new Map<string, Podcast>()
  readonly parPodcast = new Map<string, Episode[]>()

  readonly catalogue: Catalogue

  constructor(catalogue: Catalogue) {
    this.catalogue = catalogue
    for (const p of catalogue.podcasts) {
      this.podcasts.set(p.id, p)
      this.parPodcast.set(p.id, [])
    }
    for (const e of catalogue.episodes) {
      this.episodes.set(e.id, e)
      this.parPodcast.get(e.podcastId)?.push(e)
    }
  }

  image(e: Episode): string | null {
    return e.image ?? this.podcasts.get(e.podcastId)?.image ?? null
  }
}

/** Le dépôt GitHub : celui annoncé par l'Action, sinon déduit de l'adresse <compte>.github.io/<repo>/. */
export function depotGitHub(c: Catalogue): string | null {
  if (c.depot) return c.depot
  const m = location.hostname.match(/^([^.]+)\.github\.io$/)
  const repo = location.pathname.split('/').filter(Boolean)[0]
  return m && repo ? `${m[1]}/${repo}` : null
}

export function formatDuree(s: number | null | undefined): string {
  if (!s || !Number.isFinite(s)) return ''
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function formatTemps(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`
}

export function formatOctets(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / 1024 / 1024)} Mo`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} Go`
}
