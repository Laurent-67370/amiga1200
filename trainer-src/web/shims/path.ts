/** Chemins POSIX pour le code du processus principal d'origine (lecture du contenu, INCLUDE). */
export function normalize(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const s of p.replace(/\\/g, '/').split('/')) {
    if (!s || s === '.') continue
    if (s === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!abs) out.push('..')
    } else out.push(s)
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.')
}
export const join = (...parts: string[]): string => normalize(parts.filter(Boolean).join('/'))
export const isAbsolute = (p: string): boolean => p.startsWith('/')
export function relative(from: string, to: string): string {
  const a = normalize(from).split('/').filter(Boolean)
  const b = normalize(to).split('/').filter(Boolean)
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}
export const dirname = (p: string): string => normalize(p).replace(/\/[^/]*$/, '') || '/'
export const basename = (p: string): string => normalize(p).split('/').pop() ?? ''
export const sep = '/'
export default { normalize, join, isAbsolute, relative, dirname, basename, sep }
