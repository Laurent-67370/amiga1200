/**
 * Disquette Amiga amorçable (.adf, OFS) contenant un programme du Trainer : au démarrage, le Kickstart
 * (1.3, 3.1 ou AROS) exécute S:Startup-Sequence, qui lance le programme. Ainsi l'émulateur amiga1200 le fait
 * tourner tout seul, sur un Amiga 500 comme sur un Amiga 1200, sans Workbench ni disque dur.
 *
 * Les outils de disquette sont ceux de l'émulateur (wasm/web/adf.js et ffs.js), partagés avec lui.
 */
// @ts-expect-error module JavaScript de l'émulateur, sans types
import { makeBlankAdf } from '../../wasm/web/adf.js'
// @ts-expect-error module JavaScript de l'émulateur, sans types
import { listPartitions, AmigaVolume } from '../../wasm/web/ffs.js'
import { assembler } from '../68k-trainer/src/asm/assembleur'
import { creerHunk } from '../68k-trainer/src/asm/hunk'

const BLOCS = 1760

/** Code du bloc d'amorce standard d'AmigaDOS (celui qu'écrit la commande Install) : appelé avec A6 = ExecBase. */
const AMORCE = `
    LEA     nomdos(PC),A1
    JSR     -96(A6)         ; FindResident("dos.library")
    TST.L   D0
    BEQ.S   erreur
    MOVEA.L D0,A0
    MOVEA.L 22(A0),A0       ; RT_INIT : AmigaDOS démarre sur cette disquette
    MOVEQ   #0,D0
    RTS
erreur:
    MOVEQ   #-1,D0
    RTS
nomdos:
    DC.B    'dos.library',0
`

/**
 * Petit programme lancé après celui de l'élève : il garde ouverte la fenêtre du Shell (celle d'AROS se ferme dès la
 * fin de la Startup-Sequence) pour qu'on lise ce que le programme a écrit. Il attend Ctrl+C, pas un clic : sur un
 * écran tactile, toucher l'écran de l'Amiga vaut un clic gauche et refermait la fenêtre.
 */
const FIN = `
    MOVEA.L 4.W,A6
    LEA     dosnom(PC),A1
    MOVEQ   #0,D0
    JSR     -552(A6)        ; OpenLibrary
    MOVE.L  D0,A5           ; A5 = DOSBase
    TST.L   D0
    BEQ.S   sortie
    MOVEA.L A5,A6
    JSR     -60(A6)         ; Output()
    MOVE.L  D0,D1
    BEQ.S   attente
    LEA     texte(PC),A0
    MOVE.L  A0,D2
    MOVEQ   #textefin-texte,D3
    JSR     -48(A6)         ; Write()
attente:
    MOVEA.L A5,A6
    MOVEQ   #10,D1
    JSR     -198(A6)        ; Delay(10) : 1/5 de seconde
    MOVEA.L 4.W,A6
    MOVEQ   #0,D0
    MOVEQ   #0,D1
    JSR     -306(A6)        ; SetSignal(0, 0) : signaux reçus
    BTST    #12,D0          ; Ctrl+C (SIGBREAKF_CTRL_C) ?
    BEQ.S   attente
    MOVEQ   #0,D0
    MOVE.L  #$1000,D1
    JSR     -306(A6)        ; SetSignal(0, Ctrl+C) : signal consommé
    MOVEA.L A5,A1
    JSR     -414(A6)        ; CloseLibrary
sortie:
    MOVEQ   #0,D0
    RTS
dosnom:
    DC.B    'dos.library',0
texte:
    DC.B    10,'-- Fin du programme (68k Trainer) --',10
textefin:
`

function programmeFin(): Uint8Array {
  const r = assembler(FIN, { prg: true })
  if (!r.ok) throw new Error('programme Fin : ' + (r.erreurs[0]?.message ?? 'erreur'))
  return creerHunk(r)
}

function poserAmorce(adf: Uint8Array): void {
  const r = assembler(AMORCE)
  if (!r.ok) throw new Error("bloc d'amorce : " + (r.erreurs[0]?.message ?? 'erreur'))
  adf.set(r.binaire, 12)
  // Somme de contrôle des deux premiers blocs (1024 octets), avec report de retenue, puis inversée
  const dv = new DataView(adf.buffer, adf.byteOffset, 1024)
  dv.setUint32(4, 0)
  let somme = 0
  for (let i = 0; i < 1024; i += 4) {
    somme += dv.getUint32(i)
    if (somme > 0xffffffff) somme = (somme + 1) >>> 0
  }
  dv.setUint32(4, ~somme >>> 0)
}

/** Nom de fichier AmigaDOS sûr : lettres, chiffres, « _ » et « - », 30 caractères au plus. */
export function nomAmiga(nom: string): string {
  const propre = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 30)
  return propre || 'programme'
}

/**
 * Le programme demande la Chip RAM : sur un A500 avec extension (Slow RAM) ou un A1200 avec Fast RAM, ses
 * listes Copper, images et sons restent visibles des puces. (Exécutable à un seul hunk de 68k Trainer.)
 */
export function enChip(exe: Uint8Array): Uint8Array {
  const copie = exe.slice()
  const dv = new DataView(copie.buffer)
  if (dv.getUint32(0) === 0x3f3 && dv.getUint32(8) === 1) dv.setUint32(20, (dv.getUint32(20) & 0x3fffffff) | 0x40000000)
  return copie
}

export function disquetteAmorcable(nomProgramme: string, exe: Uint8Array, volume = '68kTrainer'): Uint8Array {
  const nom = nomAmiga(nomProgramme)
  const adf: Uint8Array = makeBlankAdf(volume, false)
  adf.set([0x44, 0x4f, 0x53, 0x00], 0) // DOS\0 : OFS, lisible par le Kickstart 1.3 de l'Amiga 500
  const io = { block: (n: number) => adf.subarray(n * 512, n * 512 + 512), touch: () => {} }
  const part = listPartitions(io, BLOCS)[0]
  if (!part?.ok) throw new Error('disquette : ' + (part?.reason ?? 'format inconnu'))
  const vol = new AmigaVolume(io, part)
  const date = new Date()
  vol.writeFile(vol.root, nom, exe, date)
  vol.writeFile(vol.root, 'Fin', programmeFin(), date)
  const startup = `; Disquette fabriquée par 68k Trainer : lance le programme au démarrage\n${nom}\nFin\n`
  vol.writeFile(vol.dir('S'), 'Startup-Sequence', new TextEncoder().encode(startup), date)
  vol.finish()
  poserAmorce(adf)
  return adf
}
