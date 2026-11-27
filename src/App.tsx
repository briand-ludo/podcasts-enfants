import { useEffect, useState } from 'react'

type Etat = { genereLe: string; podcasts: { titre: string; statut: string; nbEpisodes: number }[]; episodes: unknown[] }

// Écran provisoire (étape 4) : prouve que episodes.json est bien généré et servi.
export default function App() {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}episodes.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setEtat)
      .catch((e) => setErreur(String(e)))
  }, [])

  return (
    <main className="placeholder">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={96} height={96} />
      <h1>Podcasts des enfants</h1>
      {erreur && <p>Impossible de lire les épisodes : {erreur}</p>}
      {!etat && !erreur && <p>Chargement…</p>}
      {etat && (
        <>
          <p>
            {etat.episodes.length} épisodes · mis à jour le {new Date(etat.genereLe).toLocaleString('fr-FR')}
          </p>
          <ul style={{ textAlign: 'left', listStyle: 'none', padding: 0 }}>
            {etat.podcasts.map((p) => (
              <li key={p.titre}>
                {p.statut === 'ok' ? '✅' : p.statut === 'erreur' ? '❌' : '⚪'} {p.titre} ({p.nbEpisodes})
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
