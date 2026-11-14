/**
 * Le vrai Amiga dans le Trainer : au-dessus de l'ÉCRAN du débogueur (bac à sable, exemples, exercices), un sélecteur
 * « Simulateur | Amiga 500 | Amiga 1200 ». Simulateur : l'Amiga 500 simulé, pas à pas, registres. Amiga 500 / 1200 :
 * l'émulateur amiga1200 (WinUAE 6) à la place de l'écran, et « Exécuter » y lance le programme.
 *
 * Un seul émulateur, gardé allumé d'un essai à l'autre et d'un écran à l'autre : une page (emu/?integre=1) dans un
 * cadre posé par-dessus l'emplacement de l'écran affiché ; les disquettes lui sont envoyées par message
 * (wasm/app/trainer-puae.js). Dans l'application Android seulement (l'émulateur y est intégré et autorisé) ; sur le
 * web, le vrai Amiga s'ouvre dans un onglet, comme « Essayer sur l'Amiga ».
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { langueCourante } from '../68k-trainer/src/renderer/src/langue'
import { choisirModeleEssai, fabriquerDisquette, lancerDansEmulateur, modeleEssai, NOM_MODELE, type ModeleAmiga } from './essai'
import { emulateurInterne } from './plateforme'

type Affichage = 'simulateur' | ModeleAmiga
const CLE = '68kt:affichage'

const T = {
  fr: {
    simulateur: 'Simulateur',
    titreSimulateur: "L'Amiga 500 simulé : pas à pas, registres, mémoire",
    titreAmiga: 'Le vrai {modele} (émulateur WinUAE 6) : Exécuter y lance ton programme',
    kickstart: 'Kickstart…',
    titreKickstart: "Éteint l'Amiga pour choisir ou importer ton Kickstart",
    aide: 'Exécuter lance ton programme sur le vrai {modele} (premier démarrage : une quinzaine de secondes).',
    aideWeb: 'Exécuter ouvre le vrai {modele} dans un onglet, avec ton programme sur une disquette.',
    envoi: 'Programme envoyé au vrai {modele}',
    impossible: 'Programme non envoyé : corrige d’abord les erreurs (Assembler).'
  },
  en: {
    simulateur: 'Simulator',
    titreSimulateur: 'The simulated Amiga 500: step by step, registers, memory',
    titreAmiga: 'The real {modele} (WinUAE 6 emulator): Run starts your program there',
    kickstart: 'Kickstart…',
    titreKickstart: 'Turns the Amiga off to choose or import your Kickstart',
    aide: 'Run starts your program on the real {modele} (first start: about fifteen seconds).',
    aideWeb: 'Run opens the real {modele} in a tab, with your program on a disk.',
    envoi: 'Program sent to the real {modele}',
    impossible: 'Program not sent: fix the errors first (Assemble).'
  }
}
const t = (cle: keyof (typeof T)['fr'], modele?: ModeleAmiga): string =>
  T[langueCourante() === 'en' ? 'en' : 'fr'][cle].replace('{modele}', modele ? NOM_MODELE[modele] : '')

function affichage(): Affichage {
  try {
    const v = localStorage.getItem(CLE)
    return v === 'a500' || v === 'a1200' ? v : 'simulateur'
  } catch {
    return 'simulateur'
  }
}
function choisirAffichage(a: Affichage): void {
  try {
    localStorage.setItem(CLE, a)
  } catch {
    /* rien */
  }
  if (a !== 'simulateur') {
    choisirModeleEssai(a)
    if (cadre) envoyerMessage({ type: '68kt-modele', modele: a })
  }
  marquer()
}

/* ---- L'émulateur, un seul pour toute la page ---- */
let cadre: HTMLIFrameElement | null = null
let boite: HTMLDivElement | null = null
let pret = false
let hauteurEmulateur = 0
const enAttente: unknown[] = []

