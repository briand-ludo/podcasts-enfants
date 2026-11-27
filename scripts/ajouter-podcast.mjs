#!/usr/bin/env node
// Ajoute à podcasts.json le podcast demandé dans une issue (bouton « Ajouter » de la section Gérer).
// Entrée : le corps de l'issue dans la variable ISSUE_BODY. Sortie : podcasts.json modifié,
// et un résumé dans le fichier GITHUB_OUTPUT (titre, statut) pour la suite de l'Action.
import { appendFile, readFile, writeFile } from 'node:fs/promises'

const sortie = async (cle, valeur) => process.env.GITHUB_OUTPUT && appendFile(process.env.GITHUB_OUTPUT, `${cle}<<FIN\n${valeur}\nFIN\n`)
const echec = async (msg) => {
  console.error(msg)
  await sortie('statut', 'refus')
  await sortie('message', msg)
  process.exit(0)
}

const bloc = (process.env.ISSUE_BODY ?? '').match(/```json\s*([\s\S]*?)```/)
if (!bloc) await echec("Pas de bloc JSON dans l'issue.")
let demande
try {
  demande = JSON.parse(bloc[1])
} catch {
  await echec('Bloc JSON illisible.')
}
const appleId = Number(demande.appleId)
if (!Number.isInteger(appleId) || appleId <= 0) await echec('appleId invalide.')

const catalogue = JSON.parse(await readFile('podcasts.json', 'utf8'))
const profilsConnus = catalogue.profils.map((p) => p.id)
const profils = (Array.isArray(demande.profils) ? demande.profils : profilsConnus).filter((p) => profilsConnus.includes(p))
if (!profils.length) await echec('Aucun profil valide.')
if (catalogue.podcasts.some((p) => p.appleId === appleId)) await echec('Ce podcast est déjà dans le catalogue.')

// On ne fait pas confiance au titre de l'issue : on redemande à Apple.
const json = await (await fetch(`https://itunes.apple.com/lookup?id=${appleId}&country=FR&entity=podcast`)).json()
const info = json.results?.[0]
if (!info) await echec(`Id ${appleId} inconnu chez Apple.`)

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `podcast-${appleId}`
let id = slug(info.collectionName)
while (catalogue.podcasts.some((p) => p.id === id)) id += '-2'

catalogue.podcasts.push({
  id,
  titre: info.collectionName,
  producteur: info.artistName ?? '',
  appleId,
  verifie: true,
  feedUrl: null,
  profils,
  remarque: `Ajouté depuis l'app le ${new Date().toISOString().slice(0, 10)}.${info.feedUrl ? '' : ' ⚠️ Apple ne fournit pas de flux : renseigner feedUrl.'}`,
})
await writeFile('podcasts.json', JSON.stringify(catalogue, null, 2) + '\n')
console.log(`Ajouté : ${info.collectionName} (${id}) pour ${profils.join(', ')}`)
await sortie('statut', 'ajoute')
await sortie('titre', info.collectionName)
await sortie('message', info.feedUrl ? 'Le flux RSS a été trouvé.' : "⚠️ Apple ne fournit pas de flux RSS pour ce podcast : il faudra renseigner `feedUrl` à la main dans podcasts.json.")
