import { delay, VisionSerialPort } from './serial';

const SOH = 0x01;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const CAN = 0x18;
const CRCCHR = 0x43; // 'C'

export type ProgressFn = (sent: number, total: number) => void;
export type LogFn = (message: string) => void;

export class XmodemSender {
  constructor(private readonly serial: VisionSerialPort, private readonly log: LogFn) {}

  async send(data: Uint8Array, progress?: ProgressFn): Promise<void> {
    await this.waitReceiverReady(20000);

    let blockNo = 1;
    let offset = 0;
    const total = data.length;

    while (offset < data.length) {
      const block = new Uint8Array(128);
      block.fill(0x1a);
      block.set(data.slice(offset, offset + 128));

      let ok = false;
      for (let retry = 0; retry < 10 && !ok; retry++) {
        this.log(`[XMDM] Send block ${blockNo} retry ${retry}`);
        await this.sendBlock(blockNo & 0xff, block);
        ok = await this.waitAck(10000);
      }
      if (!ok) throw new Error(`XMODEM block ${blockNo} failed`);

      offset += Math.min(128, data.length - offset);
      progress?.(offset, total);
      blockNo++;
      await delay(0);
    }

    await this.sendEot();
  }

  private async waitReceiverReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const b = await this.serial.readByteWithTimeout(250);
      if (b === CRCCHR || b === NAK) {
        this.log(`[XMDM] Receiver ready: 0x${hex(b)}`);
        return;
      }
      if (b === CAN) throw new Error('XMODEM canceled by receiver');
    }
    throw new Error('XMODEM receiver not ready');
  }

  private async waitAck(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const b = await this.serial.readByteWithTimeout(250);
      if (b === ACK) { this.log('[XMDM] ACK'); return true; }
      if (b === NAK) { this.log('[XMDM] NAK'); return false; }
      if (b === CAN) throw new Error('XMODEM canceled by receiver');
      if (b !== null) this.log(`[XMDM] RX other: 0x${hex(b)}`);
    }
    return false;
  }

  private async sendBlock(blockNo: number, payload: Uint8Array): Promise<void> {
    const packet = new Uint8Array(3 + 128 + 2);
    packet[0] = SOH;
    packet[1] = blockNo;
    packet[2] = 255 - blockNo;
    packet.set(payload, 3);
    const crc = crc16ccitt(payload);
    packet[131] = (crc >> 8) & 0xff;
    packet[132] = crc & 0xff;
    await this.serial.write(packet);
  }

  private async sendEot(): Promise<void> {
    for (let retry = 0; retry < 10; retry++) {
      this.log('[XMDM] Send EOT');
      await this.serial.write(new Uint8Array([EOT]));
      if (await this.waitAck(10000)) return;
      await delay(300);
    }
    throw new Error('XMODEM EOT failed');
  }
}

export function buildFlashOffsetPacket(address: number): Uint8Array {
  const packet = new Uint8Array(128);
  packet.fill(0xff);
  packet[0] = 0xc0;
  packet[1] = 0x5a;
  packet[2] = address & 0xff;
  packet[3] = (address >> 8) & 0xff;
  packet[4] = (address >> 16) & 0xff;
  packet[5] = (address >> 24) & 0xff;
  packet[6] = 0;
  packet[7] = 0;
  packet[8] = 0;
  packet[9] = 0;
  packet[10] = 0x5a;
  packet[11] = 0xc0;
  return packet;
}

export function crc16ccitt(data: Uint8Array): number {
  let crc = 0;
  for (const b of data) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc;
}

function hex(b: number): string {
  return b.toString(16).padStart(2, '0').toUpperCase();
}
