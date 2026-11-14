/**
 * Système de fichiers en lecture seule pour le code d'origine : le dossier content/ de 68k Trainer,
 * intégré à la page au moment de la construction (module virtuel « virtual:contenu »).
 */
import fichiers from 'virtual:contenu'

const binaires = new Map<string, Uint8Array>()

function cle(chemin: string): string {
  return chemin.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function lireOctets(chemin: string): Uint8Array | null {
  const k = cle(chemin)
  const v = fichiers[k]
  if (v === undefined) return null
  if (typeof v === 'string') return new TextEncoder().encode(v)
  let b = binaires.get(k)
  if (!b) {
    const s = atob(v.b64)
    b = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
    binaires.set(k, b)
  }
  return b
}

export function lireTexte(chemin: string): string | null {
  const v = fichiers[cle(chemin)]
  if (v === undefined) return null
  return typeof v === 'string' ? v : new TextDecoder('latin1').decode(lireOctets(chemin)!)
}

export function estDossier(chemin: string): boolean {
  const k = cle(chemin).replace(/\/$/, '') + '/'
  return Object.keys(fichiers).some((f) => f.startsWith(k))
}

export function listerDossier(chemin: string): { name: string; dossier: boolean }[] {
  const k = cle(chemin).replace(/\/$/, '') + '/'
  const vus = new Map<string, boolean>()
  for (const f of Object.keys(fichiers)) {
    if (!f.startsWith(k)) continue
    const reste = f.slice(k.length)
    const i = reste.indexOf('/')
    vus.set(i < 0 ? reste : reste.slice(0, i), i >= 0)
  }
  return [...vus].map(([name, dossier]) => ({ name, dossier }))
}

function introuvable(chemin: string): Error {
  return Object.assign(new Error(`ENOENT: ${chemin}`), { code: 'ENOENT' })
}

export function existsSync(chemin: string): boolean {
  return fichiers[cle(chemin)] !== undefined || estDossier(chemin)
}

export function statSync(chemin: string): { isDirectory: () => boolean; isFile: () => boolean } {
  if (!existsSync(chemin)) throw introuvable(chemin)
  const d = estDossier(chemin)
  return { isDirectory: () => d, isFile: () => !d }
}

export function readFileSync(chemin: string): Uint8Array
export function readFileSync(chemin: string, encodage: string): string
export function readFileSync(chemin: string, encodage?: string): Uint8Array | string {
  if (encodage) {
    const t = lireTexte(chemin)
    if (t === null) throw introuvable(chemin)
    return t
  }
  const o = lireOctets(chemin)
  if (!o) throw introuvable(chemin)
  return o
}

export default { existsSync, statSync, readFileSync }
