# noise-overlay

Un chat posé par-dessus tout ce qui est à l'écran, qui perd patience quand la
classe monte le son. Conçu pour du CE1-CE2 : le niveau sonore n'est pas affiché
en décibels, il est joué par une tête de chat.

Windows uniquement. Un seul `.exe` portable, rien à installer.

## Pour la classe

**[Télécharger la dernière version](https://github.com/Aldresus/noise-overlay/releases/latest)** —
`noise-overlay.exe`, à copier où on veut et à double-cliquer. Pas d'installeur,
pas de droits administrateur.

Au premier lancement, Windows demande l'accès au microphone. Sans micro, pas de
chat.

Le chat apparaît en bas à droite, au-dessus des autres fenêtres. On le déplace
en le tirant à la souris.

### Les quatre humeurs

Le chat a une jauge de patience. Elle se vide quand le bruit dépasse le seuil
réglé, elle se remplit au calme.

| Jauge | Humeur |
|---|---|
| > 75 % | content |
| > 50 % | dresse les oreilles |
| > 25 % | inquiet |
| ≤ 25 % | en a assez |

### Réglages

`Ctrl+Maj+P`, ou clic sur l'icône dans la barre système, ou clic droit sur le
chat.

- **Seuil de bruit** — la ligne jaune, à placer juste au-dessus du bruit de
  travail normal. Réglable au curseur ou en glissant directement sur la jauge.
- **Patience** — en combien de secondes de bruit continu le chat se fâche.
- **Récupération** — en combien de secondes de calme il se remet.
- **Son** — un petit signal quand l'humeur se dégrade d'un cran.
- **Taille du chat**, et un bouton **Réinitialiser la position** qui le renvoie
  dans son coin s'il a disparu de l'écran (typiquement après avoir branché un
  vidéoprojecteur).
- **Microphone** — utile s'il y en a plusieurs.

Les réglages sont écrits dans `settings.json`, sous `%APPDATA%\noise-overlay`,
et rechargés au démarrage suivant. La position du chat, elle, n'est pas
sauvegardée : il revient toujours en bas à droite.

### Raccourcis

| Raccourci | Action |
|---|---|
| `Ctrl+Maj+P` | Réglages |
| `Ctrl+Maj+F` | Plein écran |
| `Ctrl+Maj+Q` | Quitter |

Ils sont globaux : ils marchent même si le chat n'a pas le focus. Fermer la
fenêtre de réglages ne quitte pas l'application — le chat reste. Relancer l'exe
une deuxième fois ne crée pas un second chat, ça ramène le premier au premier
plan.

## Pour développer

```bash
npm start
```

```bash
npm test
```

```bash
npm run dist
```

`dist` produit `release/noise-overlay.exe`. En CI, c'est ce que fait
[`release.yml`](.github/workflows/release.yml) à la publication d'une release
GitHub, avant d'attacher l'exe.

### Comment c'est fait

Electron + TypeScript, `tsc` seul — pas de bundler, pas de framework, pas de
dépendance à l'exécution. Les fichiers de `dist/` sont chargés par de simples
`<script src>` et ne doivent donc contenir aucun `require` : chacun est une
IIFE, et les déclarations partagées vivent une seule fois dans
[`globals.d.ts`](src/globals.d.ts).

Deux fenêtres :

- **l'overlay** ([`index.html`](src/index.html) +
  [`renderer.ts`](src/renderer.ts)) — transparent, sans cadre, toujours au
  dessus. C'est la seule à avoir la permission micro, donc la seule à pouvoir
  lire le flux audio et les noms des périphériques.
- **les réglages** ([`settings.html`](src/settings.html) +
  [`settings.ts`](src/settings.ts)) — une fenêtre normale, ouverte à la demande.

Le processus principal ([`main.ts`](src/main.ts)) possède les réglages et fait
le relais : l'overlay lui pousse ses mesures à 20 Hz, il les renvoie à la
fenêtre de réglages quand elle est ouverte. Tout passe par
[`preload.ts`](src/preload.ts), seule surface IPC de l'application.

La chaîne de mesure est isolée dans [`levels.ts`](src/levels.ts) — RMS → dBFS →
position 0..1, lissage exponentiel, jauge de patience — pour être testable hors
d'Electron ([`test_levels.ts`](src/test_levels.ts)).

### Deux contraintes qui expliquent le code

**Le glissement est fait à la main.** Sous Windows,
`-webkit-app-region: drag` et un clic droit fonctionnel s'excluent : l'OS
intercepte le clic droit sur une zone de drag avant que la page ne le voie. Le
menu contextuel du chat étant dessiné dans la page, le drag passe par IPC.

**Le menu du chat est en HTML, celui de la barre système est natif.** Un menu
natif a l'apparence imposée par l'OS ; celui-ci doit ressembler au reste de
l'application. Le menu de la barre système, lui, vit en dehors de la fenêtre et
reste donc natif.

### Interface

L'interface suit le design system *hcds* : les jetons (couleurs en oklch, rayons,
durées, échelle typographique) sont réimplémentés en CSS nu dans
[`tokens.css`](src/tokens.css), partagé par les deux pages. Les polices Inter et
Bitter sont embarquées (variables, sous-ensemble latin, 82 Ko) — une machine de
classe peut très bien être hors ligne.

Le chat lui-même est un SVG écrit à la main dans `index.html` ; une classe CSS
par humeur, le CSS fait le reste. `npm run icon` régénère `build/icon.png` à
partir de ce même SVG, pour que l'icône et la mascotte ne divergent pas.

### Conventions

Le projet suit [`.claude/CLAUDE.md`](.claude/CLAUDE.md) : le plus petit diff qui
marche, pas d'abstraction spéculative, et les simplifications délibérées
marquées d'un commentaire `ponytail:` qui nomme le plafond de la solution
retenue. Textes d'interface et messages de commit en français, commentaires de
code en anglais.
