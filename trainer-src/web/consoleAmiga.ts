/**
 * Fenêtre du CLI sur l'écran de l'Amiga simulé, comme sur un vrai Amiga 500 sous Kickstart 1.3 : ce que le programme
 * écrit avec Write() (et ce qu'on tape pour Read()) est dessiné, en police Topaz 8, dans les plans de bits de l'écran
 * du système (ECRAN_SYSTEME, $70000 en mémoire Chip : 640 × 256, 2 plans, palette du Workbench 1.3). Ce sont donc
 * les puces simulées (Copper, bitplanes) qui l'affichent dans l'ÉCRAN, et un programme qui installe sa propre
 * liste Copper le fait disparaître, comme en vrai.
 *
 * Appelé par le Kickstart simulé (voir REMPLACEMENTS dans vite.config.ts), en exécution interactive seulement
 * (bac à sable) : la vérification des exercices travaille sur une machine où rien n'est dessiné.
 */
import topazUrl from '../../wasm/app/amiga-topaz.ttf?url'
import { ECRAN_SYSTEME } from '../68k-trainer/src/platforms/amiga/kickstart'

interface MemoireOctets {
  readU8(a: number): number
  writeU8(a: number, v: number): void
}
interface CpuAvecSortie {
  memory: MemoireOctets
  output: string
}

const OCTETS_LIGNE = 80 // 640 pixels haute résolution
const PLAN = OCTETS_LIGNE * 256
/** Fenêtre « AmigaDOS » : sous la barre de titre de l'écran, toute la largeur. */
const FEN_HAUT = 11
const FEN_BAS = 255
const TITRE_HAUT = 10
const TEXTE_Y = FEN_HAUT + TITRE_HAUT + 2
const TEXTE_X = 1 // en octets (8 pixels)
const COLONNES = OCTETS_LIGNE - 2
const LIGNES = Math.floor((FEN_BAS - 2 - TEXTE_Y) / 8)

/** Glyphes Topaz 8 × 8 (un octet par ligne), codes 32 à 255. */
let glyphes: Uint8Array | null = null
let enAttente: CpuAvecSortie | null = null
const dessinees = new WeakMap<object, string[]>()
/** Machines dont l'écran a changé depuis la dernière image balayée. */
const aMontrer = new WeakSet<object>()

async function chargerTopaz(): Promise<void> {
  const police = new FontFace('Topaz68kt', `url(${topazUrl})`)
  await police.load()
  document.fonts.add(police)
  // La police est dessinée en 8 × 16 (pixels doublés en hauteur, comme en haute résolution) : une ligne sur deux
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 16
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.font = '16px Topaz68kt'
  ctx.textBaseline = 'top'
  const g = new Uint8Array(256 * 8)
  for (let code = 32; code < 256; code++) {
    if (code >= 127 && code < 160) continue
    ctx.clearRect(0, 0, 8, 16)
    ctx.fillText(String.fromCharCode(code), 0, 0)
    const d = ctx.getImageData(0, 0, 8, 16).data
    for (let y = 0; y < 8; y++) {
      let octet = 0
      for (let x = 0; x < 8; x++) if (d[(y * 2 * 8 + x) * 4 + 3] > 100) octet |= 0x80 >> x
      g[code * 8 + y] = octet
    }
  }
  glyphes = g
  if (enAttente) dessiner(enAttente)
}

/** Octet à l'abscisse `x` (en octets) et à la ligne `y`, dans les deux plans : couleur 0 à 3 par bit. */
function poser(m: MemoireOctets, x: number, y: number, bits: number, encre: number, fond: number): void {
  const a = ECRAN_SYSTEME + y * OCTETS_LIGNE + x
  const p0 = ((encre & 1 ? bits : 0) | (fond & 1 ? ~bits : 0)) & 0xff
  const p1 = ((encre & 2 ? bits : 0) | (fond & 2 ? ~bits : 0)) & 0xff
  m.writeU8(a, p0)
  m.writeU8(a + PLAN, p1)
}

function texte(m: MemoireOctets, col: number, y: number, s: string, encre: number, fond: number): void {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i) & 0xff
    for (let r = 0; r < 8; r++) poser(m, col + i, y + r, glyphes![code * 8 + r], encre, fond)
  }
}

