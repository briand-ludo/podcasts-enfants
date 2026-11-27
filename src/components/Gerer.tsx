import { useEffect, useState } from 'react'
import { formatOctets, type Index } from '../data'
import { espaceUtilise, oublierBlocages, stockagePersistant, supprimer, useHorsLigne } from '../offline'
import { avatarProfil, estVisible, modifierProfil, nomProfil, profil, useStore } from '../store'
import { SectionAjout } from './AjoutPodcast'
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
