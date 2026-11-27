import { useEffect, useState } from 'react'
import { formatTemps, type Index } from '../data'
import { lecteur, useLecteur, type Minuteur } from '../player'
import { Bas, Lecture, Lune, Pause, Recul15, Suivant } from './Icones'

/** Re-rend chaque seconde tant que le minuteur tourne. */
function useTicTac(actif: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!actif) return
    const i = setInterval(() => set((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [actif])
}

function BoutonLecture({ taille }: { taille: number }) {
  const l = useLecteur()
  return (
    <button className={`bouton-lecture${l.attente ? ' attente' : ''}`} onClick={() => lecteur.basculer()} aria-label={l.enLecture ? 'Pause' : 'Lecture'}>
      {l.enLecture ? <Pause taille={taille} /> : <Lecture taille={taille} />}
    </button>
  )
}

export function MiniLecteur({ idx, ouvrir }: { idx: Index; ouvrir: () => void }) {
  const l = useLecteur()
  if (!l.episode) return null
  return (
    <div className="mini-lecteur">
      <button className="mini-infos" onClick={ouvrir} aria-label="Ouvrir le lecteur">
        <img src={idx.image(l.episode) ?? ''} alt="" />
        <span className="mini-titre">{l.episode.titre}</span>
      </button>
      <BoutonLecture taille={34} />
      <span className="mini-progression" style={{ width: `${l.duree ? (100 * l.temps) / l.duree : 0}%` }} />
    </div>
  )
}

const CHOIX_MINUTEUR: { label: string; m: (now: number) => Minuteur }[] = [
  { label: '15', m: (now) => ({ type: 'minutes', minutes: 15, fin: now + 15 * 60_000 }) },
  { label: '30', m: (now) => ({ type: 'minutes', minutes: 30, fin: now + 30 * 60_000 }) },
  { label: '45', m: (now) => ({ type: 'minutes', minutes: 45, fin: now + 45 * 60_000 }) },
]

export function GrandLecteur({ idx, fermer }: { idx: Index; fermer: () => void }) {
  const l = useLecteur()
  const [menuMinuteur, setMenuMinuteur] = useState(false)
  useTicTac(l.minuteur?.type === 'minutes')
  const [glisse, setGlisse] = useState<number | null>(null)

  if (!l.episode) return null
  const podcast = idx.podcasts.get(l.episode.podcastId)
  const restant = l.minuteur?.type === 'minutes' ? Math.max(0, Math.ceil((l.minuteur.fin - Date.now() - 500) / 60_000)) : null
  const temps = glisse ?? l.temps

  return (
    <div className="grand-lecteur" role="dialog" aria-label="Lecteur">
      <button className="bouton-rond fermer" onClick={fermer} aria-label="Réduire">
        <Bas taille={32} />
      </button>

      <img className="grande-image" src={idx.image(l.episode) ?? ''} alt="" />
      <div className="grand-titre">{l.episode.titre}</div>
      <div className="grand-podcast">{podcast?.titre}</div>

      <div className="progression">
        <input
          type="range"
          min={0}
          max={l.duree || 1}
          step={1}
          value={temps}
          onChange={(e) => setGlisse(Number(e.target.value))}
          onPointerUp={() => glisse != null && (lecteur.chercher(glisse), setGlisse(null))}
          onTouchEnd={() => glisse != null && (lecteur.chercher(glisse), setGlisse(null))}
          aria-label="Position"
          style={{ '--pct': `${l.duree ? (100 * temps) / l.duree : 0}%` } as React.CSSProperties}
        />
        <div className="temps">
          <span>{formatTemps(temps)}</span>
          <span>-{formatTemps((l.duree || 0) - temps)}</span>
        </div>
      </div>

      {l.erreur && <div className="erreur-lecture">{l.erreur}</div>}

      <div className="commandes">
        <button className="bouton-commande" onClick={() => lecteur.reculer()} aria-label="Reculer de 15 secondes">
          <Recul15 taille={52} />
        </button>
        <BoutonLecture taille={84} />
        <button className="bouton-commande" onClick={() => lecteur.suivant(true)} aria-label="Épisode suivant">
          <Suivant taille={48} />
        </button>
      </div>

      <div className="minuteur">
        <button className={`bouton-minuteur${l.minuteur ? ' actif' : ''}`} onClick={() => setMenuMinuteur((v) => !v)} aria-label="Minuteur de sommeil">
          <Lune taille={26} />
          {restant != null && <span>{restant} min</span>}
          {l.minuteur?.type === 'episode' && <span>fin de l'épisode</span>}
        </button>
        {menuMinuteur && (
          <div className="menu-minuteur">
            {CHOIX_MINUTEUR.map((c) => (
              <button key={c.label} onClick={() => (lecteur.definirMinuteur(c.m(Date.now())), setMenuMinuteur(false))}>
                {c.label} min
              </button>
            ))}
            <button onClick={() => (lecteur.definirMinuteur({ type: 'episode' }), setMenuMinuteur(false))}>Fin de l'épisode</button>
            {l.minuteur && (
              <button className="annuler" onClick={() => (lecteur.definirMinuteur(null), setMenuMinuteur(false))}>
                Arrêter le minuteur
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
