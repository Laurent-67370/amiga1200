/** Point d'entrée : window.api du navigateur, styles du téléphone, puis l'interface d'origine. */
import './api'
import './mobile.css'
import '../68k-trainer/src/renderer/src/main'

// Copie hors ligne (navigateur seulement : l'application Android a déjà tous ses fichiers)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.AndroidTrainer) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {})
}

// Téléphone : le sommaire est au-dessus de l'étape ; après un choix, on descend jusqu'à l'étape
document.addEventListener('click', (e) => {
  if (!matchMedia('(max-width: 900px)').matches) return
  if (!(e.target as HTMLElement).closest('.sommaire-etape, .btn-reprendre')) return
  setTimeout(() => document.querySelector('.chapitre-bandeau')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
})
