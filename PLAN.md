# noise-overlay

Une petite mascotte qui réagit au bruit de la classe (CE1-CE2). Un `.exe`
portable, sans installeur, sans droits admin.

## Stack

| Choix | Pourquoi |
|---|---|
| **Electron + TypeScript** | Seul moyen d'avoir une fenêtre transparente, sans cadre, always-on-top. Et c'est du TS. |
| **`tsc` seul** | Vite écarté en route : trois scripts chargés en `<script src>`, rien à bundler. |
| **Web Audio API** (`getUserMedia` + `AnalyserNode`) | Le niveau sonore en ~10 lignes. Pas de dépendance audio native. |
| **SVG inline** | Le personnage. Se déforme, s'anime en CSS, se redimensionne sans perte du coin de l'écran au plein écran. |
| **electron-builder** `--win portable` | Un seul `.exe`. |

Écarté : Tauri (~8 Mo au lieu de ~90, mais toolchain Rust + permissions micro
WebView2 pour une appli qui tourne sur un poste), React (un nombre → un
visage, pas d'état à gérer), `electron-store` (un `JSON.stringify` dans
`app.getPath('userData')` suffit).

## Fenêtres

**Une seule** `BrowserWindow` pour le personnage, deux modes :

```ts
transparent: true, frame: false, alwaysOnTop: true,
skipTaskbar: true, backgroundColor: '#00000000'
```

- **Overlay** : petit, coin de l'écran, par-dessus le cours. La fenêtre fait
  exactement la taille du chat et la page entière est
  `-webkit-app-region: drag` : on attrape le chat n'importe où pour le
  déplacer. Pas de `setIgnoreMouseEvents` — le click-through au pixel près
  demanderait une boucle `mousemove` qui remonte en permanence vers le process
  principal, pour un carré de 360 px qu'on peut simplement déplacer.
- **Plein écran** : la *même* fenêtre en `setFullScreen(true)`. Le SVG scale
  sur le viewport, aucune deuxième mise en page.

Pas de cadre = pas de boutons. Donc **icône dans la barre système** (menu :
plein écran / réglages / quitter) + raccourcis globaux. Le tray est le filet
de sécurité : sans lui, la seule sortie est le gestionnaire de tâches.

Pas de deuxième fenêtre pour les **réglages** : un panneau caché dans la même
page, révélé par raccourci. Le pipeline audio vit dans le renderer, une
seconde fenêtre obligerait à le faire transiter par IPC pour rien.

## Audio

1. **Choix du micro** — `enumerateDevices()`, liste dans les réglages. Le
   micro final est inconnu (intégré, USB, PC de classe) donc on ne suppose
   rien.
2. **Couper les traitements Windows** — non négociable, sinon le gain
   automatique compense le bruit et le niveau paraît constant :
   ```ts
   getUserMedia({ audio: { autoGainControl: false, echoCancellation: false,
                           noiseSuppression: false } })
   ```
3. **Seuil au slider** — pas de calibration automatique. Dans les réglages :
   une barre de niveau live + un slider posé dessus. On voit la barre monter
   quand la classe parle, on pose le curseur là où ça devient gênant. Ça
   supprime la phase d'écoute, la référence stockée et sa dérive, et ça se
   re-règle en pleine séance.
4. **Lissage** — moyenne glissante (~1 s) sur le RMS. Un crayon qui tombe ne
   doit pas fâcher la mascotte.

## Mécanique : jauge de patience

```
niveau lissé ── au-dessus du seuil ──> la jauge descend (vite si c'est fort)
             └─ en dessous ─────────> la jauge remonte (lentement)
```

La mascotte n'affiche pas le bruit instantané mais la jauge : bruyant une
fois = rien, bruyant longtemps = elle se fâche. Ça récompense le calme réel,
pas le silence-puis-cri. Quatre états : content / attentif / inquiet / fâché.

Fonctions pures (normalisation du niveau, mise à jour de la jauge) →
**un `test_*.ts` avec des `assert`**, seul contrôle du projet.

## Personnage

Un état = un SVG, chargés depuis un dossier. J'en dessine un jeu simple
(formes rondes, expressif, lisible du fond de la classe), et le même dossier
accepte un pack d'assets libres si on en trouve mieux. Un seul chemin de
chargement, pas d'abstraction.

## Son

Coupé par défaut, activable dans les réglages (un son doux au passage du
seuil). Config persistée en JSON dans `userData`.

## Étapes

| # | Étape | Fini quand |
|---|---|---|
| 0 | Spike : fenêtre Electron + RMS du micro affiché en chiffre | Le nombre bouge quand on parle, sur la machine cible |
| 1 | Pipeline audio : sélection du micro, lissage, seuil au slider | Barre de niveau lisible, seuil réglable à la souris |
| 2 | Jauge de patience + états (+ le test) | `assert` verts |
| 3 | Personnage SVG, transitions entre états | Lisible du fond de la classe |
| 4 | Fenêtre transparente, drag, click-through, plein écran | Utilisable par-dessus un cours |
| 5 | Tray, raccourcis, réglages, son | Un prof s'en sort sans mode d'emploi |
| 6 | `electron-builder` portable + test en classe | Un `.exe`, double-clic, ça marche |

L'étape 0 avant tout le reste : si les permissions micro ou l'audio coincent
sur la machine cible, tout le reste est du travail perdu.
