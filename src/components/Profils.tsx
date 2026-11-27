import { avatarProfil, choisirProfil, nomProfil, profil, useStore } from '../store'
import type { Catalogue } from '../types'
import { Engrenage, Voiture } from './Icones'
import { BoutonAppuiLong } from './BoutonAppuiLong'

type Props = { catalogue: Catalogue; ouvrirGerer: () => void; pourLaRoute: () => void }

export function EcranProfils({ catalogue, ouvrirGerer, pourLaRoute }: Props) {
  useStore()
  return (
    <div className="ecran ecran-profils">
      <div className="profils">
        {catalogue.profils.map((p) => {
          const photo = profil(p.id).photo
          return (
            <button key={p.id} className="tuile-profil" style={{ '--couleur': p.couleur } as React.CSSProperties} onClick={() => choisirProfil(p.id)}>
              <span className="avatar-profil">{photo ? <img src={photo} alt="" /> : avatarProfil(catalogue, p.id)}</span>
              <span className="nom-profil">{nomProfil(catalogue, p.id)}</span>
            </button>
          )
        })}
      </div>
      <div className="barre-parent">
        <button className="bouton-route" onClick={pourLaRoute}>
          <Voiture taille={26} /> Pour la route
        </button>
        <BoutonAppuiLong onValide={ouvrirGerer} titre="Gérer (appui long)">
          <Engrenage taille={26} />
        </BoutonAppuiLong>
      </div>
    </div>
  )
}
