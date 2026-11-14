/**
 * window.api de l'application d'origine (src/preload/index.ts), réalisé dans le navigateur : l'assembleur,
 * le contenu des cours et la fabrication des exécutables sont le code d'origine (src/main/*), les fichiers et
 * les profils passent par le navigateur (stockage local, téléchargements, sélecteur de fichiers).
 */
import type { Api } from '../68k-trainer/src/preload/index'
import type { ContentBundle, EtatEmulateurPublic, ProgressState, RomPublique } from '../68k-trainer/src/shared/ipc'
import { assemblerDansApplication, fabriquerPrg } from '../68k-trainer/src/main/assemblage'
import { loadContent } from '../68k-trainer/src/main/content'
import { definirLangueMain } from '../68k-trainer/src/main/langue'
import infos from 'virtual:build-info'
import { GestionProfilsWeb } from './profils'
import { choisirFichier, enregistrerFichier, imprimerHtml } from './plateforme'
import { fabriquerDisquette, lancerDansEmulateur, NOM_MODELE, modeleEssai } from './essai'

const profils = new GestionProfilsWeb()
const contenus = new Map<string, Promise<ContentBundle>>()

async function lireTexteFichier(f: File): Promise<string> {
  const octets = new Uint8Array(await f.arrayBuffer())
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return new TextDecoder('latin1').decode(octets)
  }
}

const etatAmiga = (): EtatEmulateurPublic => ({
  id: 'winuae',
  nom: NOM_MODELE[modeleEssai()],
  machine: 'amiga',
  version: 'WinUAE 6',
  licence: 'GPL',
  description: 'Émulateur amiga1200',
  installe: true,
  embarque: true,
  taille: 0,
  dossierPartage: '',
  enCours: false,
  disponible: true
})

const api: Api = {
  assemble: async (source, dossier) => assemblerDansApplication(source, dossier),
  loadProgress: () => profils.chargerProgression(),
  saveProgress: (state: ProgressState) => profils.enregistrerProgression(state),
  loadContent: (langue = 'fr') => {
    const l = langue === 'en' ? 'en' : 'fr'
    let c = contenus.get(l)
    if (!c) {
      c = loadContent(undefined, l)
      contenus.set(l, c)
    }
    return c
  },
  getBuildInfo: async () => ({ version: infos.version, year: infos.year, builtAt: infos.builtAt }),
  definirLangue: async (langue) => definirLangueMain(langue),
  listerProfils: () => profils.lister(),
  creerProfil: (nom, motDePasse, progression) => profils.creer(nom, motDePasse, progression),
  ouvrirProfil: (id, motDePasse) => profils.ouvrir(id, motDePasse),
  fermerProfil: () => profils.fermer(),
  renommerProfil: (nom) => profils.renommer(nom),
  motDePasseProfil: (actuel, nouveau) => profils.changerMotDePasse(actuel, nouveau),
  supprimerProfil: (actuel) => profils.supprimer(actuel),
  exporterProfil: async (brouillons) => {
    const donnees = await profils.exporter(brouillons)
    enregistrerFichier(`${donnees.nom}.68kprofil`, new TextEncoder().encode(JSON.stringify(donnees, null, 2)), 'application/json')
    return { ok: true, chemin: `${donnees.nom}.68kprofil` }
  },
  importerProfil: async (motDePasse) => {
    const f = await choisirFichier('.68kprofil,.json,application/json')
    if (!f) return { ok: false }
    try {
      return await profils.importer(JSON.parse(await lireTexteFichier(f)), motDePasse)
    } catch {
      return { ok: false, erreur: "Ce fichier n'est pas un profil 68k Trainer lisible." }
    }
  },
  tableauProfils: () => profils.tableau(),
  enregistrerPrg: async (octets, nom, format = 'prg') => {
    const fichier = format === 'hunk' ? nom : `${nom}.PRG`
    enregistrerFichier(fichier, octets)
    return { ok: true, chemin: fichier }
  },
  ouvrirSource: async () => {
    const f = await choisirFichier('.s,.asm,.i,.txt,text/plain')
    if (!f) return { ok: false }
    const texte = (await lireTexteFichier(f)).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    return { ok: true, chemin: f.name, texte }
  },
  enregistrerSource: async (texte, chemin, _machine, nom) => {
    const fichier = (chemin ?? nom).split(/[\\/]/).pop() || nom
    enregistrerFichier(/\.\w+$/.test(fichier) ? fichier : `${fichier}.s`, new TextEncoder().encode(texte.replace(/\r?\n/g, '\r\n')), 'text/plain')
    return { ok: true, chemin: fichier }
  },
  fabriquerPrg: async (source, format = 'prg', dossier) => fabriquerPrg(source, format, dossier),
  exporterPdf: async (html, nom) => ({ ok: imprimerHtml(html, nom), chemin: `${nom}.pdf` }),
  emulateursEtat: async () => [etatAmiga()],
  emulateurInstaller: async () => ({ ok: true }),
  emulateurDesinstaller: async () => {},
  emulateurLancer: async () => ({ ok: true }),
  emulateurEssayer: async (_id, source, nom, dossier) => {
    const d = fabriquerDisquette(source, nom, dossier)
    if (!d.adf) return { ok: false, erreur: d.raison }
    await lancerDansEmulateur(d.adf, d.nom)
    return { ok: true, chemin: `DF0:${d.nom}`, manuel: false }
  },
  romsEtat: async (): Promise<Partial<Record<'atari' | 'amiga', RomPublique>>> => ({}),
  romChoisir: async () => ({ ok: false }),
  romAdfChoisir: async () => ({ ok: false }),
  romUtiliser: async () => {},
  romRetirer: async () => {},
  ouvrirPartage: async () => '',
  surProgressionEmulateur: () => () => {},
  surFinEssai: () => () => {}
}

window.api = api
