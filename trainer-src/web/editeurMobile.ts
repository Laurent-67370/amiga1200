/**
 * Téléphone en portrait : les éditeurs de code (bac à sable, exemples, exercices) font revenir les longues lignes
 * à la ligne, au lieu de défiler vers la droite et de cacher le début des instructions. Sur un écran large, ou quand
 * le téléphone passe en paysage, les lignes redeviennent normales.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'

const etroit = matchMedia('(max-width: 900px)')
const editeurs = new Set<monaco.editor.ICodeEditor>()

function regler(ed: monaco.editor.ICodeEditor): void {
  ed.updateOptions({ wordWrap: etroit.matches ? 'on' : 'off', wrappingIndent: 'indent' })
}

export function installerEditeurMobile(): void {
  monaco.editor.onDidCreateEditor((ed) => {
    editeurs.add(ed)
    ed.onDidDispose(() => editeurs.delete(ed))
    regler(ed)
  })
  etroit.addEventListener('change', () => editeurs.forEach(regler))
}
