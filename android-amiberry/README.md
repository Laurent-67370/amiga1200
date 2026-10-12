# Amiberry pour Android (compilation personnelle)

L'action `.github/workflows/amiberry-android.yml` compile l'application Android d'[Amiberry](https://amiberry.com)
(BlitterStudio, licence GPL v3) depuis ses sources officielles et publie l'APK dans les *Releases* de ce dépôt.

- Version : `v8.3.0` par défaut ; une autre se compile depuis l'onglet *Actions* → « Amiberry pour Android » → *Run workflow*.
- Architectures : arm64 (téléphones et tablettes) et x86_64.
- Modification : l'écran de l'émulateur et son interface de réglages s'affichent toujours à l'horizontale
  (en portrait, l'interface ImGui d'Amiberry est illisible sur un téléphone).
- Interface Android traduite en français (`res/values-fr/strings.xml`, 342 textes sur 364 ; les termes techniques restent tels quels).
- Interface avancée (ImGui) : zones de toucher élargies et barres de défilement plus larges.
- Interface avancée à l'échelle de l'écran : la fenêtre de la version ordinateur (860 x 720) tient entière en paysage, sans texte tronqué.
- Signature : `amiberry-perso.jks`, une clé à usage personnel (mot de passe dans l'action). La garder permet d'installer
  les versions suivantes par-dessus sans perdre ses réglages. Ce n'est pas la clé du Play Store : la version officielle
  et celle-ci ne peuvent pas se mettre à jour l'une l'autre.

La version du Play Store, quand elle sera publique, est le moyen de soutenir le développeur.
