const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const repoRoot = path.resolve(__dirname, '..', '..');
const fixturePath = path.join(repoRoot, 'tools', 'browser_visual_qa_fixture.html');
const outRoot = path.join(repoRoot, 'qa', 'visual', 'browser-ui');
const baselineDir = path.join(outRoot, 'baseline');
const currentDir = path.join(outRoot, 'current');

const scenarios = [
  'tabs-normal','tabs-pinned','tabs-loading','tabs-crashed',
  'omnibox-idle','omnibox-typing-suggestions-ghost','history-dropdown',
  'download-shelf-states','permission-and-siteinfo','split-view-transition','home-panel-transition'
];

const mode = process.argv[2] || 'capture-current';
const targetDir = mode === 'capture-baseline' ? baselineDir : currentDir;

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function run() {
  ensure(targetDir);
  const win = new BrowserWindow({
    width: 1320,
    height: 760,
    show: false,
    backgroundColor: '#0f1012',
    webPreferences: { backgroundThrottling: false }
  });

  await win.loadFile(fixturePath);

  for (const scene of scenarios) {
    const rect = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('[data-scene="${scene}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    })()`);

    if (!rect) throw new Error(`scene not found: ${scene}`);

    const image = await win.webContents.capturePage(rect);
    const b64 = image.toPNG().toString('base64');
    fs.writeFileSync(path.join(targetDir, `${scene}.png.b64.txt`), `${b64}\n`, 'utf8');
    console.log(`captured ${scene}`);
  }

  await win.destroy();
  app.quit();
}

app.whenReady().then(run).catch((err) => {
  console.error(err);
  app.exit(1);
});
