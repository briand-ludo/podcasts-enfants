import { useEffect, useMemo, useState } from 'react'
import { chargerSuggestions, depotGitHub, formatOctets, type Index } from '../data'
import { espaceUtilise, oublierBlocages, stockagePersistant, supprimer, useHorsLigne } from '../offline'
import { avatarProfil, estVisible, modifierProfil, nomProfil, profil, useStore } from '../store'
import type { Suggestion } from '../types'
import { Retour, Voiture } from './Icones'

const AVATARS = ['🐻', '🦊', '🐰', '🐱', '🐶', '🐼', '🦁', '🐸', '🐵', '🦄', '🐯', '🐨', '🐧', '🐢', '🦖', '🚀']

type Props = { idx: Index; fermer: () => void; pourLaRoute: () => void }

export function EcranGerer({ idx, fermer, pourLaRoute }: Props) {
  useStore()
  return (
    <div className="ecran ecran-gerer">
      <header className="entete">
        <button className="bouton-rond" onClick={fermer} aria-label="Retour">
          <Retour taille={30} />
        </button>
        <h1 className="entete-titre">Gérer</h1>
      </header>
      <SectionProfils idx={idx} />
      <SectionVisibilite idx={idx} />
      <SectionHorsLigne idx={idx} pourLaRoute={pourLaRoute} />
      <SectionAjout idx={idx} />
      <SectionCatalogue idx={idx} />
    </div>
  )
}

// ---------- profils (prénom, avatar, photo : uniquement sur cet iPhone) ----------

