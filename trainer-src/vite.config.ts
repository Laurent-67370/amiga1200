/**
 * Construction du 68k Trainer pour le navigateur et l'application Android.
 *
 * Le code de 68k-trainer (sous-module, non modifié) est repris tel quel :
 * - l'interface (src/renderer) parle à `window.api`, réalisé dans le navigateur par web/api.ts ;
 * - le code du processus principal qui sert (contenu des cours, assemblage) lit le dossier content/,
 *   intégré à la page (module virtuel), à travers de petites imitations de fs, path et electron (web/shims) ;
 * - deux modules de l'interface sont remplacés (web/overrides) et quelques textes adaptés (REMPLACEMENTS),
 *   chacun vérifié : si le code d'origine change, la construction s'arrête au lieu de se tromper en silence.
 */
import { defineConfig, type Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const ICI = __dirname
const AMONT = resolve(ICI, '68k-trainer')
const RENDERER = join(AMONT, 'src/renderer/src')
const CONTENU = join(AMONT, 'content')

const TEXTE = /\.(md|json|s|i|asm|txt)$/i

function contenuVirtuel(): Plugin {
  const id = 'virtual:contenu'
  return {
    name: 'contenu-68k-trainer',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(i) {
      if (i !== '\0' + id) return null
      const fichiers: Record<string, string | { b64: string }> = {}
      const parcourir = (d: string): void => {
        for (const nom of readdirSync(d)) {
          const p = join(d, nom)
          if (statSync(p).isDirectory()) parcourir(p)
          else {
            this.addWatchFile(p)
            const cle = 'content/' + relative(CONTENU, p).split(sep).join('/')
            fichiers[cle] = TEXTE.test(nom) ? readFileSync(p, 'utf-8') : { b64: readFileSync(p).toString('base64') }
          }
        }
      }
      parcourir(CONTENU)
      return `export default ${JSON.stringify(fichiers)}`
    }
  }
}

function infosConstruction(): Plugin {
  const id = 'virtual:build-info'
  const git = (cmd: string, cwd: string): string => {
    try {
      return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  return {
    name: 'infos-construction',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(i) {
      if (i !== '\0' + id) return null
      const amont = JSON.parse(readFileSync(join(AMONT, 'package.json'), 'utf-8')).version as string
      const num = process.env.GITHUB_RUN_NUMBER
      const info = {
        version: `${amont} (web${num ? ' ' + num : ''}, ${git('git rev-parse --short HEAD', ICI) || 'local'})`,
        amont: git('git rev-parse --short HEAD', AMONT),
        year: new Date().getFullYear(),
        builtAt: new Date().toISOString()
      }
      return `export default ${JSON.stringify(info)}`
    }
  }
}

/** Modules de l'interface d'origine remplacés par ceux de web/overrides. */
const REMPLACES: Record<string, string> = {
  [join(RENDERER, 'exportPrg.ts')]: join(ICI, 'web/overrides/exportPrg.ts'),
  [join(RENDERER, 'views/emulateurs.ts')]: join(ICI, 'web/overrides/emulateurs.ts')
}

/** Adaptations du code d'origine : [fichier, avant, après] ; « @chemin » pour un fichier hors de l'interface (depuis src). */
const REMPLACEMENTS: [string, string | RegExp, string][] = [
  // Ce portage suit le parcours Amiga : la machine est toujours l'Amiga 500 (le tronc commun du 68000 compris)
  ['progressionStore.ts', "return state?.machine ?? 'atari'", "return 'amiga'"],
  // Le vrai Amiga est au-dessus de l'ÉCRAN (web/amigaIntegre.ts) : plus d'onglet « Émulateur »
  ['main.ts', "  { id: 'emulateurs', render: renderEmulateurs },\n", ''],
  ['main.ts', '<span class="app-title">68k Trainer 2</span>', '<span class="app-title">68k Trainer <small>Amiga</small></span>'],
  ['main.ts', "emulateurs: 'Émulateurs'", "emulateurs: 'Émulateur'"],
  ['main.ts', "emulateursTitre: 'Installer et lancer Hatari (Atari ST) et WinUAE (Amiga)'", "emulateursTitre: \"L'émulateur Amiga 500 / 1200 où « Essayer » lance tes programmes\""],
  ['main.ts', "emulateurs: 'Emulators'", "emulateurs: 'Emulator'"],
  ['main.ts', "emulateursTitre: 'Install and run Hatari (Atari ST) and WinUAE (Amiga)'", "emulateursTitre: 'The Amiga 500 / 1200 emulator where “Try” runs your programs'"],
  ['views/trainer.ts', "essayer: 'Essayer dans {emulateur}'", "essayer: 'Essayer sur l’Amiga'"],
  ['views/trainer.ts', "essayer: 'Try in {emulateur}'", "essayer: 'Try on the Amiga'"],
  ['views/trainer.ts', "essayerTitre: \"Lancer le programme dans un vrai émulateur (onglet « Émulateurs » pour l'installer)\"", "essayerTitre: \"Lancer le programme dans l'émulateur Amiga 500 / 1200 (onglet « Émulateur » pour choisir le modèle)\""],
  ['views/trainer.ts', "essayerTitre: 'Run the program in a real emulator (install it from the “Emulators” tab)'", "essayerTitre: 'Run the program in the Amiga 500 / 1200 emulator (choose the model in the “Emulator” tab)'"],
  ['views/parcours/ecrans.ts', "essayer: 'Essayer dans {emulateur}'", "essayer: 'Essayer sur l’Amiga'"],
  ['views/parcours/ecrans.ts', "essayer: 'Try in {emulateur}'", "essayer: 'Try on the Amiga'"],
  ['views/parcours/ecrans.ts', "essayerTitre: \"Lancer ton programme dans un vrai émulateur (onglet « Émulateurs » pour l'installer)\"", "essayerTitre: \"Lancer ton programme dans l'émulateur Amiga 500 / 1200 (onglet « Émulateur » pour choisir le modèle)\""],
  ['views/parcours/ecrans.ts', "essayerTitre: 'Run your program in a real emulator (see the “Emulators” tab to install it)'", "essayerTitre: 'Run your program in the Amiga 500 / 1200 emulator (choose the model in the “Emulator” tab)'"],
  // Fenêtre du CLI dessinée sur l'écran de l'Amiga simulé (web/consoleAmiga.ts), en exécution interactive seulement
  [
    '@platforms/amiga/kickstart.ts',
    'function ecrireConsole(cpu: Cpu, adresse: number, longueur: number): void {',
    'function ecrireConsole(cpu: Cpu, adresse: number, longueur: number): void {\n' +
      '    ecrireConsole0(cpu, adresse, longueur)\n' +
      '    if (options.clavierInteractif) (globalThis as { __consoleAmiga?: (c: Cpu) => void }).__consoleAmiga?.(cpu)\n' +
      '  }\n' +
      '  function ecrireConsole0(cpu: Cpu, adresse: number, longueur: number): void {'
  ],
  [
    '@platforms/amiga/kickstart.ts',
    'function lireConsole(cpu: Cpu): boolean {',
    'function lireConsole(cpu: Cpu): boolean {\n' +
      '    try {\n' +
      '      return lireConsole0(cpu)\n' +
      '    } finally {\n' +
      '      if (options.clavierInteractif) (globalThis as { __consoleAmiga?: (c: Cpu) => void }).__consoleAmiga?.(cpu)\n' +
      '    }\n' +
      '  }\n' +
      '  function lireConsole0(cpu: Cpu): boolean {'
  ],
  // Programme terminé juste après avoir écrit : l'écran balaye une image de plus pour montrer le texte du CLI
  [
    'components/ecranAmiga.ts',
    '    const image = materielAmiga(cpu)?.image()',
    '    ;(globalThis as { __consoleAvantImage?: (c: Cpu, m: unknown) => void }).__consoleAvantImage?.(cpu, materielAmiga(cpu))\n' +
      '    const image = materielAmiga(cpu)?.image()'
  ]
]

function adaptationAmont(): Plugin {
  const vus = new Set<number>()
  return {
    name: 'adaptation-68k-trainer',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || Object.values(REMPLACES).includes(importer)) return null
      const r = await this.resolve(source, importer, { ...options, skipSelf: true })
      return r && REMPLACES[r.id] ? REMPLACES[r.id] : null
    },
    transform(code, id) {
      // Fichiers de l'interface : chemin depuis src/renderer/src ; autres fichiers d'origine : « @ » + chemin depuis src
      const rel = id.startsWith(RENDERER)
        ? relative(RENDERER, id).split(sep).join('/')
        : id.startsWith(join(AMONT, 'src'))
          ? '@' + relative(join(AMONT, 'src'), id).split(sep).join('/')
          : null
      if (!rel) return null
      let sortie = code
      REMPLACEMENTS.forEach(([fichier, avant, apres], i) => {
        if (fichier !== rel) return
        const n = typeof avant === 'string' ? sortie.split(avant).length - 1 : (sortie.match(avant) ?? []).length
        if (n !== 1) this.error(`68k-trainer a changé : « ${String(avant).slice(0, 60)} » trouvé ${n} fois dans ${rel}`)
        sortie = sortie.replace(avant, apres)
        vus.add(i)
      })
      return sortie === code ? null : { code: sortie, map: null }
    },
    buildEnd() {
      const manquants = REMPLACEMENTS.filter((_, i) => !vus.has(i))
      if (manquants.length) this.error('adaptations non appliquées : ' + manquants.map((m) => m[0] + ' ' + String(m[1]).slice(0, 40)).join(' ; '))
    }
  }
}

/** Liste des fichiers construits, pour le service worker (copie hors ligne). */
function listeHorsLigne(): Plugin {
  return {
    name: 'liste-hors-ligne',
    apply: 'build',
    writeBundle(options, bundle) {
      const fichiers = ['./', ...Object.keys(bundle).filter((f) => !f.endsWith('.map'))]
      const sw = join(options.dir!, 'sw.js')
      const version = Date.now().toString(36)
      writeFileSync(sw, readFileSync(sw, 'utf-8').replace('__FICHIERS__', JSON.stringify(fichiers)).replace('__VERSION__', version))
    }
  }
}

export default defineConfig({
  root: ICI,
  base: './',
  publicDir: 'public',
  resolve: {
    alias: [
      { find: /^electron$/, replacement: join(ICI, 'web/shims/electron.ts') },
      { find: /^fs\/promises$/, replacement: join(ICI, 'web/shims/fs-promises.ts') },
      { find: /^fs$/, replacement: join(ICI, 'web/shims/fs.ts') },
      { find: /^path$/, replacement: join(ICI, 'web/shims/path.ts') },
      { find: '@renderer', replacement: RENDERER },
      { find: '@shared', replacement: join(AMONT, 'src/shared') }
    ]
  },
  plugins: [contenuVirtuel(), infosConstruction(), adaptationAmont(), listeHorsLigne()],
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    rollupOptions: { output: { manualChunks: (id) => (id.includes('monaco-editor') ? 'monaco' : undefined) } }
  },
  server: { fs: { allow: [resolve(ICI, '..')] } }
})
