/** Point d'entrée : window.api du navigateur, styles du téléphone, puis l'interface d'origine. */
import './api'
import { installerEditeurMobile } from './editeurMobile'
import './mobile.css'
import '../68k-trainer/src/renderer/src/main'
import { installerSommaireMobile } from './sommaire'
import { installerMarqueurs } from './marqueurs'

// Copie hors ligne (navigateur seulement : l'application Android a déjà tous ses fichiers)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.AndroidTrainer) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {})
}

// Téléphone : sommaire en panneau plein écran, lignes de code repliées dans les éditeurs
installerMarqueurs()
installerSommaireMobile()
installerEditeurMobile()
