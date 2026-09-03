// ponytail: one-off build-time rasteriser. nativeImage can't read SVG and
// adding a rasteriser dependency isn't allowed, so this loads the SAME inline
// cat SVG the app window shows into a hidden BrowserWindow and screenshots it.
// Coupled to src/index.html's markup: it regex-extracts <svg id="cat" ...>.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SIZE = 256;

async function main() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const match = html.match(/<svg id="cat"[\s\S]*?<\/svg>/);
  if (!match) throw new Error('could not find <svg id="cat" ...>...</svg> in src/index.html');
  const catSvg = match[0];

  // Minimal copy of the mood-visibility rules from index.html: without them
  // every mouth/eyes/brows variant would render stacked on top of each
  // other, since that's normally hidden by CSS the standalone doc lacks.
  // The svg keeps class="content" (the default mood), so .content #m-content
  // below is what makes the plain content-mood mouth the one that shows.
  const doc = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  html, body { background: transparent; margin: 0; padding: 0; }
  body { width: ${SIZE}px; height: ${SIZE}px; }
  #cat { width: ${SIZE}px; height: ${SIZE}px; display: block; }
  #m-content, #m-attentif, #m-inquiet, #m-fache, #eyes-shut, #brows { opacity: 0; }
  .content #m-content { opacity: 1; }
</style></head><body>${catSvg}</body></html>`;

  await app.whenReady();
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(doc));
  const image = await win.webContents.capturePage();

  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'icon.png');
  fs.writeFileSync(outPath, image.toPNG());

  const { width, height } = image.getSize();
  console.log(`wrote ${outPath} (${width}x${height}, ${fs.statSync(outPath).size} bytes)`);

  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
