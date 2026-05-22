import './styles.css';
import { VisionSerialPort } from './serial';
import { Manifest, SmaibyUpdater } from './updater';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="app">
    <section class="hero">
      <span class="badge">SMAIBY PoC</span>
      <h1>Vision AI V2 Web-Updater</h1>
      <p>USB-C verbinden, AT prüfen, Manifest laden und ein Modell per XMODEM auf die Model-Partition flashen.</p>
    </section>

    <section class="grid">
      <div class="card">
        <h2>1. Verbindung</h2>
        <div class="row">
          <button id="connectBtn">Vision V2 verbinden</button>
          <button id="disconnectBtn" class="ghost" disabled>Trennen</button>
          <button id="testAtBtn" class="secondary" disabled>AT-Test</button>
        </div>

        <label for="manifestUrl">Manifest URL</label>
        <input id="manifestUrl" value="https://example.com/smaiby/model_manifest.json" />

        <div class="row" style="margin-top: 14px;">
          <button id="loadManifestBtn" disabled>Manifest laden</button>
          <button id="downloadBtn" disabled>Modell laden + prüfen</button>
        </div>

        <div id="manifestBox" style="margin-top: 16px; color: #5d675c; line-height: 1.5;">Noch kein Manifest geladen.</div>
      </div>

      <div class="card">
        <h2>2. Flash</h2>
        <p class="warn">Nur ein kompatibles Vision-V2 Deploy-Binary flashen. Kein beliebiges Modell testen.</p>
        <div class="row">
          <button id="bootBtn" disabled>Bootloader testen</button>
          <button id="flashBtn" class="secondary" disabled>Modell flashen</button>
        </div>
        <div class="progressOuter"><div id="progressInner" class="progressInner"></div></div>
        <div id="progressText" style="margin-top: 8px; color:#5d675c;">0%</div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <h2>Log</h2>
      <div id="log" class="log"></div>
    </section>
  </main>
`;

const logEl = document.querySelector<HTMLDivElement>('#log')!;
const connectBtn = document.querySelector<HTMLButtonElement>('#connectBtn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnectBtn')!;
const testAtBtn = document.querySelector<HTMLButtonElement>('#testAtBtn')!;
const manifestUrlInput = document.querySelector<HTMLInputElement>('#manifestUrl')!;
const loadManifestBtn = document.querySelector<HTMLButtonElement>('#loadManifestBtn')!;
const downloadBtn = document.querySelector<HTMLButtonElement>('#downloadBtn')!;
const bootBtn = document.querySelector<HTMLButtonElement>('#bootBtn')!;
const flashBtn = document.querySelector<HTMLButtonElement>('#flashBtn')!;
const manifestBox = document.querySelector<HTMLDivElement>('#manifestBox')!;
const progressInner = document.querySelector<HTMLDivElement>('#progressInner')!;
const progressText = document.querySelector<HTMLDivElement>('#progressText')!;

let serial: VisionSerialPort;
let updater: SmaibyUpdater;
let manifest: Manifest | null = null;
let model: Uint8Array | null = null;
let connected = false;

function log(message: string): void {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `${ts} ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setConnected(value: boolean): void {
  connected = value;
  connectBtn.disabled = value;
  disconnectBtn.disabled = !value;
  testAtBtn.disabled = !value;
  loadManifestBtn.disabled = !value;
  bootBtn.disabled = !value;
  flashBtn.disabled = !value || !model;
}

function setProgress(sent: number, total: number): void {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  progressInner.style.width = `${pct}%`;
  progressText.textContent = `${pct}% (${sent} / ${total} Bytes)`;
}

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    log(`▶ ${label}`);
    await fn();
    log(`✓ ${label}`);
  } catch (err) {
    log(`✗ ${label}: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

connectBtn.onclick = () => run('Verbinden', async () => {
  serial = new VisionSerialPort(log);
  updater = new SmaibyUpdater(serial, log);
  await serial.connect(921600);
  setConnected(true);
});

disconnectBtn.onclick = () => run('Trennen', async () => {
  await serial.disconnect();
  setConnected(false);
});

testAtBtn.onclick = () => run('AT-Test', async () => {
  await updater.testAT();
});

loadManifestBtn.onclick = () => run('Manifest laden', async () => {
  manifest = await updater.fetchManifest(manifestUrlInput.value.trim());
  manifestBox.innerHTML = `
    <b>Version:</b> ${escapeHtml(manifest.version)}<br>
    <b>Größe:</b> ${manifest.size} Bytes<br>
    <b>SHA256:</b> ${escapeHtml(manifest.sha256)}
  `;
  downloadBtn.disabled = false;
});

downloadBtn.onclick = () => run('Modell laden + prüfen', async () => {
  if (!manifest) throw new Error('Kein Manifest geladen');
  model = await updater.downloadAndVerify(manifest);
  flashBtn.disabled = !connected;
});

bootBtn.onclick = () => run('Bootloader testen', async () => {
  await updater.enterBootloader();
  log('Bootloader erreicht. Zum normalen Betrieb Vision V2 resetten oder Flash starten.');
});

flashBtn.onclick = () => run('Modell flashen', async () => {
  if (!model) throw new Error('Kein Modell geladen');
  setProgress(0, model.length);
  await updater.enterBootloader();
  await updater.flashModel(model, setProgress);
});

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if (!('serial' in navigator)) {
  log('WARN: WebSerial nicht verfügbar. Bitte Chrome/Edge Desktop über HTTPS nutzen.');
}
