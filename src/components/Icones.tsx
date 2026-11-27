// Icônes en SVG (les enfants ne lisent pas : tout passe par les images et les pictos).
type P = { taille?: number }
const svg = (taille: number, children: React.ReactNode, vb = '0 0 24 24') => (
  <svg width={taille} height={taille} viewBox={vb} fill="currentColor" aria-hidden="true">
    {children}
  </svg>
)

export const Lecture = ({ taille = 24 }: P) => svg(taille, <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />)
export const Pause = ({ taille = 24 }: P) =>
  svg(taille, <><rect x="6" y="4.5" width="4.2" height="15" rx="1.4" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" /></>)
export const Suivant = ({ taille = 24 }: P) =>
  svg(taille, <><path d="M4 5.6v12.8a1 1 0 0 0 1.53.85l9.6-6.4a1 1 0 0 0 0-1.7l-9.6-6.4A1 1 0 0 0 4 5.6Z" /><rect x="17" y="4.5" width="3" height="15" rx="1.2" /></>)
export const Recul15 = ({ taille = 24 }: P) =>
  svg(
    taille,
    <>
      <path d="M12 4a8 8 0 1 1-7.75 10h2.1A6 6 0 1 0 12 6v3L7.5 5 12 1v3Z" />
      <text x="12.2" y="16.4" fontSize="7.2" fontWeight="800" textAnchor="middle" fontFamily="system-ui">15</text>
    </>,
  )
export const Lune = ({ taille = 24 }: P) => svg(taille, <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />)
export const Voiture = ({ taille = 24 }: P) =>
  svg(
    taille,
    <path d="M5.5 10.5 7.2 6.4A2 2 0 0 1 9.05 5.2h5.9a2 2 0 0 1 1.85 1.2l1.7 4.1A2.5 2.5 0 0 1 20.5 13v3.5a1 1 0 0 1-1 1h-.6a2.25 2.25 0 0 1-4.4 0H9.5a2.25 2.25 0 0 1-4.4 0h-.6a1 1 0 0 1-1-1V13a2.5 2.5 0 0 1 2-2.5Zm2.2-.1h8.6l-1.3-3.2a.6.6 0 0 0-.55-.4h-4.9a.6.6 0 0 0-.55.4Z" />,
  )
export const Engrenage = ({ taille = 24 }: P) =>
  svg(
    taille,
    <path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8a7 7 0 0 1 0 2l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.7-.9l-2.5.9-1.7-2.9 2-1.8a7 7 0 0 1 0-2l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" transform="translate(0 1)" />,
  )
export const Retour = ({ taille = 24 }: P) => svg(taille, <path d="M15.4 4.6a1.5 1.5 0 0 1 0 2.1L10.1 12l5.3 5.3a1.5 1.5 0 1 1-2.1 2.1l-6.4-6.3a1.5 1.5 0 0 1 0-2.2l6.4-6.3a1.5 1.5 0 0 1 2.1 0Z" />)
export const Bas = ({ taille = 24 }: P) => svg(taille, <path d="M4.6 8.6a1.5 1.5 0 0 1 2.1 0l5.3 5.3 5.3-5.3a1.5 1.5 0 1 1 2.1 2.1l-6.3 6.4a1.5 1.5 0 0 1-2.2 0l-6.3-6.4a1.5 1.5 0 0 1 0-2.1Z" />)
export const Coche = ({ taille = 24 }: P) => svg(taille, <path d="M20 6.5 9.5 17 4 11.5l1.8-1.8 3.7 3.7 8.7-8.7Z" />)
export const Fleche = ({ taille = 24 }: P) => svg(taille, <path d="M11 3h2v11.2l4.1-4.1 1.4 1.4-6.5 6.5-6.5-6.5 1.4-1.4 4.1 4.1Z M5 19h14v2H5Z" />)
export const Etoile = ({ taille = 24 }: P) =>
  svg(taille, <path d="M12 2.5l1.9 6.1 6.1 1.9-6.1 1.9L12 18.5l-1.9-6.1L4 10.5l6.1-1.9Z M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8Z" />)
