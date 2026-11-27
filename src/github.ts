// Envoi des demandes d'ajout directement depuis l'app, avec une clé GitHub « fine-grained »
// limitée à ce dépôt et au droit « Issues : lecture et écriture ».
// La clé est gardée uniquement sur cet iPhone (IndexedDB) et n'est envoyée qu'à api.github.com.
import { del, get, set } from 'idb-keyval'

const API = 'https://api.github.com'
const CLE = 'github-token'

export const lireCle = () => get<string>(CLE)
export const oublierCle = () => del(CLE)

async function api(chemin: string, cle: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cle}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!r.ok) throw new Error(r.status === 401 ? 'Clé refusée par GitHub (invalide ou expirée).' : r.status === 403 || r.status === 404 ? "La clé n'a pas le droit de créer des issues dans ce dépôt." : `GitHub : erreur ${r.status}`)
  return r.status === 204 ? null : r.json()
}

/** Vérifie la clé puis l'enregistre. Renvoie le nom du compte. */
export async function enregistrerCle(cle: string, depot: string): Promise<string> {
  cle = cle.trim()
  const user = await api('/user', cle)
  await api(`/repos/${depot}`, cle)
  await set(CLE, cle)
  return user.login
}

/** URL de création de la clé, avec les réglages préremplis quand GitHub les accepte. */
export function urlCreationCle(depot: string) {
  const [proprio] = depot.split('/')
  const q = new URLSearchParams({
    name: 'Podcasts des enfants (iPhone)',
    description: "Permet à l'app d'ouvrir les demandes d'ajout de podcast",
    target_name: proprio,
    expires_in: 'none',
    issues: 'write',
  })
  return `https://github.com/settings/personal-access-tokens/new?${q}`
}

export type Demande = { numero: number; url: string }

export async function envoyerDemande(depot: string, cle: string, titre: string, corps: string): Promise<Demande> {
  const issue = await api(`/repos/${depot}/issues`, cle, {
    method: 'POST',
    body: JSON.stringify({ title: titre, body: corps, labels: ['ajout-podcast'] }),
  })
  return { numero: issue.number, url: issue.html_url }
}

export type Suivi = { etat: 'en-cours' } | { etat: 'ajoute' | 'refuse'; message: string }

/** Où en est l'Action ? Elle ferme l'issue si le podcast est ajouté, sinon elle commente. */
export async function suivreDemande(depot: string, cle: string, numero: number): Promise<Suivi> {
  const [issue, commentaires] = await Promise.all([
    api(`/repos/${depot}/issues/${numero}`, cle),
    api(`/repos/${depot}/issues/${numero}/comments`, cle),
  ])
  const dernier: string | undefined = commentaires.at(-1)?.body
  if (issue.state === 'closed' && dernier?.startsWith('✅')) return { etat: 'ajoute', message: dernier }
  if (dernier?.startsWith('❌')) return { etat: 'refuse', message: dernier }
  return { etat: 'en-cours' }
}