function emulateur(): HTMLIFrameElement {
  if (cadre) return cadre
  boite = document.createElement('div')
  boite.className = 'amiga-integre'
  cadre = document.createElement('iframe')
  cadre.title = 'Amiga'
  cadre.allow = 'fullscreen; autoplay; gamepad'
  cadre.src = new URL('emu/index.html?integre=1', location.href).href
  boite.appendChild(cadre)
  document.body.appendChild(boite)
  // Le modèle choisi, pour la carte d'accueil de l'émulateur et le premier allumage
  const a = affichage()
  enAttente.push({ type: '68kt-modele', modele: a === 'simulateur' ? modeleEssai() : a })
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== cadre?.contentWindow) return
    // Hauteur utile de l'émulateur (écran, boutons, clavier ouvert) : la place réservée s'y ajuste
    const d = e.data as { type?: string; hauteur?: number }
    if (d?.type === '68kt-taille' && typeof d.hauteur === 'number') {
      hauteurEmulateur = Math.min(Math.max(d.hauteur, 200), 2000)
      for (const p of document.querySelectorAll<HTMLElement>('.amiga-place')) p.style.height = `${hauteurEmulateur}px`
      return
    }
    // « ◀ Simulateur » de la barre de l'émulateur : retour à l'Amiga simulé
    if (d?.type === '68kt-simulateur') return choisirAffichage('simulateur')
    if ((e.data as { type?: string })?.type === '68kt-pret') {
      pret = true
      for (const m of enAttente.splice(0)) cadre!.contentWindow!.postMessage(m, location.origin)
    }
  })
  suivre()
  return cadre
}

function envoyerMessage(m: unknown): void {
  const c = emulateur()
  if (pret && c.contentWindow) c.contentWindow.postMessage(m, location.origin)
  else enAttente.push(m)
}

/** Le cadre de l'émulateur suit l'emplacement visible (il n'est jamais déplacé : il se rechargerait). */
function suivre(): void {
  const place = [...document.querySelectorAll<HTMLElement>('.amiga-place')].find((p) => p.offsetParent !== null)
  if (boite) {
    if (place) {
      const r = place.getBoundingClientRect()
      // Position par rapport à la fenêtre (cadre en position fixe), recalculée à chaque image : il suit le défilement
      // La place peut être dans une zone qui défile (débogueur du bac à sable) : ce qui en dépasse est masqué
      let haut = 0, bas = 0
      const zone = place.closest<HTMLElement>('.sidebar')
      if (zone && getComputedStyle(zone).overflowY !== 'visible') {
        const z = zone.getBoundingClientRect()
        haut = Math.max(0, z.top - r.top)
        bas = Math.max(0, r.bottom - z.bottom)
      }
      Object.assign(boite.style, {
        visibility: haut + bas >= r.height ? 'hidden' : 'visible',
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        clipPath: haut || bas ? `inset(${haut}px 0 ${bas}px 0)` : ''
      })
    } else boite.style.visibility = 'hidden'
  }
  requestAnimationFrame(suivre)
}

/* ---- Sélecteur au-dessus de l'ÉCRAN, partout où le débogueur montre l'écran ---- */
function marquer(): void {
  const a = affichage()
  const integre = emulateurInterne()
  for (const bloc of document.querySelectorAll<HTMLElement>('.debogueur .dbg-ecran-bloc')) {
    if (bloc.hidden) continue
    let sel = bloc.querySelector<HTMLElement>(':scope > .amiga-selecteur')
    if (!sel) {
      sel = document.createElement('div')
      sel.className = 'amiga-selecteur'
      sel.innerHTML =
        '<div class="amiga-choix" role="group"><button type="button" data-aff="simulateur"></button>' +
        '<button type="button" data-aff="a500">Amiga 500</button><button type="button" data-aff="a1200">Amiga 1200</button></div>' +
        '<p class="amiga-aide"></p>'
      const titre = bloc.querySelector(':scope > h4')
      titre ? titre.after(sel) : bloc.prepend(sel)
      const place = document.createElement('div')
      place.className = 'amiga-place'
      if (hauteurEmulateur) place.style.height = `${hauteurEmulateur}px`
      sel.after(place)
    }
    const kick = sel.querySelector<HTMLButtonElement>('[data-aff=kick]')
    if (integre && !kick) {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.aff = 'kick'
      b.className = 'amiga-kick'
      sel.querySelector('.amiga-choix')!.after(b)
    }
    const bk = sel.querySelector<HTMLButtonElement>('[data-aff=kick]')
    if (bk) {
      bk.textContent = t('kickstart')
      bk.title = t('titreKickstart')
      bk.hidden = a === 'simulateur'
    }
    sel.querySelector<HTMLButtonElement>('[data-aff=simulateur]')!.textContent = t('simulateur')
    for (const b of sel.querySelectorAll<HTMLButtonElement>('.amiga-choix button')) {
      b.setAttribute('aria-pressed', String(b.dataset.aff === a))
      b.title = b.dataset.aff === 'simulateur' ? t('titreSimulateur') : t('titreAmiga', b.dataset.aff as ModeleAmiga)
    }
    const aide = sel.querySelector<HTMLElement>('.amiga-aide')!
    aide.textContent = a === 'simulateur' ? '' : t(integre ? 'aide' : 'aideWeb', a)
    bloc.classList.toggle('mode-amiga', a !== 'simulateur')
    bloc.classList.toggle('mode-amiga-integre', a !== 'simulateur' && integre)
  }
  // Le vrai Amiga est choisi : l'émulateur se prépare tout de suite (le premier démarrage est le plus long)
  if (a !== 'simulateur' && integre && document.querySelector('.amiga-place')) emulateur()
  document.body.classList.toggle('amiga-integre-dispo', integre)
}

