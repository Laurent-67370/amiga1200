/** Le contenu des cours est intégré à la page : il est lu dans /content (voir fs.ts). */
export const app = { isPackaged: false, getAppPath: (): string => '/', getLocale: (): string => navigator.language }
export default { app }

/* Pour le typage de src/preload/index.ts (seul son type Api sert ici) */
type Ecouteur = (...args: never[]) => void
export const contextBridge = { exposeInMainWorld: (_nom: string, _api: unknown): void => {} }
export const ipcRenderer = {
  invoke: async (_canal: string, ..._args: unknown[]): Promise<never> => {
    throw new Error('pas de processus principal dans le navigateur')
  },
  on: (_canal: string, _f: Ecouteur): void => {},
  removeListener: (_canal: string, _f: Ecouteur): void => {}
}
