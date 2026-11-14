/**
 * Profils d'utilisateurs, comme dans l'application d'origine (src/main/profils.ts), mais rangés dans le
 * stockage local du navigateur (ou de l'application Android). Le mot de passe facultatif n'est jamais
 * gardé : seulement un hachage PBKDF2 salé. Protection « anti-curieux », pas une sécurité forte.
 */
import type { ExportProfil, ProfilPublic, ProgressState, ResultatProfil } from '../68k-trainer/src/shared/ipc'
import { normaliserProgression } from '../68k-trainer/src/shared/progression'
import { traducteurMain } from '../68k-trainer/src/main/langue'

const t = traducteurMain({
  fr: {
    nomVide: 'Le nom du profil ne peut pas être vide.',
    introuvable: 'Profil introuvable.',
    motDePasseIncorrect: 'Mot de passe incorrect.',
    aucunProfil: 'Aucun profil ouvert.',
    motDePasseActuelIncorrect: 'Mot de passe actuel incorrect.',
    nomPris: 'Un autre profil porte déjà ce nom.',
    pasUnProfil: "Ce fichier n'est pas un profil 68k Trainer."
  },
  en: {
    nomVide: 'The profile name cannot be empty.',
    introuvable: 'Profile not found.',
    motDePasseIncorrect: 'Wrong password.',
    aucunProfil: 'No profile is open.',
    motDePasseActuelIncorrect: 'Wrong current password.',
    nomPris: 'Another profile already has this name.',
    pasUnProfil: 'This file is not a 68k Trainer profile.'
  }
})

interface MotDePasse {
  sel: string
  hachage: string
}
interface Profil {
  id: string
  nom: string
  creeLe: string
  motDePasse?: MotDePasse
}
interface FichierProfils {
  version: 1
  profils: Profil[]
  dernier?: string
}

const CLE_INDEX = '68kt:profils'
const cleProgression = (id: string): string => `68kt:progression:${id}`
const FORMAT_EXPORT = '68k-trainer-profil'

const hex = (o: Uint8Array): string => [...o].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hacher(motDePasse: string, sel = hex(crypto.getRandomValues(new Uint8Array(16)))): Promise<MotDePasse> {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sel), iterations: 100000 }, cle, 256)
  return { sel, hachage: hex(new Uint8Array(bits)) }
}

async function verifier(motDePasse: string, attendu: MotDePasse): Promise<boolean> {
  const calcule = (await hacher(motDePasse, attendu.sel)).hachage
  let diff = calcule.length ^ attendu.hachage.length
  for (let i = 0; i < calcule.length && i < attendu.hachage.length; i++) diff |= calcule.charCodeAt(i) ^ attendu.hachage.charCodeAt(i)
  return diff === 0
}

function nomValide(nom: string): string {
  const propre = nom.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!propre) throw new Error(t('nomVide'))
  return propre
}

