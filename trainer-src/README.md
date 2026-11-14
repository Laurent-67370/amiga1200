# 68k Trainer · Amiga 500 / 1200 (web et Android)

Le **68k Trainer** de Yannick Montfort ([github.com/yannickmontfort-rgb/68k-trainer](https://github.com/yannickmontfort-rgb/68k-trainer),
application Electron pour Windows, Linux et macOS) dans le navigateur et sur **Android**, consacré au parcours
**Amiga** : les trois chapitres du 68000, puis Exec, les puces, le Copper, le Blitter, les sprites, Paula et
l'exécutable AmigaDOS. Il est relié à l'émulateur de ce dépôt : le bouton **Essayer sur l'Amiga** lance ton
programme sur un vrai Amiga 500 ou Amiga 1200 émulé (WinUAE 6).

- **Web** : <https://laurent-67370.github.io/amiga1200/trainer/> (installable, fonctionne hors ligne)
- **Android** : `68k-trainer-amiga.apk`, sur <https://laurent-67370.github.io/amiga1200/trainer/68k-trainer-amiga.apk>
  ou dans la version [trainer-dev](https://github.com/laurent-67370/amiga1200/releases/tag/trainer-dev) (Android 8 et plus).
  L'application contient toute la page : les cours, l'assembleur et le pas-à-pas marchent sans connexion.

## Ce qui est repris, ce qui change

Tout le contenu pédagogique et le moteur viennent de 68k-trainer, **sans modification** (sous-module
`68k-trainer/`, version figée) : cours, exemples, prédictions, exercices et QCM ; l'assembleur compatible Devpac ; le
68000 et l'Amiga 500 simulés (Copper, Blitter, sprites, Paula, CIA, Kickstart simulé) ; le débogueur ; les profils,
la progression et le certificat.

| Application d'origine (Electron) | Ici |
|---|---|
| Atari ST ou Amiga 500, au choix | Amiga 500 seulement (le tronc commun du 68000 compris) |
| Fichiers et profils dans le dossier de l'utilisateur | Stockage local du navigateur (ou de l'application) ; export et import de profil `.68kprofil` comme avant |
| Exporter : boîte « Enregistrer sous » | Téléchargement (web) ou sélecteur de fichiers d'Android |
| Émulateurs installés sous Windows (WinUAE + AROS) | L'émulateur amiga1200 : onglet **Émulateur**, choix **Amiga 500** ou **Amiga 1200** |
| Certificat en PDF | Boîte d'impression → « Enregistrer au format PDF » |
| Écran d'ordinateur | Mise en page adaptée au téléphone (colonnes empilées, onglets qui défilent) |

## « Essayer sur l'Amiga »

1. Le programme est assemblé en exécutable AmigaDOS (avec le code de démarrage Shell/Workbench de 68k-trainer),
   chargé en Chip RAM pour que les puces voient ses listes Copper, images et sons.
2. Il est posé sur une **disquette amorçable** (OFS, lisible par le Kickstart 1.3), avec une `S:Startup-Sequence` qui
   le lance puis lance `Fin`, un petit programme qui garde la fenêtre ouverte jusqu'au clic gauche.
3. La disquette, compressée, passe dans l'adresse de l'émulateur (`#nom=…&modele=a500|a1200&trainer=…`) :
   l'émulateur la range dans sa Bibliothèque (à la place de l'essai précédent du même programme), la met dans
   DF0: et démarre le modèle choisi (`wasm/app/trainer-puae.js`).

Sur le web, le Trainer et l'émulateur partagent le même site : le Kickstart importé dans l'émulateur sert aussi aux
essais. Sans Kickstart 1.3, l'émulateur prend un Amiga 1200 avec AROS (le programme tourne quand même). Dans
l'application Android, l'émulateur s'ouvre dans le navigateur du téléphone.

## Construire

```bash
git submodule update --init trainer-src/68k-trainer
cd trainer-src
npm ci
npm run typecheck
npm run build          # page dans dist/
npm run dev            # serveur de développement
gradle -p android assembleRelease   # APK (Android SDK nécessaire), après npm run build
```

Le workflow `.github/workflows/trainer.yml` fait tout cela à chaque modification de `trainer-src/` et publie la page et
l'APK dans `trainer/` du site. Mettre à jour le cours : `cd trainer-src/68k-trainer && git fetch && git checkout <commit>`, puis construire ; si le
code d'origine a changé à un endroit adapté ici, la construction s'arrête et dit lequel (`vite.config.ts`).

| Fichier | Rôle |
|---|---|
| `vite.config.ts` | Assemble le code d'origine et la couche web ; contenu des cours intégré ; adaptations vérifiées |
| `web/api.ts` | `window.api` de l'application d'origine, réalisé dans le navigateur |
| `web/profils.ts` | Profils et progression (stockage local, mot de passe haché PBKDF2) |
| `web/disquette.ts`, `web/essai.ts` | Disquette amorçable et ouverture de l'émulateur |
| `web/plateforme.ts` | Web ou Android : fichiers, liens, impression |
| `web/overrides/` | Les deux modules de l'interface remplacés (export, onglet Émulateur) |
| `web/shims/` | `fs`, `path`, `electron` imités pour le code du processus principal |
| `android/` | Application Android (WebView, sans dépendance) : la page servie depuis l'APK, pont `AndroidTrainer` |

## Licence

68k-trainer est sous licence **GPL v3 ou ultérieure** (© Yannick Montfort) ; ce portage (dossier `trainer-src/`) l'est
aussi. Les ROM Kickstart ne sont pas fournies.