/** Cadre de la fenêtre du CLI (titre « AmigaDOS ») ; le texte du titre de l'écran reste celui du Kickstart. */
function cadre(m: MemoireOctets): void {
  for (let y = FEN_HAUT; y <= FEN_BAS; y++) {
    for (let x = 0; x < OCTETS_LIGNE; x++) {
      if (y < FEN_HAUT + TITRE_HAUT || y >= FEN_BAS - 1) poser(m, x, y, 0xff, 1, 0)
      else poser(m, x, y, x === 0 ? 0xc0 : x === OCTETS_LIGNE - 1 ? 0x03 : 0, 1, 0)
    }
  }
  texte(m, 2, FEN_HAUT + 1, 'AmigaDOS', 0, 1)
  // Gadgets de profondeur, à droite de la barre de titre
  for (const x of [OCTETS_LIGNE - 4, OCTETS_LIGNE - 2])
    for (let r = 0; r < 8; r++) poser(m, x, FEN_HAUT + 1 + r, r === 0 || r === 7 ? 0xff : 0x81, 0, 1)
}

/** Les lignes affichées : retour à la ligne, tabulations, et seulement les dernières (le texte défile). */
function decouper(sortie: string): string[] {
  const lignes: string[] = ['']
  for (const c of sortie) {
    if (c === '\n') lignes.push('')
    else if (c === '\r') continue
    else if (c === '\f') lignes.splice(0, lignes.length, '')
    else if (c === '\t') lignes[lignes.length - 1] += ' '.repeat(8 - (lignes[lignes.length - 1].length % 8))
    else if (c.charCodeAt(0) >= 32) lignes[lignes.length - 1] += c
    while (lignes[lignes.length - 1].length > COLONNES) {
      const l = lignes.pop()!
      lignes.push(l.slice(0, COLONNES), l.slice(COLONNES))
    }
  }
  return lignes.slice(-LIGNES)
}

function dessiner(cpu: CpuAvecSortie): void {
  if (!glyphes) {
    enAttente = cpu
    return
  }
  enAttente = null
  const m = cpu.memory
  // Machine remise à zéro (nouvelle exécution) : la fenêtre est à redessiner
  let avant = dessinees.get(m)
  if (!avant || m.readU8(ECRAN_SYSTEME + FEN_HAUT * OCTETS_LIGNE + 1) !== 0xff) {
    cadre(m)
    avant = []
  }
  const lignes = decouper(cpu.output)
  for (let i = 0; i < LIGNES; i++) {
    const l = (lignes[i] ?? '').padEnd(COLONNES, ' ')
    // Curseur orange (couleur 3) après le dernier caractère, comme dans le CLI du Workbench 1.3
    const curseur = i === lignes.length - 1 ? lignes[i].length : -1
    const cle = l + '|' + curseur
    if (avant[i] === cle) continue
    texte(m, TEXTE_X, TEXTE_Y + i * 8, l, 1, 0)
    if (curseur >= 0 && curseur < COLONNES) for (let r = 0; r < 8; r++) poser(m, TEXTE_X + curseur, TEXTE_Y + i * 8 + r, 0xff, 3, 0)
    avant[i] = cle
  }
  dessinees.set(m, avant)
  aMontrer.add(cpu)
}

/**
 * Avant que l'ÉCRAN ne recopie la dernière image : si le programme est terminé depuis qu'il a écrit, aucune image
 * n'a été balayée depuis (en vrai, le faisceau continue) ; le simulateur en balaye une, sans faire avancer le temps.
 */
function avantImage(cpu: CpuAvecSortie & { halted?: boolean; stopped?: boolean }, materiel: unknown): void {
  if (!aMontrer.has(cpu) || !(cpu.halted || cpu.stopped)) return
  aMontrer.delete(cpu)
  ;(materiel as { prechauffer?: () => void } | undefined)?.prechauffer?.()
}

export function installerConsoleAmiga(): void {
  const g = globalThis as { __consoleAmiga?: typeof dessiner; __consoleAvantImage?: typeof avantImage }
  g.__consoleAmiga = dessiner
  g.__consoleAvantImage = avantImage
  void chargerTopaz().catch(() => {
    /* police indisponible : le texte reste dans « Sortie texte » */
  })
}
