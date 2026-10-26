# Crystal Hammer — Android natif

Recréation jouable du casse-briques **Crystal Hammer**, écrite en Kotlin avec les API Android natives. Le jeu n'utilise ni émulateur, ni moteur externe, ni WebView.

## Contenu

- les 30 dispositions de niveaux contenues dans le disque ADF fourni ;
- boucle de jeu à pas fixe : 120 mises à jour logiques par seconde ;
- trois modes de contrôle tactile : glissement relatif, position directe et zones gauche/droite ;
- prise en charge du clavier et des manettes : croix ou stick pour piloter, bouton A/X, Entrée ou Espace pour lancer et tirer ;
- trois difficultés : **Amiga**, **Normale** et **Facile**, avec vitesses, vies, fréquences de bonus et malus distincts ;
- balles multiples, vaisseau élargi, mode collant, tir laser, balle lente, vie supplémentaire, saut de niveau et malus ;
- vie supplémentaire aux paliers de score et nombre de balles plafonné selon la difficulté ;
- statistiques de fin de partie : tableaux, cristaux, bonus, meilleure série et précision laser ;
- cristaux à résistance variable et blocs indestructibles ;
- 30 décors vectoriels distincts, cristaux à facettes, murs métalliques et vaisseau animé ;
- traînées de balles, particules, flashes et secousses d'impact, tous regroupés dans une option désactivable ;
- musique chiptune originale générée par synthèse, effets sonores distincts et volumes indépendants ;
- écran « Crystal Hammer Heroes » avec top 20 local et signature de trois caractères ;
- transition animée avant chaque tableau et démo automatique après 60 secondes d'inactivité ;
- mini-guide animé des huit bonus sur l'accueil ;
- décors mis en cache et collisions limitées aux cellules voisines ;
- pause avec réglages du son, de la musique, des vibrations, de la sensibilité, des contrôles et des effets visuels ;
- checkpoints au début des tableaux, incluant difficulté et statistiques, reprise après interruption et tutoriel interactif.

## Nouveautés de la version 1.8.0

- **Sons entièrement synthétisés** : les bips téléphoniques (`ToneGenerator`) sont remplacés par neuf effets courts générés à la volée (glissandos carrés, arpèges, bruit), sans claquement ni saturation ;
- **départ de balle visé** : l'angle de lancement dépend de l'endroit où la balle repose sur le vaisseau (au centre, le côté est tiré au sort) au lieu de partir toujours à droite ;
- **tir laser continu** : garder le doigt, la touche ou le bouton enfoncé tire en rafale, à la cadence normale du laser ;
- **multitouche** : un second doigt lance la balle ou tire sans interrompre le pilotage ; en mode zones, on peut se déplacer et tirer en même temps ; le pilotage passe sans saut au doigt restant ;
- **manettes** : croix envoyée comme axe « chapeau » (cas de nombreuses manettes Bluetooth) prise en charge, START, P ou Lecture/Pause mettent en pause et reprennent ;
- **pause automatique** dès que le jeu perd le focus (volet de notifications, appel, fenêtre système) ;
- **écrans à encoche ou caméra perforée** : le terrain de jeu reste dans la zone sûre, le décor s'étend dessous ;
- **vie supplémentaire signalée** par un son et un bandeau dédiés ;
- **corrections** : le bonus multi-balles n'est plus perdu quand la balle est encore collée ; le bonus « balle lente » n'est plus annulé au premier rebond sur le vaisseau ;
- **performances** : les 400 cristaux sont dessinés dans un calque mis en cache et redessinés seulement quand ils changent, décors en cache à la résolution de l'écran (plus nets sur les grands écrans), dégradés de la balle et des bonus créés une seule fois, fichier des niveaux lu une seule fois, record enregistré aux changements d'écran plutôt qu'à chaque cristal touché ;
- nouveaux tests unitaires du moteur (départ, multi-balles, tir continu, vie supplémentaire, calque des cristaux) et des effets sonores.

## Ouvrir et compiler

1. Ouvrir ce dossier dans **Android Studio**.
2. Installer **Android SDK 35** et utiliser **JDK 17**.
3. Laisser Gradle synchroniser le projet.
4. Lancer l'application sur un appareil Android 6.0 (API 23) ou plus récent.

En ligne de commande, avec le SDK Android configuré :

```bash
./gradlew testDebugUnitTest assembleDebug assembleRelease
```

Les APK sont générés dans :

```text
app/build/outputs/apk/debug/app-debug.apk
app/build/outputs/apk/release/app-release-unsigned.apk
```

La variante `release` est volontairement non signée dans le projet source : la clé privée ne doit jamais être incluse dans une archive de code. Signer l'APK avec `apksigner` et la clé release conservée séparément, puis vérifier avec `apksigner verify` et `zipalign -c 4`.

Pour les mises à jour, il faut conserver exactement la même clé release. Un changement de clé empêche Android d'installer la nouvelle version par-dessus l'ancienne.

## Structure

- `MainActivity.kt` : activité plein écran et cycle de vie ;
- `GameView.kt` : rendu Canvas, entrées tactiles/manette/clavier, réglages et boucle d'affichage ;
- `GameEngine.kt` : physique, collisions, bonus, score et progression ;
- `GameBalance.kt` : équilibrage testable des difficultés et des bonus ;
- `LevelDecoder.kt` : lecture des grilles Amiga de 20 × 20 cellules ;
- `Models.kt` : modèles de données et statistiques ;
- `SoundPlayer.kt` : effets sonores synthétisés et musique originale ;
- `app/src/main/assets/levels.bin` : 30 niveaux, 12 000 octets.

## Format des niveaux

Chaque niveau contient 400 octets. Une valeur nulle est une case vide, `255` un bloc solide. Pour les autres valeurs, le quartet haut code la couleur et le quartet bas le nombre de coups nécessaires.

## Note sur les droits

Crystal Hammer est une œuvre de reLINE Software. Ce projet est une recréation technique réalisée à partir du fichier fourni par l'utilisateur : le code, les dessins, la musique et les sons sont nouveaux. Les dispositions de niveaux proviennent de ce fichier. Aucune ROM, aucun exécutable Amiga et aucun graphisme ou échantillon audio original ne sont inclus. Vérifiez vos droits avant toute distribution publique ou commerciale.
