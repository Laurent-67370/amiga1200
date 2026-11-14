/**
 * Remplace l'onglet « Émulateurs » de l'application d'origine (installation de Hatari et WinUAE sous Windows) :
 * ici, l'émulateur est amiga1200, dans le navigateur. On y choisit l'Amiga sur lequel « Essayer » lance les
 * programmes : Amiga 500 (celui du cours) ou Amiga 1200.
 */
import { traducteur } from '../../68k-trainer/src/renderer/src/langue'
import { choisirModeleEssai, modeleEssai, NOM_MODELE, type ModeleAmiga } from '../essai'
import { adresseEmulateur, android, ouvrirLien } from '../plateforme'

const t = traducteur({
  fr: {
    titre: "L'émulateur Amiga",
    intro:
      "Le Trainer simule un Amiga 500 pour suivre ton programme pas à pas. Pour le voir tourner sur une machine complète, le bouton « Essayer sur l'Amiga » (bac à sable et exercices réussis) l'ouvre dans <b>l'émulateur amiga1200</b> (WinUAE 6, celui d'Amiberry) : le programme est posé sur une disquette amorçable et démarre tout seul.",
    modeleTitre: 'Amiga utilisé pour « Essayer »',
    a500: '<b>Amiga 500</b> : 68000, OCS, 512 Ko de Chip RAM. La machine du cours. Il lui faut ton Kickstart 1.3 : sans lui, l\'émulateur prend un Amiga 1200 avec AROS.',
    a1200: '<b>Amiga 1200</b> : 68020, AGA, 2 Mo de Chip RAM. Pour vérifier que ton programme marche aussi sur la machine suivante, Kickstart 3.1.',
    choixRetenu: 'Les prochains essais se feront sur un {modele}.',
    kickTitre: 'Kickstart',
    kick:
      "Sans Kickstart d'origine, l'émulateur démarre sur <b>AROS</b>, un Kickstart libre : la plupart des programmes du cours y fonctionnent. Pour retrouver le vrai système, importe ta ROM dans l'émulateur (bouton <b>Importer le mien…</b> sur son écran d'accueil) : un Kickstart 1.3 pour l'Amiga 500, un 3.1 pour l'Amiga 1200 ; il choisit tout seul celui qui convient au modèle. Les ROM ne sont ni fournies ni envoyées nulle part.",
    kickWeb: "Le Trainer et l'émulateur partagent le même site : la Bibliothèque de l'émulateur (Kickstart, disquettes) sert aussi aux essais.",
    kickAndroid: "Dans l'application, l'émulateur s'ouvre dans le navigateur du téléphone (Chrome) : importe ton Kickstart une fois dans cet émulateur-là.",
    ouvrir: "Ouvrir l'émulateur",
    disqueTitre: 'Garder la disquette',
    disque:
      "Le bouton « Exporter » donne l'exécutable AmigaDOS, à copier sur une disquette, un disque dur ou un vrai Amiga. Dans l'émulateur, la disquette d'essai reste dans la Bibliothèque (Disquettes) sous le nom du programme.",
    autresTitre: "Les autres versions de l'émulateur",
    autres:
      "La même famille existe en <b>application Android</b> (avec le JIT), sur <b>Mac</b> et sur <b>PC</b> : l'exécutable exporté et la disquette .adf s'y ouvrent de la même façon.",
    appAndroid: 'Application Android de l’émulateur',
    trainerAndroid: 'Ce Trainer en application Android (APK)'
  },
  en: {
    titre: 'The Amiga emulator',
    intro:
      'The Trainer simulates an Amiga 500 so you can follow your program step by step. To see it run on a complete machine, the “Try on the Amiga” button (sandbox and solved exercises) opens it in <b>the amiga1200 emulator</b> (WinUAE 6, the Amiberry core): the program is put on a bootable disk and starts by itself.',
    modeleTitre: 'Amiga used by “Try”',
    a500: '<b>Amiga 500</b>: 68000, OCS, 512 KB of Chip RAM. The machine of the course. It needs your Kickstart 1.3: without it, the emulator uses an Amiga 1200 with AROS.',
    a1200: '<b>Amiga 1200</b>: 68020, AGA, 2 MB of Chip RAM. To check that your program also works on the next machine, Kickstart 3.1.',
    choixRetenu: 'The next test runs will use an {modele}.',
    kickTitre: 'Kickstart',
    kick:
      'Without an original Kickstart, the emulator boots <b>AROS</b>, a free Kickstart: most programs of the course run on it. To get the real system, import your ROM in the emulator (<b>Importer le mien…</b> button on its home screen): a Kickstart 1.3 for the Amiga 500, a 3.1 for the Amiga 1200; it picks the right one for the model. ROMs are neither supplied nor sent anywhere.',
    kickWeb: 'The Trainer and the emulator share the same site: the emulator Library (Kickstarts, disks) is also used by test runs.',
    kickAndroid: 'In the app, the emulator opens in the phone browser (Chrome): import your Kickstart once in that emulator.',
    ouvrir: 'Open the emulator',
    disqueTitre: 'Keeping the disk',
    disque:
      'The “Export” button gives the AmigaDOS executable, to copy to a floppy, a hard disk or a real Amiga. In the emulator, the test disk stays in the Library (Disks) under the program name.',
    autresTitre: 'The other versions of the emulator',
    autres:
      'The same family exists as an <b>Android app</b> (with JIT), on <b>Mac</b> and on <b>PC</b>: the exported executable and the .adf disk open there the same way.',
    appAndroid: 'Android app of the emulator',
    trainerAndroid: 'This Trainer as an Android app (APK)'
  }
})

