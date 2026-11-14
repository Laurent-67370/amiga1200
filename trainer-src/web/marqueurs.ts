/**
 * Classes posées par script sur la page d'origine, à la place du sélecteur CSS :has(), que certaines WebView
 * d'Android ne gèrent pas ou ne remettent pas à jour quand le contenu change (texte écrit par le programme…) :
 * - .dbg-bloc-sortie sur le bloc « Sortie texte » du débogueur, et .sortie-vide tant qu'il n'y a rien à lire
 *   (un message dit alors où le texte apparaîtra) ;
 * - body.avec-sommaire sur la page du parcours, body.etape-ouverte quand une étape est affichée ;
 * - .choix-atari sur le choix « Atari ST » du formulaire de profil (ce portage suit le parcours Amiga).
 */
import { langueCourante } from '../68k-trainer/src/renderer/src/langue'

function marquer(): void {
  // Langue de la page (textes écrits par la feuille de style)
  document.documentElement.lang = langueCourante()
  for (const sortie of document.querySelectorAll<HTMLElement>('.dbg-sortie')) {
    const bloc = sortie.closest<HTMLElement>('.dbg-bloc')
    if (!bloc) continue
    bloc.classList.add('dbg-bloc-sortie')
    bloc.classList.toggle('sortie-vide', !sortie.textContent?.trim())
  }
  // Bac à sable : mise en page en deux zones sur téléphone (éditeur en haut, écran et débogueur en bas)
  const bac = !!document.querySelector('.view-container .toolbar #btn-run') && !!document.querySelector('.view-container .sidebar-dbg')
  document.body.classList.toggle('vue-bac', bac)
  document.documentElement.classList.toggle('vue-bac', bac)
  const barre = document.querySelector<HTMLElement>('.view-container .toolbar')
  if (barre?.querySelector('#btn-ouvrir') && !barre.querySelector('.btn-fichier')) {
    // Menu « Fichier » : Ouvrir, Enregistrer, Exemple, Exporter… regroupés, la barre tient sur une ligne
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn-fichier'
    b.setAttribute('aria-expanded', 'false')
    b.textContent = langueCourante() === 'en' ? 'File ▾' : 'Fichier ▾'
    b.addEventListener('click', () => {
      const ouvert = barre.classList.toggle('fichier-ouvert')
      b.setAttribute('aria-expanded', String(ouvert))
    })
    barre.prepend(b)
    // Un choix dans le menu le referme
    barre.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest('#btn-ouvrir, #btn-enregistrer, #btn-enregistrer-sous, #btn-exemple, #btn-prg, #btn-essayer')
      if (c) {
        barre.classList.remove('fichier-ouvert')
        b.setAttribute('aria-expanded', 'false')
      }
    })
  }
  document.body.classList.toggle('avec-sommaire', !!document.querySelector('.parcours-view .sommaire'))
  document.body.classList.toggle('etape-ouverte', !!document.querySelector('.parcours-view .sommaire-etape.actif'))
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name='machine'][value='atari']")) {
    r.closest('label')?.classList.add('choix-atari')
  }
}

export function installerMarqueurs(): void {
  let prevu = false
  const plus_tard = (): void => {
    if (prevu) return
    prevu = true
    requestAnimationFrame(() => {
      prevu = false
      marquer()
    })
  }
  new MutationObserver(plus_tard).observe(document.body, { childList: true, subtree: true, characterData: true })
  // Bac à sable : la page reste calée en haut (le navigateur la décale parfois pour montrer le curseur sous le clavier)
  const recaler = (): void => {
    if (document.body.classList.contains('vue-bac') && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0)
  }
  window.addEventListener('scroll', recaler, { passive: true })
  window.visualViewport?.addEventListener('resize', () => setTimeout(recaler, 50))
  marquer()
}
