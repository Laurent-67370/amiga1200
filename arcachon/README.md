# Notre-Dame d’Arcachon — Visite 3D

Maquette interactive (Three.js) de l’église Notre-Dame d’Arcachon, interprétée à partir de photographies.
Les volumes principaux, la brique, la pierre, le clocher, le portail et les rosaces sont représentés ; les zones
non visibles sur les photos sont reconstituées de manière cohérente, sans valeur de relevé architectural.

▶ **https://laurent-67370.github.io/amiga1200/arcachon/**

Glisser pour tourner, molette ou pincement pour zoomer, clic droit ou deux doigts pour déplacer le point de vue.
Quatre cadrages (vue d’ensemble, parvis, clocher, rosace), rotation automatique, deux ambiances lumineuses,
les photos sources et l’enregistrement d’une image.

## Contenu

- `index.html`, `assets/`, `photos/` : version compilée, servie telle quelle par GitHub Pages.
- `source/` : sources Vite (`src/church.js` pour la géométrie, `src/scene.js` pour la scène et l’interface).

## Recompiler

```sh
cd source
mkdir -p public && cp -r ../photos public/
npm ci && npx vite build
cp -r dist/index.html dist/assets ..   # remplacer l’ancien assets/index-*.js
```