/** Envoie le programme au vrai Amiga choisi ; faux si l'affichage est le simulateur. */
export async function essayerSurAmiga(source: string, nom: string): Promise<{ ok: boolean; message: string } | null> {
  const a = affichage()
  const modele: ModeleAmiga = a === 'simulateur' ? modeleEssai() : a
  if (!emulateurInterne() || !document.querySelector('.dbg-ecran-bloc:not([hidden]) .amiga-place')) return null
  if (a === 'simulateur') choisirAffichage(modele)
  const d = fabriquerDisquette(source, nom)
  if (!d.adf) return { ok: false, message: d.raison ?? t('impossible') }
  envoyerMessage({ type: '68kt-disquette', nom: d.nom, modele, adf: d.adf })
  return { ok: true, message: t('envoi', modele) }
}

function sourceBacASable(): string | null {
  const zone = document.querySelector('#editor')
  const ed = monaco.editor.getEditors().find((e) => zone?.contains(e.getContainerDomNode()))
  return ed ? ed.getValue() : null
}

export function installerAmigaIntegre(): void {
  let prevu = false
  new MutationObserver(() => {
    if (prevu) return
    prevu = true
    requestAnimationFrame(() => {
      prevu = false
      marquer()
    })
  }).observe(document.body, { childList: true, subtree: true })
  marquer()

  document.addEventListener('click', (e) => {
    const cible = e.target as HTMLElement
    const choix = cible.closest<HTMLButtonElement>('.amiga-selecteur button[data-aff]')
    if (choix) {
      if (choix.dataset.aff === 'kick') envoyerMessage({ type: '68kt-eteindre' })
      else choisirAffichage(choix.dataset.aff as Affichage)
      return
    }
    // Bac à sable, vrai Amiga choisi : « Exécuter » lance le programme sur l'Amiga ; « Pas » revient au simulateur
    if (affichage() === 'simulateur' || !document.querySelector('#editor')) return
    if (cible.closest('#btn-step')) return choisirAffichage('simulateur')
    if (!cible.closest('#btn-run')) return
    const source = sourceBacASable()
    if (source === null) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const statut = document.querySelector<HTMLElement>('#status')
    const erreurs = document.querySelector<HTMLElement>('#errors')
    const dire = (ok: boolean, message: string): void => {
      if (statut) statut.textContent = ok ? message : t('impossible')
      if (erreurs) erreurs.textContent = ok ? '' : message
    }
    void (async () => {
      const r = emulateurInterne() ? await essayerSurAmiga(source, 'bac_a_sable') : null
      if (r) return dire(r.ok, r.message)
      // Web : le vrai Amiga dans un onglet
      const d = fabriquerDisquette(source, 'bac_a_sable')
      if (!d.adf) return dire(false, d.raison ?? t('impossible'))
      await lancerDansEmulateur(d.adf, d.nom, affichage() as ModeleAmiga)
      dire(true, t('envoi', affichage() as ModeleAmiga))
    })()
  }, true)
}
