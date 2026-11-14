/**
 * « Essayer sur l'Amiga » : le programme est assemblé en exécutable AmigaDOS, posé sur une disquette amorçable,
 * et l'émulateur amiga1200 (WinUAE 6 / PUAE) s'ouvre avec cette disquette dans DF0: sur le modèle choisi.
 */
import { fabriquerPrg } from '../68k-trainer/src/main/assemblage'
import { disquetteAmorcable, enChip, nomAmiga } from './disquette'
import { adresseEmulateur, android, compresser, compresserPourAdresse, emulateurInterne, enregistrerFichier, ouvrirLien } from './plateforme'

export type ModeleAmiga = 'a500' | 'a1200'
const CLE_MODELE = '68kt:modele'

export function modeleEssai(): ModeleAmiga {
  try {
    return localStorage.getItem(CLE_MODELE) === 'a1200' ? 'a1200' : 'a500'
  } catch {
    return 'a500'
  }
}

export function choisirModeleEssai(m: ModeleAmiga): void {
  try {
    localStorage.setItem(CLE_MODELE, m)
  } catch {
    /* rien */
  }
}

export const NOM_MODELE: Record<ModeleAmiga, string> = { a500: 'Amiga 500', a1200: 'Amiga 1200' }

/** Disquette amorçable du programme, ou la raison pour laquelle on ne peut pas la faire. */
export function fabriquerDisquette(source: string, nom: string, dossier?: string): { adf?: Uint8Array; nom: string; raison?: string } {
  const propre = nomAmiga(nom)
  const exe = fabriquerPrg(source, 'hunk', dossier)
  if (!exe.octets) return { nom: propre, raison: exe.raison }
  return { adf: disquetteAmorcable(propre, enChip(exe.octets)), nom: propre }
}

/**
 * Ouvre l'émulateur avec la disquette : celui intégré à l'APK du Trainer, sinon l'application Amiga 1200
 * (amiga1200-android) si elle est installée, sinon l'émulateur web. Renvoie où l'essai a été lancé.
 */
export async function lancerDansEmulateur(adf: Uint8Array, nom: string, modele = modeleEssai()): Promise<'interne' | 'application' | 'web'> {
  const a = android()
  const params = new URLSearchParams({ nom, modele })
  // 1. L'émulateur intégré à l'APK du Trainer (WebView récente) ; 2. l'application Amiga 1200 ; 3. le navigateur
  if (emulateurInterne()) {
    a!.ouvrirEmulateur!(`#${params.toString()}&trainer=${await compresserPourAdresse(adf)}`)
    return 'interne'
  }
  if (a?.lancerAmiga && a.lancerAmiga(nom, await compresser(adf), modele)) return 'application'
  const donnees = await compresserPourAdresse(adf)
  ouvrirLien(`${adresseEmulateur()}#${params.toString()}&trainer=${donnees}`, 'amiga1200')
  return 'web'
}

export function enregistrerDisquette(adf: Uint8Array, nom: string): void {
  enregistrerFichier(`${nom}.adf`, adf)
}
