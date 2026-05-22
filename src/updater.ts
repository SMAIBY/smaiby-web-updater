import { delay, VisionSerialPort } from './serial';
import { buildFlashOffsetPacket, XmodemSender } from './xmodem';

export interface Manifest {
  version: string;
  url: string;
  size: number;
  sha256: string;
}

const MODEL_PARTITION_ADDRESS = 0x400000;
const FINISH_PROMPT = 'Do you want to end file transmission and reboot system';

export type LogFn = (message: string) => void;
export type ProgressFn = (sent: number, total: number) => void;

export class SmaibyUpdater {
  constructor(private readonly serial: VisionSerialPort, private readonly log: LogFn) {}

  async testAT(): Promise<void> {
    this.serial.clear();
    this.log('[AT] TX AT+NAME?');
    await this.serial.write('AT+NAME?\r');
    const response = await this.serial.readUntilString('}', 2000);
    if (!response) throw new Error('Keine AT-Antwort erhalten');
    this.log(`[AT] Response ${response}`);
  }

  async fetchManifest(url: string): Promise<Manifest> {
    this.log(`[NET] Fetch manifest ${url}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
    const manifest = await res.json() as Manifest;
    if (!manifest.version || !manifest.url || !manifest.size || !manifest.sha256) {
      throw new Error('Manifest ist unvollständig');
    }
    this.log(`[NET] Manifest version=${manifest.version} size=${manifest.size}`);
    return manifest;
  }

  async downloadAndVerify(manifest: Manifest): Promise<Uint8Array> {
    this.log(`[NET] Download model ${manifest.url}`);
    const res = await fetch(manifest.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Model HTTP ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length !== manifest.size) {
      throw new Error(`Size mismatch: ${data.length} != ${manifest.size}`);
    }
    const actual = await sha256Hex(data);
    if (actual.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error(`SHA256 mismatch\nactual=${actual}\nexpect=${manifest.sha256}`);
    }
    this.log('[NET] Model SHA256 verified');
    return data;
  }

  async enterBootloader(): Promise<void> {
    this.log('[BOOT] Enter bootloader via RTS toggle');
    this.serial.clear();

    // This mirrors the SenseCraft flow as closely as WebSerial allows.
    await this.serial.setRTS(false);
    await delay(80);
    await this.serial.setRTS(true);
    await delay(20);

    const start = Date.now();
    let buffer = '';
    let sentPreBootKey = false;

    while (Date.now() - start < 8000) {
      await this.serial.write('1');
      await delay(10);

      while (this.serial.available()) {
        const b = this.serial.readByte();
        if (b === null) break;
        buffer += String.fromCharCode(b);
        if (buffer.length > 3000) buffer = buffer.slice(-1500);

        if (!sentPreBootKey && buffer.includes('Please input any key to enter X-Modem mode')) {
          this.log('[BOOT] Pre-boot prompt detected, sending key');
          await this.serial.write('x');
          sentPreBootKey = true;
        }

        if (buffer.includes('[1] Xmodem download and burn FW image') ||
            buffer.includes('Xmodem download and burn FW image')) {
          this.log('[BOOT] XMODEM menu detected, selecting 1');
          await delay(30);
          await this.serial.write('1');
          await delay(500);
          this.serial.clear();
          return;
        }
      }
    }

    throw new Error('Bootloader timeout');
  }

  async flashModel(model: Uint8Array, progress: ProgressFn): Promise<void> {
    const xmodem = new XmodemSender(this.serial, this.log);

    this.log(`[FLASH] Send model partition offset 0x${MODEL_PARTITION_ADDRESS.toString(16)}`);
    await xmodem.send(buildFlashOffsetPacket(MODEL_PARTITION_ADDRESS));
    await this.finishPrompt('n');

    this.log(`[FLASH] Send model binary (${model.length} bytes)`);
    await xmodem.send(model, progress);
    await this.finishPrompt('y');
    this.log('[FLASH] Done; device should reboot');
  }

  private async finishPrompt(answer: 'y' | 'n'): Promise<void> {
    const response = await this.serial.readUntilString(FINISH_PROMPT, 30000);
    if (!response.includes(FINISH_PROMPT)) {
      throw new Error(`Finish prompt timeout; expected answer ${answer}`);
    }
    this.log(`[FLASH] Finish prompt detected, answer=${answer}`);
    await this.serial.write(answer);
    await delay(1500);
    this.serial.clear();
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
