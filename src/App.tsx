import { useCallback, useEffect, useState } from 'react'
import { chargerCatalogue, Index } from './data'
import { initHorsLigne, stockagePersistant, supprimer, telecharger, useHorsLigne, type Bilan } from './offline'
import { lecteur, prochainsEpisodes } from './player'
import { initStore, podcastsVisibles, profil, useStore } from './store'
import { EcranAccueil, EcranPodcast } from './components/Grilles'
import { EcranGerer } from './components/Gerer'
import { GrandLecteur, MiniLecteur } from './components/Lecteur'
import { EcranProfils } from './components/Profils'

type Vue = { ecran: 'accueil' } | { ecran: 'podcast'; id: string } | { ecran: 'gerer' }

export default function App() {
  const [idx, setIdx] = useState<Index | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [vue, setVue] = useState<Vue>({ ecran: 'accueil' })
  const [lecteurOuvert, setLecteurOuvert] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const store = useStore()
  const horsLigne = useHorsLigne()

  useEffect(() => {
    Promise.all([chargerCatalogue(), initStore(), initHorsLigne()])
      .then(([c]) => {
        const i = new Index(c)
        lecteur.attacher(i)
        setIdx(i)
      })
      .catch((e) => setErreur(String(e)))
  }, [])

  // Changement de profil → le lecteur reprend là où ce profil s'était arrêté.
  const profilId = store.pret && idx ? store.dernierProfil : undefined
  useEffect(() => {
    if (idx) lecteur.ouvrirProfil(profilId)
    setVue((v) => (v.ecran === 'gerer' ? v : { ecran: 'accueil' }))
    setLecteurOuvert(false)
  }, [profilId, idx])

  // Bouton « retour » d'iOS / Android : revenir d'un podcast à l'accueil.
  useEffect(() => {
    const surRetour = () => (setLecteurOuvert(false), setVue({ ecran: 'accueil' }))
    addEventListener('popstate', surRetour)
    return () => removeEventListener('popstate', surRetour)
  }, [])
  const aller = (v: Vue) => {
    if (v.ecran !== 'accueil') history.pushState(null, '')
    setVue(v)
  }

  const pourLaRoute = useCallback(async () => {
    if (!idx || horsLigne.enCours) return
    const c = idx.catalogue
    stockagePersistant(true)
    // Ménage : retirer ce que tous les enfants ont déjà écouté.
    const ecoutesParTous = Object.keys(horsLigne.telecharges).filter((id) => c.profils.every((p) => profil(p.id).ecoutes[id]))
    if (ecoutesParTous.length) await supprimer(ecoutesParTous)
    const aTelecharger = c.profils.flatMap((p) =>
      prochainsEpisodes(idx, p.id, podcastsVisibles(c, p.id).map((x) => x.id), 5),
    )
    setMessage('Téléchargement en cours…')
    const b: Bilan = await telecharger(aTelecharger, (e) => idx.image(e))
    const bloques = b.cors.map((id) => idx.podcasts.get(id)?.titre ?? id)
    setMessage(
      [
        `🚗 ${b.ok + b.dejaLa} épisode(s) prêts hors-ligne` + (b.ok ? ` (${b.ok} nouveaux)` : ''),
        bloques.length ? `Streaming seul : ${bloques.join(', ')}` : '',
        b.erreurs ? `${b.erreurs} échec(s) réseau` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }, [idx, horsLigne])

  useEffect(() => {
    if (!message || horsLigne.enCours) return
    const t = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(t)
  }, [message, horsLigne.enCours])

  if (erreur) return <div className="ecran centre">😕<p>{erreur}</p><button className="bouton-principal" onClick={() => location.reload()}>Réessayer</button></div>
  if (!idx || !store.pret) return <div className="ecran centre"><div className="chargement" /></div>

  const enCours = horsLigne.enCours
  const bandeau = (enCours || message) && (
    <div className="bandeau" role="status" onClick={() => !enCours && setMessage(null)}>
      {enCours ? `🚗 Téléchargement ${Math.min(enCours.fait + 1, enCours.total)}/${enCours.total}${enCours.episode ? ` · ${enCours.episode}` : ''}` : message}
    </div>
  )

  let contenu
  if (vue.ecran === 'gerer') contenu = <EcranGerer idx={idx} fermer={() => history.back()} pourLaRoute={pourLaRoute} />
  else if (!profilId) contenu = <EcranProfils catalogue={idx.catalogue} ouvrirGerer={() => aller({ ecran: 'gerer' })} pourLaRoute={pourLaRoute} />
  else if (vue.ecran === 'podcast')
    contenu = <EcranPodcast idx={idx} profilId={profilId} podcastId={vue.id} retour={() => history.back()} ouvrirLecteur={() => setLecteurOuvert(true)} />
  else contenu = <EcranAccueil idx={idx} profilId={profilId} ouvrirPodcast={(id) => aller({ ecran: 'podcast', id })} ouvrirLecteur={() => setLecteurOuvert(true)} />

  return (
    <>
      {contenu}
      {profilId && vue.ecran !== 'gerer' && !lecteurOuvert && <MiniLecteur idx={idx} ouvrir={() => setLecteurOuvert(true)} />}
      {profilId && lecteurOuvert && <GrandLecteur idx={idx} fermer={() => setLecteurOuvert(false)} />}
      {bandeau}
    </>
  )
}
