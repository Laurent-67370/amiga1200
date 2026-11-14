declare module 'virtual:contenu' {
  const fichiers: Record<string, string | { b64: string }>
  export default fichiers
}
declare module 'virtual:build-info' {
  const info: { version: string; amont: string; year: number; builtAt: string }
  export default info
}

/** Le code du processus principal cite process.resourcesPath (application empaquetée) : jamais atteint ici. */
declare const process: { resourcesPath: string; cwd: () => string }
