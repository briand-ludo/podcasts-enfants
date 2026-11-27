import { useRef, useState } from 'react'

// Protection « parent » sans texte à lire : il faut garder le doigt appuyé 1,5 s.
export function BoutonAppuiLong({ onValide, titre, children }: { onValide: () => void; titre: string; children: React.ReactNode }) {
  const [appui, setAppui] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  const debut = (e: React.PointerEvent) => {
    e.preventDefault()
    setAppui(true)
    t.current = setTimeout(() => {
      setAppui(false)
      navigator.vibrate?.(30)
      onValide()
    }, 1500)
  }
  const fin = () => {
    clearTimeout(t.current)
    setAppui(false)
  }
  return (
    <button
      className={`bouton-appui-long${appui ? ' en-cours' : ''}`}
      aria-label={titre}
      title={titre}
      onPointerDown={debut}
      onPointerUp={fin}
      onPointerLeave={fin}
      onPointerCancel={fin}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="anneau" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="20" />
      </svg>
      {children}
    </button>
  )
}