export function renderEmulateurs(root: HTMLElement): () => void {
  const modeles: ModeleAmiga[] = ['a500', 'a1200']
  root.innerHTML = `
    <div class="emulateurs-colonne">
      <div class="apropos-card">
        <h2>${t('titre')}</h2>
        <p class="apropos-texte">${t('intro')}</p>
        <div class="profils-form-boutons"><button id="btn-ouvrir-emulateur">${t('ouvrir')}</button></div>
      </div>
      <div class="apropos-card">
        <h3>${t('modeleTitre')}</h3>
        ${modeles
          .map(
            (m) => `<label class="rom-choix"><input type="radio" name="modele-essai" value="${m}" ${modeleEssai() === m ? 'checked' : ''} /> ${t(m)}</label>`
          )
          .join('')}
        <p class="profils-message" id="message-modele"></p>
      </div>
      <div class="apropos-card">
        <h3>${t('kickTitre')}</h3>
        <p class="apropos-texte">${t('kick')}</p>
        <p class="apropos-texte">${android() ? t('kickAndroid') : t('kickWeb')}</p>
      </div>
      <div class="apropos-card">
        <h3>${t('disqueTitre')}</h3>
        <p class="apropos-texte">${t('disque')}</p>
      </div>
      <div class="apropos-card">
        <h3>${t('autresTitre')}</h3>
        <p class="apropos-texte">${t('autres')}</p>
        <div class="profils-form-boutons">
          <button data-lien="https://github.com/laurent-67370/amiga1200-android/releases/tag/dev">${t('appAndroid')}</button>
          ${android() ? '' : `<button data-lien="${new URL('68k-trainer-amiga.apk', location.href).href}">${t('trainerAndroid')}</button>`}
        </div>
      </div>
    </div>`
  const surChange = (ev: Event): void => {
    const r = ev.target as HTMLInputElement
    if (r.name !== 'modele-essai') return
    choisirModeleEssai(r.value === 'a1200' ? 'a1200' : 'a500')
    const m = root.querySelector<HTMLElement>('#message-modele')
    if (m) m.textContent = t('choixRetenu', { modele: NOM_MODELE[modeleEssai()] })
  }
  const surClic = (ev: Event): void => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!b) return
    if (b.id === 'btn-ouvrir-emulateur') ouvrirLien(adresseEmulateur(), 'amiga1200')
    else if (b.dataset.lien) ouvrirLien(b.dataset.lien)
  }
  root.addEventListener('change', surChange)
  root.addEventListener('click', surClic)
  return () => {
    root.removeEventListener('change', surChange)
    root.removeEventListener('click', surClic)
  }
}