function SectionProfils({ idx }: { idx: Index }) {
  const c = idx.catalogue
  return (
    <section className="carte">
      <h2>Les enfants</h2>
      <p className="aide">Prénoms et photos restent sur cet iPhone : ils ne sont jamais envoyés sur GitHub.</p>
      {c.profils.map((p) => {
        const e = profil(p.id)
        return (
          <div key={p.id} className="ligne-profil">
            <span className="avatar-moyen" style={{ background: p.couleur }}>
              {e.photo ? <img src={e.photo} alt="" /> : avatarProfil(c, p.id)}
            </span>
            <div className="ligne-profil-champs">
              <input
                className="champ"
                value={e.nom ?? ''}
                placeholder={nomProfil(c, p.id)}
                onChange={(ev) => modifierProfil(p.id, () => ({ nom: ev.target.value }))}
                aria-label="Prénom"
              />
              <div className="choix-avatars">
                {AVATARS.map((a) => (
                  <button key={a} className={avatarProfil(c, p.id) === a && !e.photo ? 'choisi' : ''} onClick={() => modifierProfil(p.id, () => ({ avatar: a, photo: undefined }))}>
                    {a}
                  </button>
                ))}
              </div>
              <label className="bouton-secondaire">
                Choisir une photo
                <input type="file" accept="image/*" hidden onChange={(ev) => ev.target.files?.[0] && photoReduite(ev.target.files[0]).then((photo) => modifierProfil(p.id, () => ({ photo }), true))} />
              </label>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Recadre en carré 320 px pour ne pas stocker une photo de plusieurs Mo. */
function photoReduite(f: File): Promise<string> {
  return new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const t = 320
      const cote = Math.min(img.width, img.height)
      const cv = document.createElement('canvas')
      cv.width = cv.height = t
      cv.getContext('2d')!.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, t, t)
      URL.revokeObjectURL(img.src)
      ok(cv.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = ko
    img.src = URL.createObjectURL(f)
  })
}

// ---------- qui voit quoi ----------

function SectionVisibilite({ idx }: { idx: Index }) {
  const c = idx.catalogue
  return (
    <section className="carte">
      <h2>Ce que chaque enfant voit</h2>
      <div className="table-visibilite">
        {c.podcasts.map((p) => (
          <div key={p.id} className="ligne-podcast">
            {p.image ? <img src={p.image} alt="" /> : <span className="image-vide" />}
            <span className="ligne-podcast-titre">
              {p.titre}
              {p.statut !== 'ok' && <small className={`statut ${p.statut}`}>{p.statut === 'erreur' ? 'flux en erreur' : 'pas de flux'}</small>}
            </span>
            {c.profils.map((pr) => {
              const vu = estVisible(c, pr.id, p.id)
              return (
                <button
                  key={pr.id}
                  className={`interrupteur${vu ? ' actif' : ''}`}
                  style={{ '--couleur': pr.couleur } as React.CSSProperties}
                  aria-pressed={vu}
                  aria-label={`${nomProfil(c, pr.id)} voit ${p.titre}`}
                  onClick={() => modifierProfil(pr.id, (e) => ({ visibilite: { ...e.visibilite, [p.id]: !vu } }))}
                >
                  {profil(pr.id).photo ? <img src={profil(pr.id).photo} alt="" /> : avatarProfil(c, pr.id)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------- hors-ligne ----------

function SectionHorsLigne({ idx, pourLaRoute }: { idx: Index; pourLaRoute: () => void }) {
  const h = useHorsLigne()
  const [persistant, setPersistant] = useState<boolean | null>(null)
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null)
  const ids = Object.keys(h.telecharges)

  useEffect(() => {
    stockagePersistant().then(setPersistant)
    navigator.storage?.estimate?.().then((e) => setQuota({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
  }, [ids.length])

  const bloques = Object.entries(h.bloques)
  return (
    <section className="carte">
      <h2>Pour la route (hors-ligne)</h2>
      <p className="aide">Télécharge les 5 prochains épisodes de chaque enfant. Les épisodes déjà écoutés sont retirés à chaque fois.</p>
      <button className="bouton-principal" onClick={pourLaRoute} disabled={!!h.enCours}>
        <Voiture taille={24} /> {h.enCours ? `Téléchargement ${h.enCours.fait + 1}/${h.enCours.total}…` : 'Pour la route'}
      </button>
      <dl className="infos">
        <dt>Épisodes téléchargés</dt>
        <dd>
          {ids.length} · {formatOctets(espaceUtilise(h.telecharges))}
        </dd>
        {quota && (
          <>
            <dt>Espace utilisé par l'app</dt>
            <dd>{formatOctets(quota.usage)}</dd>
          </>
        )}
        <dt>Stockage protégé</dt>
        <dd>
          {persistant === true && 'Oui ✅'}
          {persistant === false && (
            <>
              Non : iOS peut effacer les téléchargements si l'app sert peu.{' '}
              <button className="lien" onClick={() => stockagePersistant(true).then(setPersistant)}>
                Demander
              </button>
            </>
          )}
          {persistant === null && 'Non disponible sur ce navigateur'}
        </dd>
      </dl>
      {bloques.length > 0 && (
        <div className="avertissement">
          <strong>Streaming seul</strong> (l'hébergeur refuse le téléchargement, CORS) :
          <ul>
            {bloques.map(([pid, hote]) => (
              <li key={pid}>
                {idx.podcasts.get(pid)?.titre ?? pid} <small>({hote})</small>
              </li>
            ))}
          </ul>
          <button className="lien" onClick={oublierBlocages}>
            Réessayer ces podcasts
          </button>
        </div>
      )}
      {ids.length > 0 && (
        <button className="bouton-secondaire danger" onClick={() => confirm('Supprimer tous les épisodes téléchargés ?') && supprimer(ids)}>
          Tout supprimer
        </button>
      )}
    </section>
  )
}

// ---------- ajouter un podcast ----------

type Resultat = Suggestion

function SectionAjout({ idx }: { idx: Index }) {
  const c = idx.catalogue
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState<Resultat[] | null>(null)
  const [choix, setChoix] = useState<Resultat | null>(null)
  const dejaLa = useMemo(() => new Set(c.podcasts.map((p) => p.appleId)), [c])
  const depot = depotGitHub(c)

  useEffect(() => {
    chargerSuggestions().then(setSuggestions)
  }, [])

  const chercher = async (e: React.FormEvent) => {
    e.preventDefault()
    const lien = q.match(/id(\d{6,})/)
    const url = lien
      ? `https://itunes.apple.com/lookup?id=${lien[1]}&country=FR&entity=podcast`
      : `https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: 'podcast', country: 'FR', limit: '12' })}`
    try {
      const json = await (await fetch(url)).json()
      setResultats(
        (json.results ?? [])
          .filter((r: { kind?: string; wrapperType?: string }) => r.kind === 'podcast' || r.wrapperType === 'track')
          .map((r: Record<string, string | number>) => ({
            appleId: Number(r.collectionId),
            titre: String(r.collectionName),
            producteur: String(r.artistName ?? ''),
            image: (r.artworkUrl600 as string) ?? null,
            resume: r.feedUrl ? '' : '⚠️ Apple ne fournit pas de flux RSS pour ce podcast',
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
      {choix && <DialogueAjout idx={idx} podcast={choix} depot={depot} fermer={() => setChoix(null)} />}
    </section>
  )
}

function DialogueAjout({ idx, podcast, depot, fermer }: { idx: Index; podcast: Resultat; depot: string | null; fermer: () => void }) {
  const c = idx.catalogue
  const [profils, setProfils] = useState<string[]>(c.profils.map((p) => p.id))
  const corps = [
    '<!-- ajout-podcast -->',
    "Ajout demandé depuis l'app. Fermer l'issue sans la soumettre suffit pour annuler.",
    '',
    '```json',
    JSON.stringify({ appleId: podcast.appleId, titre: podcast.titre, producteur: podcast.producteur, profils }, null, 2),
    '```',
  ].join('\n')
  const url = depot
    ? `https://github.com/${depot}/issues/new?${new URLSearchParams({ title: `Ajouter : ${podcast.titre}`, labels: 'ajout-podcast', body: corps })}`
    : null
  return (
    <div className="voile" onClick={fermer}>
      <div className="dialogue" onClick={(e) => e.stopPropagation()}>
        {podcast.image && <img src={podcast.image} alt="" className="dialogue-image" />}
        <h3>{podcast.titre}</h3>
        <p className="aide">{podcast.producteur}</p>
        <p>Pour qui ?</p>
        <div className="choix-profils">
          {c.profils.map((p) => (
            <label key={p.id} className="case">
              <input type="checkbox" checked={profils.includes(p.id)} onChange={(e) => setProfils((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
              {avatarProfil(c, p.id)} {nomProfil(c, p.id)}
            </label>
          ))}
        </div>
        <p className="aide">
          Ouvre une issue GitHub préremplie. Une fois l'issue créée, une GitHub Action ajoute le podcast au catalogue ; il apparaît après le prochain
          rafraîchissement (quelques minutes).
        </p>
        <div className="dialogue-actions">
          <button className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          {url ? (
            <a className="bouton-principal" href={url} target="_blank" rel="noopener" onClick={fermer} aria-disabled={!profils.length}>
              Ouvrir GitHub
            </a>
          ) : (
            <span className="aide">Dépôt GitHub inconnu</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- état du catalogue ----------

function SectionCatalogue({ idx }: { idx: Index }) {
  const c = idx.catalogue
  const problemes = c.podcasts.filter((p) => p.statut !== 'ok')
  return (
    <section className="carte">
      <h2>Catalogue</h2>
      <p className="aide">
        Mis à jour le {new Date(c.genereLe).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} · {c.episodes.length} épisodes ·{' '}
        {c.podcasts.length} podcasts
      </p>
      {problemes.length > 0 && (
        <ul className="liste-problemes">
          {problemes.map((p) => (
            <li key={p.id}>
              <strong>{p.titre}</strong> : {p.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
