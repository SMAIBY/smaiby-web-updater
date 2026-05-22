export type LogFn = (message: string) => void;

export class VisionSerialPort {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private rxQueue: number[] = [];
  private readLoopRunning = false;

  constructor(private readonly log: LogFn) {}

  async connect(baudRate = 921600): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error('WebSerial wird von diesem Browser nicht unterstützt. Bitte Chrome/Edge Desktop nutzen.');
    }

    // WCH CH340/CH343 vendor id = 0x1A86.
    this.port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x1a86 }],
    });

    await this.port.open({ baudRate });
    this.writer = this.port.writable!.getWriter();
    this.reader = this.port.readable!.getReader();
    this.readLoopRunning = true;
    this.readLoop();
    this.log(`[SER] Connected at ${baudRate} baud`);
  }

  async disconnect(): Promise<void> {
    this.readLoopRunning = false;
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.rxQueue = [];
    this.log('[SER] Disconnected');
  }

  isConnected(): boolean {
    return !!this.port && !!this.writer;
  }

  async setRTS(level: boolean): Promise<void> {
    if (!this.port) throw new Error('Serial port not connected');
    await this.port.setSignals({ requestToSend: level });
    this.log(`[SER] RTS=${level ? 'true' : 'false'}`);
  }

  async setDTR(level: boolean): Promise<void> {
    if (!this.port) throw new Error('Serial port not connected');
    await this.port.setSignals({ dataTerminalReady: level });
    this.log(`[SER] DTR=${level ? 'true' : 'false'}`);
  }

  async write(data: Uint8Array | string): Promise<void> {
    if (!this.writer) throw new Error('Serial writer not ready');
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await this.writer.write(bytes);
  }

  available(): number {
    return this.rxQueue.length;
  }

  readByte(): number | null {
    return this.rxQueue.shift() ?? null;
  }

  clear(): void {
    this.rxQueue = [];
  }

  async readUntilString(needle: string, timeoutMs: number): Promise<string> {
    const start = Date.now();
    let out = '';
    while (Date.now() - start < timeoutMs) {
      const b = this.readByte();
      if (b === null) {
        await delay(1);
        continue;
      }
      out += String.fromCharCode(b);
      if (out.includes(needle)) return out;
      if (out.length > 2000) out = out.slice(-1000);
    }
    return out;
  }

  async readByteWithTimeout(timeoutMs: number): Promise<number | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const b = this.readByte();
      if (b !== null) return b;
      await delay(1);
    }
    return null;
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    while (this.readLoopRunning && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done || !value) break;
        for (const b of value) this.rxQueue.push(b);
        const text = decoder.decode(value, { stream: true });
        if (text.trim().length > 0) this.log(`[RX] ${text.replaceAll('\r', '\\r').replaceAll('\n', '\\n')}`);
      } catch (err) {
        if (this.readLoopRunning) this.log(`[SER] Read error: ${String(err)}`);
        break;
      }
    }
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Minimal WebSerial TS declarations for projects without @types/wicg-web-serial.
declare global {
  interface Navigator {
    serial: Serial;
  }

  interface Serial {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialPort {
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    setSignals(signals: SerialOutputSignals): Promise<void>;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }

  interface SerialOutputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }
}
