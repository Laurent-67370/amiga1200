/**
 * Téléphone en portrait : le sommaire du parcours devient un panneau plein écran, ouvert et fermé par un bouton
 * flottant ; il se referme dès qu'on choisit une étape, qui s'affiche alors en haut de l'écran.
 */
import { langueCourante, surChangementLangue } from '../68k-trainer/src/renderer/src/langue'

const etroit = (): boolean => matchMedia('(max-width: 900px)').matches

/** Remonte au début de l'étape affichée (sous la barre d'onglets). */
function remonter(): void {
  const haut = document.querySelector<HTMLElement>('.chapitre-bandeau')
  if (!haut) return
  const barre = document.querySelector<HTMLElement>('.app-nav')?.offsetHeight ?? 0
  window.scrollTo({ top: Math.max(0, haut.getBoundingClientRect().top + window.scrollY - barre) })
}

export function installerSommaireMobile(): void {
  const bouton = document.createElement('button')
  bouton.className = 'btn-sommaire'
  bouton.type = 'button'
  document.body.appendChild(bouton)

  const ouvert = (): boolean => document.body.classList.contains('sommaire-ouvert')
  const libeller = (): void => {
    const en = langueCourante() === 'en'
    bouton.textContent = ouvert() ? (en ? '✕ Close' : '✕ Fermer') : en ? '☰ Contents' : '☰ Sommaire'
    bouton.setAttribute('aria-expanded', String(ouvert()))
  }
  const basculer = (etat: boolean): void => {
    document.body.classList.toggle('sommaire-ouvert', etat)
    libeller()
    if (etat) {
      const actif = document.querySelector<HTMLElement>('.sommaire .actif')
      actif?.scrollIntoView({ block: 'center' })
    }
  }
  bouton.addEventListener('click', () => basculer(!ouvert()))

  document.addEventListener('click', (e) => {
    if (!etroit()) return
    const cible = e.target as HTMLElement
    if (cible.closest('.sommaire-etape, .btn-reprendre')) {
      basculer(false)
      setTimeout(remonter, 150)
    } else if (cible.closest('.nav-tab')) basculer(false)
  })
  // Changement d'étape par « Suivant / Précédent » : on remonte au début de l'étape
  document.addEventListener('click', (e) => {
    if (!etroit() || !(e.target as HTMLElement).closest('.parcours-nav button')) return
    setTimeout(remonter, 150)
  })
  surChangementLangue(libeller)
  libeller()
}
