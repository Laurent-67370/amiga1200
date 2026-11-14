import { existsSync, listerDossier, readFileSync } from './fs'

export function readFile(chemin: string): Promise<Uint8Array>
export function readFile(chemin: string, encodage: string): Promise<string>
export async function readFile(chemin: string, encodage?: string): Promise<Uint8Array | string> {
  return encodage ? readFileSync(chemin, encodage) : readFileSync(chemin)
}

export async function access(chemin: string): Promise<void> {
  if (!existsSync(chemin)) throw Object.assign(new Error(`ENOENT: ${chemin}`), { code: 'ENOENT' })
}

export async function readdir(chemin: string, _options?: unknown): Promise<{ name: string; isFile: () => boolean; isDirectory: () => boolean }[]> {
  if (!existsSync(chemin)) throw Object.assign(new Error(`ENOENT: ${chemin}`), { code: 'ENOENT' })
  return listerDossier(chemin).map((e) => ({ name: e.name, isFile: () => !e.dossier, isDirectory: () => e.dossier }))
}

export default { readFile, access, readdir }