function lire<T>(cle: string): T | null {
  try {
    const v = localStorage.getItem(cle)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

function ecrire(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    /* stockage plein ou indisponible : la séance continue sans enregistrer */
  }
}

const nouvelId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : hex(crypto.getRandomValues(new Uint8Array(16)))

export class GestionProfilsWeb {
  private actif: Profil | null = null

  private lireIndex(): FichierProfils {
    const index = lire<FichierProfils>(CLE_INDEX)
    return { version: 1, profils: index?.profils ?? [], dernier: index?.dernier }
  }

  private ecrireIndex(index: FichierProfils): void {
    ecrire(CLE_INDEX, index)
  }

  private publier(p: Profil): ProfilPublic {
    return { id: p.id, nom: p.nom, protege: !!p.motDePasse, creeLe: p.creeLe }
  }

  async lister(): Promise<{ profils: ProfilPublic[]; dernier?: string }> {
    const index = this.lireIndex()
    return { profils: index.profils.map((p) => this.publier(p)), dernier: index.dernier }
  }

  async creer(nom: string, motDePasse?: string, progression?: ProgressState): Promise<ResultatProfil> {
    try {
      const index = this.lireIndex()
      let propre = nomValide(nom)
      const pris = new Set(index.profils.map((p) => p.nom.toLowerCase()))
      for (let n = 2; pris.has(propre.toLowerCase()); n++) propre = `${nomValide(nom)} (${n})`
      const profil: Profil = { id: nouvelId(), nom: propre, creeLe: new Date().toISOString() }
      if (motDePasse) profil.motDePasse = await hacher(motDePasse)
      // Ce portage est consacré à l'Amiga : un nouveau profil commence sur le parcours Amiga 500
      const p = normaliserProgression(progression)
      p.machine = 'amiga'
      ecrire(cleProgression(profil.id), p)
      index.profils.push(profil)
      this.ecrireIndex(index)
      return { ok: true, profil: this.publier(profil) }
    } catch (e) {
      return { ok: false, erreur: (e as Error).message }
    }
  }

  async ouvrir(id: string, motDePasse?: string): Promise<ResultatProfil> {
    const index = this.lireIndex()
    const profil = index.profils.find((p) => p.id === id)
    if (!profil) return { ok: false, erreur: t('introuvable') }
    if (profil.motDePasse && !(await verifier(motDePasse ?? '', profil.motDePasse))) return { ok: false, erreur: t('motDePasseIncorrect') }
    this.actif = profil
    index.dernier = id
    this.ecrireIndex(index)
    return { ok: true, profil: this.publier(profil) }
  }

  async fermer(): Promise<void> {
    this.actif = null
  }

  private exigerActif(): Profil {
    if (!this.actif) throw new Error(t('aucunProfil'))
    return this.actif
  }

  async chargerProgression(): Promise<ProgressState> {
    const profil = this.exigerActif()
    return normaliserProgression(lire(cleProgression(profil.id)))
  }

  async enregistrerProgression(state: ProgressState): Promise<void> {
    ecrire(cleProgression(this.exigerActif().id), state)
  }

  private async verifierActif(motDePasseActuel?: string): Promise<{ index: FichierProfils; profil: Profil }> {
    const actif = this.exigerActif()
    const index = this.lireIndex()
    const profil = index.profils.find((p) => p.id === actif.id)
    if (!profil) throw new Error(t('introuvable'))
    if (profil.motDePasse && !(await verifier(motDePasseActuel ?? '', profil.motDePasse))) throw new Error(t('motDePasseActuelIncorrect'))
    return { index, profil }
  }

  async renommer(nom: string): Promise<ResultatProfil> {
    try {
      const actif = this.exigerActif()
      const index = this.lireIndex()
      const profil = index.profils.find((p) => p.id === actif.id)
      if (!profil) return { ok: false, erreur: t('introuvable') }
      const propre = nomValide(nom)
      if (index.profils.some((p) => p.id !== profil.id && p.nom.toLowerCase() === propre.toLowerCase())) return { ok: false, erreur: t('nomPris') }
      profil.nom = propre
      this.actif = profil
      this.ecrireIndex(index)
      return { ok: true, profil: this.publier(profil) }
    } catch (e) {
      return { ok: false, erreur: (e as Error).message }
    }
  }

  async changerMotDePasse(actuel?: string, nouveau?: string): Promise<ResultatProfil> {
    try {
      const { index, profil } = await this.verifierActif(actuel)
      if (nouveau) profil.motDePasse = await hacher(nouveau)
      else delete profil.motDePasse
      this.actif = profil
      this.ecrireIndex(index)
      return { ok: true, profil: this.publier(profil) }
    } catch (e) {
      return { ok: false, erreur: (e as Error).message }
    }
  }

  async supprimer(motDePasseActuel?: string): Promise<ResultatProfil> {
    try {
      const { index, profil } = await this.verifierActif(motDePasseActuel)
      index.profils = index.profils.filter((p) => p.id !== profil.id)
      if (index.dernier === profil.id) delete index.dernier
      this.ecrireIndex(index)
      try {
        localStorage.removeItem(cleProgression(profil.id))
      } catch {
        /* rien */
      }
      this.actif = null
      return { ok: true }
    } catch (e) {
      return { ok: false, erreur: (e as Error).message }
    }
  }

  async exporter(brouillons: Record<string, string>): Promise<ExportProfil> {
    const profil = this.exigerActif()
    return { format: FORMAT_EXPORT, version: 1, nom: profil.nom, exporteLe: new Date().toISOString(), progression: await this.chargerProgression(), brouillons }
  }

  async importer(donnees: unknown, motDePasse?: string): Promise<ResultatProfil & { brouillons?: Record<string, string> }> {
    const d = donnees as Partial<ExportProfil>
    if (!d || d.format !== FORMAT_EXPORT || typeof d.nom !== 'string') return { ok: false, erreur: t('pasUnProfil') }
    const res = await this.creer(d.nom, motDePasse, d.progression)
    return { ...res, brouillons: d.brouillons ?? {} }
  }

  async tableau(): Promise<{ profil: ProfilPublic; progression: ProgressState }[]> {
    return this.lireIndex().profils.map((p) => ({ profil: this.publier(p), progression: normaliserProgression(lire(cleProgression(p.id))) }))
  }
}
