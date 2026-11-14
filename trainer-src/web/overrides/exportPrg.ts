/**
 * Remplace src/renderer/src/exportPrg.ts de l'application d'origine :
 * - « Exporter » télécharge l'exécutable AmigaDOS (ou le .PRG), au lieu d'une boîte « Enregistrer sous » ;
 * - « Essayer sur l'Amiga » ouvre l'émulateur amiga1200 avec le programme sur une disquette amorçable,
 *   sur un Amiga 500 ou un Amiga 1200 (choix dans l'onglet « Émulateur »).
 */
import type { Plateforme } from '../../68k-trainer/src/shared/parcours'
import { machineDe } from '../../68k-trainer/src/shared/machines'
import { traducteur } from '../../68k-trainer/src/renderer/src/langue'
import { fabriquerDisquette, lancerDansEmulateur, modeleEssai, NOM_MODELE } from '../essai'
import { nomAmiga } from '../disquette'
import { android } from '../plateforme'
import { essayerSurAmiga } from '../amigaIntegre'

const t = traducteur({
  fr: {
    exportImpossible: 'Export impossible.',
    astuceSt: '\nAstuce : sur un vrai ST, termine le programme par CLR.W -(SP) puis TRAP #1 (Pterm0) pour revenir proprement au bureau.',
    enregistre: 'Programme enregistré : {chemin}{conseil}',
    enregistreAndroid: 'Choisis où ranger {chemin} sur le téléphone.{conseil}',
    lancerAmiga: '\nOn peut le lancer depuis le Shell (CLI) ou par une icône : sa sortie s’affiche alors dans une fenêtre console.',
    astuceChip: 'Astuce : sur un Amiga avec de la Fast RAM, mets les listes Copper, images et sons dans une « SECTION nom,DATA_C » (Chip RAM).',
    essaiImpossible: 'Essai impossible.',
    lance:
      "L'émulateur s'ouvre sur un {modele} : ta disquette {nom}.adf est dans DF0: et le programme démarre tout seul (une dizaine de secondes avec le Kickstart, un peu plus avec AROS). Modèle et Kickstart : onglet « Émulateur ».",
    lanceAndroid:
      "L'émulateur s'ouvre dans le navigateur du téléphone sur un {modele}, avec ta disquette {nom}.adf dans DF0: : le programme démarre tout seul. Installe l'application Amiga 1200 pour faire tes essais sans connexion (onglet « Émulateur »).",
    lanceInterne:
      "L'émulateur intégré démarre un {modele} avec ta disquette {nom}.adf dans DF0: : le programme se lance tout seul, sans connexion. Touche « retour » pour revenir au Trainer.",
    lanceApplication:
      "L'application Amiga 1200 démarre un {modele} avec ta disquette {nom}.adf dans DF0: : le programme se lance tout seul. Reviens au Trainer avec le bouton « récents » du téléphone."
  },
  en: {
    exportImpossible: 'Export failed.',
    astuceSt: '\nTip: on a real ST, end the program with CLR.W -(SP) then TRAP #1 (Pterm0) to return cleanly to the desktop.',
    enregistre: 'Program saved: {chemin}{conseil}',
    enregistreAndroid: 'Choose where to store {chemin} on the phone.{conseil}',
    lancerAmiga: '\nYou can run it from the Shell (CLI) or from an icon: its output then appears in a console window.',
    astuceChip: 'Tip: on an Amiga with Fast RAM, put copper lists, images and sounds in a “SECTION name,DATA_C” (Chip RAM).',
    essaiImpossible: 'Test run failed.',
    lance:
      'The emulator opens on an {modele}: your disk {nom}.adf is in DF0: and the program starts by itself (about ten seconds with the Kickstart, a little more with AROS). Model and Kickstart: “Emulator” tab.',
    lanceAndroid:
      'The emulator opens in the phone browser on an {modele}, with your disk {nom}.adf in DF0:: the program starts by itself. Install the Amiga 1200 app to test without a connection (“Emulator” tab).',
    lanceInterne:
      'The built-in emulator starts an {modele} with your disk {nom}.adf in DF0:: the program runs by itself, offline. Press “back” to return to the Trainer.',
    lanceApplication:
      'The Amiga 1200 app starts an {modele} with your disk {nom}.adf in DF0:: the program runs by itself. Come back to the Trainer with the phone “recent apps” button.'
  }
})

export interface ResultatExport {
  ok: boolean
  message: string
}

function nomTos(nom: string): string {
  const propre = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8)
  return propre || 'PROGRAM'
}

export async function exporterPrg(source: string, nom: string, plateforme: Plateforme = 'amiga', dossier?: string): Promise<ResultatExport> {
  const amiga = machineDe(plateforme).export.format === 'hunk'
  const exe = await window.api.fabriquerPrg(source, amiga ? 'hunk' : 'prg', dossier)
  if (!exe.octets) return { ok: false, message: exe.raison ?? t('exportImpossible') }
  const fichier = amiga ? nomAmiga(nom) : nomTos(nom)
  const r = await window.api.enregistrerPrg(exe.octets, fichier, amiga ? 'hunk' : 'prg')
  const conseils: string[] = []
  if (amiga) {
    conseils.push(t('lancerAmiga'))
    if (/\$?dff[0-9a-f]{3}|\$dff000/i.test(source) && !/_C\b/i.test(source)) conseils.push(t('astuceChip'))
  } else if (!/\btrap\s+#1\b/i.test(source)) conseils.push(t('astuceSt'))
  return { ok: true, message: t(android() ? 'enregistreAndroid' : 'enregistre', { chemin: r.chemin ?? fichier, conseil: conseils.join('\n') }) }
}

export async function essayerDansEmulateur(
  source: string,
  nom: string,
  _plateforme: Plateforme = 'amiga',
  dossier?: string,
  _quandFini?: (message: string) => void
): Promise<ResultatExport> {
  // Application Android : le vrai Amiga s'affiche à la place de l'écran, dans la même page
  const integre = dossier ? null : await essayerSurAmiga(source, nom)
  if (integre) return integre
  const d = fabriquerDisquette(source, nom, dossier)
  if (!d.adf) return { ok: false, message: d.raison ?? t('essaiImpossible') }
  const ou = await lancerDansEmulateur(d.adf, d.nom)
  const cle = ou === 'interne' ? 'lanceInterne' : ou === 'application' ? 'lanceApplication' : android() ? 'lanceAndroid' : 'lance'
  return { ok: true, message: t(cle, { modele: NOM_MODELE[modeleEssai()], nom: d.nom }) }
}
