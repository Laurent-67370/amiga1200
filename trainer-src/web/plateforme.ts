/**
 * Ce qui dépend de l'endroit où tourne le Trainer : navigateur (page web, PWA) ou application Android
 * (WebView, pont « AndroidTrainer » fourni par MainActivity.kt).
 */
interface PontAndroid {
  enregistrer(nom: string, base64: string, mime: string): void
  ouvrirLien(url: string): void
  /** Absent des versions de l'APK antérieures à l'envoi vers l'application Amiga 1200 */
  lancerAmiga?(nom: string, gzBase64: string, modele: string): boolean
  /** Émulateur amiga1200 intégré à l'APK (absent des versions antérieures) */
  emulateurInterne?(): boolean
  ouvrirEmulateur?(fragment: string): void
  imprimer(html: string, nom: string): void
  version(): string
}

declare global {
  interface Window {
    AndroidTrainer?: PontAndroid
  }
}

export const android = (): PontAndroid | undefined => window.AndroidTrainer

/** Adresse publique de l'émulateur (application Android, ou Trainer ouvert depuis un autre site). */
export const EMULATEUR_PUBLIC = 'https://laurent-67370.github.io/amiga1200/'

/**
 * L'émulateur amiga1200 : le Trainer web est publié dans son sous-dossier trainer/, l'émulateur est donc
 * juste au-dessus (même origine : même Bibliothèque, même Kickstart). L'application Android ouvre la version publiée.
 */
/** L'émulateur intégré à l'application Android peut démarrer sur ce téléphone. */
export function emulateurInterne(): boolean {
  try {
    return !!android()?.emulateurInterne?.()
  } catch {
    return false
  }
}

export function adresseEmulateur(): string {
  if (android() || !/^https?:$/.test(location.protocol)) return EMULATEUR_PUBLIC
  if (/\/trainer\/(index\.html)?$/.test(location.pathname)) return new URL('../', location.href).href
  return EMULATEUR_PUBLIC
}

function base64(octets: Uint8Array): string {
  let s = ''
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Propose d'enregistrer un fichier (téléchargement, ou sélecteur de fichier d'Android). */
export function enregistrerFichier(nom: string, octets: Uint8Array, mime = 'application/octet-stream'): void {
  const a = android()
  if (a) return a.enregistrer(nom, base64(octets), mime)
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: mime }))
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** Ouvre un lien hors du Trainer (navigateur du téléphone dans l'application Android). */
export function ouvrirLien(url: string, cible = '_blank'): void {
  const a = android()
  if (a) return a.ouvrirLien(url)
  const w = window.open(url, cible)
  if (!w) location.href = url
}

/** Choisit un fichier sur l'appareil (fonctionne aussi dans la WebView d'Android). */
export function choisirFichier(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    let fini = false
    input.onchange = () => {
      fini = true
      resolve(input.files?.[0] ?? null)
      input.remove()
    }
    // Annulation : pas d'événement standard partout ; au retour sur la page, on abandonne s'il n'y a rien
    window.addEventListener(
      'focus',
      () =>
        setTimeout(() => {
          if (!fini) resolve(null)
        }, 1500),
      { once: true }
    )
    document.body.appendChild(input)
    input.click()
  })
}

/** Imprime une page HTML (certificat) : « Enregistrer au format PDF » dans la boîte d'impression. */
export function imprimerHtml(html: string, nom: string): boolean {
  const a = android()
  if (a) {
    a.imprimer(html, nom)
    return true
  }
  const cadre = document.createElement('iframe')
  cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(cadre)
  const doc = cadre.contentDocument!
  doc.open()
  doc.write(html.replace('<head>', `<head><title>${nom.replace(/[<&]/g, '')}</title>`))
  doc.close()
  setTimeout(() => {
    cadre.contentWindow?.focus()
    cadre.contentWindow?.print()
    setTimeout(() => cadre.remove(), 60000)
  }, 300)
  return true
}

/** Disquette compressée (gzip), en base64. */
export async function compresser(octets: Uint8Array): Promise<string> {
  const flux = new Blob([octets as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return base64(new Uint8Array(await new Response(flux).arrayBuffer()))
}

/** Disquette compressée (gzip) puis encodée pour l'adresse de l'émulateur (base64url). */
export async function compresserPourAdresse(octets: Uint8Array): Promise<string> {
  return (await compresser(octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
