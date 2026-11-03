/**
 * ============================================================================
 * Hardware Services: Web Bluetooth (mBot Mega) & WebSocket (ESP32 Gate)
 * File: webapp/src/services/hardware.ts
 * ============================================================================
 */

export class MbotBleClient {
  private device: any = null;
  private server: any = null;
  private txChar: any = null;
  private rxChar: any = null;
  private rxBuffer = '';
  public connected = false;
  private isReconnecting = false;
  private isManualDisconnect = false;
  public lockedDeviceId: string | null = null;
  public lockedDeviceName: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private onEventCallback?: (tag: string, rawLine: string) => void;
  private onStatusCallback?: (connected: boolean, name?: string) => void;
  private onLogCallback?: (msg: string) => void;

  private readonly SERVICE_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
  private readonly RX_UUID = '0000ffe2-0000-1000-8000-00805f9b34fb';
  private readonly TX_UUID = '0000ffe3-0000-1000-8000-00805f9b34fb';

  constructor(callbacks?: {
    onEvent?: (tag: string, rawLine: string) => void;
    onStatus?: (connected: boolean, name?: string) => void;
    onLog?: (msg: string) => void;
  }) {
    this.onEventCallback = callbacks?.onEvent;
    this.onStatusCallback = callbacks?.onStatus;
    this.onLogCallback = callbacks?.onLog;

    // Load previously paired rover identity to prevent cross-connecting to other mBots in the room
    try {
      this.lockedDeviceId = localStorage.getItem('mbot_locked_device_id');
      this.lockedDeviceName = localStorage.getItem('mbot_locked_device_name');
    } catch {
      // storage unavailable
    }
  }

  public async connect(): Promise<boolean> {
    this.isManualDisconnect = false;
    const nav = navigator as any;
    if (!nav.bluetooth) {
      this.onLogCallback?.('[BLE] Web Bluetooth API requires a Secure Context (HTTPS or localhost) in Chrome/Edge.');
      return false;
    }

    try {
      this.onLogCallback?.('[BLE] Scanning for Makeblock mBot Mega (Isolated Tabletop Rover)...');
      this.device = await nav.bluetooth.requestDevice({
        filters: [{ services: [this.SERVICE_UUID] }, { namePrefix: 'Makeblock' }, { namePrefix: 'mBot' }],
        optionalServices: [this.SERVICE_UUID],
      });

      // Pin device ID so we never latch onto another team's robot
      if (this.device?.id) {
        this.lockedDeviceId = this.device.id;
        this.lockedDeviceName = this.device.name || 'mBot Mega';
        try {
          localStorage.setItem('mbot_locked_device_id', this.lockedDeviceId);
          localStorage.setItem('mbot_locked_device_name', this.lockedDeviceName);
        } catch {
          // ignore
        }
      }

      this.device.addEventListener('gattserverdisconnected', () => {
        this.connected = false;
        this.onStatusCallback?.(false);
        if (this.isManualDisconnect) {
          this.isManualDisconnect = false;
          return;
        }
        this.onLogCallback?.(`[BLE] Signal lost to ${this.device?.name || 'mBot Mega'}. Auto-reconnecting to locked rover...`);
        this.attemptAutoReconnect();
      });

      return await this.setupGattConnection();
    } catch (err: any) {
      this.onLogCallback?.(`[BLE] Connection cancelled or failed: ${err?.message || err}`);
      return false;
    }
  }

  private async setupGattConnection(): Promise<boolean> {
    try {
      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService(this.SERVICE_UUID);
      this.txChar = await service.getCharacteristic(this.TX_UUID);

      try {
        this.rxChar = await service.getCharacteristic(this.RX_UUID);
        await this.rxChar.startNotifications();
        this.rxChar.addEventListener('characteristicvaluechanged', (e: any) => {
          const dec = new TextDecoder('utf-8');
          const chunk = dec.decode(e.target.value);
          this.handleIncomingChunk(chunk);
        });
      } catch {
        this.onLogCallback?.('[BLE] RX notifications characteristic optional.');
      }

      this.connected = true;
      this.isReconnecting = false;
      this.onStatusCallback?.(true, this.device.name || 'mBot Mega');
      this.onLogCallback?.(`[BLE] Secure link established & locked to ${this.device.name || 'mBot Mega'} (UUID: ${this.device.id.slice(0, 8)}...)`);
      return true;
    } catch (err: any) {
      this.onLogCallback?.(`[BLE Setup Err] ${err?.message || err}`);
      return false;
    }
  }

  private async attemptAutoReconnect() {
    if (this.isReconnecting || !this.device) return;
    this.isReconnecting = true;

    // Retry reconnecting to THIS SAME PAIRED ROVER with exponential backoff (immune to interference)
    const intervals = [1200, 2000, 3500, 5000];
    for (let attempt = 0; attempt < 8; attempt++) {
      if (this.connected || !this.device || !this.isReconnecting) break;
      const delay = intervals[Math.min(attempt, intervals.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
      if (this.connected || !this.device || !this.isReconnecting) break;

      this.onLogCallback?.(`[BLE Reconnect] Target: ${this.device.name || 'mBot Mega'} (Attempt #${attempt + 1})...`);
      try {
        const ok = await this.setupGattConnection();
        if (ok) {
          this.onLogCallback?.(`[BLE] Auto-reconnect succeeded! Re-anchored to ${this.device.name || 'mBot Mega'}.`);
          return;
        }
      } catch {
        // continue retry loop
      }
    }
    this.isReconnecting = false;
  }

  public unlockRover() {
    this.isManualDisconnect = true;
    this.isReconnecting = false;
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.connected = false;
    this.lockedDeviceId = null;
    this.lockedDeviceName = null;
    try {
      localStorage.removeItem('mbot_locked_device_id');
      localStorage.removeItem('mbot_locked_device_name');
    } catch {
      // ignore
    }
    this.onStatusCallback?.(false);
    this.onLogCallback?.('[BLE] Rover unlocked. You can now select a different mBot Mega in the room.');
  }

  public sendChar(ch: string): Promise<boolean> {
    if (!this.connected || !this.txChar || !ch) {
      if (!this.connected) {
        this.onLogCallback?.(`[BLE] Notice: Rover is not paired on this browser window.`);
      }
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          try {
            const bytes = new TextEncoder().encode(ch[0]);
            const canWriteNoResp =
              Boolean(this.txChar.properties?.writeWithoutResponse) &&
              typeof this.txChar.writeValueWithoutResponse === 'function';
            if (canWriteNoResp) {
              await this.txChar.writeValueWithoutResponse(bytes);
            } else {
              await this.txChar.writeValue(bytes);
            }
            this.onLogCallback?.(`[BLE TX] '${ch[0]}'`);
            // Add a small 35ms pacing delay so rapid back-to-back GATT writes never collide
            await new Promise((r) => setTimeout(r, 35));
            resolve(true);
          } catch (err: any) {
            try {
              const bytes = new TextEncoder().encode(ch[0]);
              await this.txChar.writeValue(bytes);
              this.onLogCallback?.(`[BLE TX fallback] '${ch[0]}'`);
              await new Promise((r) => setTimeout(r, 35));
              resolve(true);
            } catch (err2: any) {
              this.onLogCallback?.(`[BLE TX Err] ${err?.message || err}`);
              resolve(false);
            }
          }
        })
        .catch(() => resolve(false));
    });
  }

  public async emergencyStop(): Promise<boolean> {
    if (!this.connected || !this.txChar) {
      this.onLogCallback?.('[BLE] Notice: Emergency Stop requested but rover is not paired.');
      return false;
    }
    this.onLogCallback?.('[BLE] >>> INITIATING IMMEDIATE ROVER STOP <<<');
    // Mode 2 (Manual) switches off Auto Line Follower immediately
    await this.sendChar('2');
    // Space (' ') unconditionally zeroes all motor PWMs
    await this.sendChar(' ');
    // Extra failsafe 'x' halt
    await this.sendChar('x');
    return true;
  }

  public sendText(text: string): Promise<boolean> {
    if (!this.connected || !this.txChar || !text) {
      if (!this.connected) {
        this.onLogCallback?.(`[BLE] Notice: Rover is not paired on this browser window.`);
      }
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          try {
            const bytes = new TextEncoder().encode(text);
            const canWriteNoResp =
              Boolean(this.txChar.properties?.writeWithoutResponse) &&
              typeof this.txChar.writeValueWithoutResponse === 'function';
            if (canWriteNoResp) {
              await this.txChar.writeValueWithoutResponse(bytes);
            } else {
              await this.txChar.writeValue(bytes);
            }
            this.onLogCallback?.(`[BLE TX] "${text}"`);
            resolve(true);
          } catch (err: any) {
            try {
              const bytes = new TextEncoder().encode(text);
              await this.txChar.writeValue(bytes);
              this.onLogCallback?.(`[BLE TX fallback] "${text}"`);
              resolve(true);
            } catch (err2: any) {
              this.onLogCallback?.(`[BLE TX Err] ${err?.message || err}`);
              resolve(false);
            }
          }
        })
        .catch(() => resolve(false));
    });
  }

  private handleIncomingChunk(chunk: string) {
    this.rxBuffer += chunk;
    const lines = this.rxBuffer.split(/\r?\n/);
    this.rxBuffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.onLogCallback?.(`[BLE RX] ${trimmed}`);
      const match = trimmed.match(/\[EVT:([A-Z0-9_#:]+)\]/);
      if (match) {
        this.onEventCallback?.(match[1], trimmed);
      }
    }
  }
}

export class Esp32GateClient {
  private ws: WebSocket | null = null;
  public connected = false;
  public host = '192.168.4.1:81';
  public trackId = 'Track-01';
  public readonly AUTH_TOKEN = 'mbot-gate-2026';
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private probeTimer: any = null;
  private isManualDisconnect = false;
  private reconnectAttempts = 0;
  private isProbing = false;

  private onTelemetryCallback?: (data: {
    carCount?: number;
    gateState?: string;
    distanceCm?: number;
    lockoutSec?: number;
  }) => void;
  private onStatusCallback?: (connected: boolean) => void;
  private onLogCallback?: (msg: string) => void;

  constructor(callbacks?: {
    onTelemetry?: (data: {
      carCount?: number;
      gateState?: string;
      distanceCm?: number;
      lockoutSec?: number;
    }) => void;
    onStatus?: (connected: boolean) => void;
    onLog?: (msg: string) => void;
  }) {
    this.onTelemetryCallback = callbacks?.onTelemetry;
    this.onStatusCallback = callbacks?.onStatus;
    this.onLogCallback = callbacks?.onLog;

    // Orderly probe loop every 4.0s (only when WebSocket is not open)
    this.probeTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        void this.probe();
      }
    }, 4000);
  }

  public destroy() {
    this.isManualDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  public setStatus(isConnected: boolean) {
    if (this.connected !== isConnected) {
      this.connected = isConnected;
      this.onStatusCallback?.(isConnected);
    }
  }

  public async probe(): Promise<boolean> {
    if (this.isProbing) return this.connected;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.setStatus(true);
      return true;
    }

    this.isProbing = true;
    const cleanHost = this.host.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '').trim();
    const ip = cleanHost.split(':')[0] || '192.168.4.1';

    try {
      // 1. Probe via backend relay (/api/esp/probe)
      const resp = await fetch('/api/esp/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: this.host, token: this.AUTH_TOKEN }),
      });
      const res = await resp.json();
      if (res.ok) {
        this.setStatus(true);
        if (res.telemetry && typeof res.telemetry === 'object') {
          this.parseTelemetryObject(res.telemetry);
        }
        return true;
      }
    } catch {
      // ignore
    } finally {
      this.isProbing = false;
    }

    // 2. Direct HTTP probe to Port 80 (/status) if backend relay was unreachable
    try {
      const resp = await fetch(`http://${ip}:80/status`, { method: 'GET', signal: AbortSignal.timeout(1200) });
      if (resp.ok) {
        const data = await resp.json();
        this.setStatus(true);
        this.parseTelemetryObject(data);
        return true;
      }
    } catch {
      // ignore
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.setStatus(false);
    }
    return false;
  }

  public async connect(hostInput?: string) {
    if (hostInput) this.host = hostInput.trim();
    this.isManualDisconnect = false;

    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    const cleanHost = this.host.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '').trim();
    const url = `ws://${cleanHost}`;

    // Establish direct WebSocket to ESP32 SoftAP (Port 81)
    try {
      this.onLogCallback?.(`[ESP32 WS] Connecting to ${url}...`);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.setStatus(true);
        this.reconnectAttempts = 0;
        this.onLogCallback?.(`[ESP32 WS] Connected to ${url} (Ready)`);
        this.startHeartbeat();
        this.sendCommand('GET_STATUS');
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.onLogCallback?.(`[ESP32 WS Err] Link to ${url} interrupted`);
      };

      this.ws.onmessage = (evt) => {
        const text = String(evt.data || '').trim();
        if (!text) return;
        // Don't clutter logs with periodic telemetry heartbeats unless it's an event
        if (!text.includes('"log":""') && !text.includes('"pong":true')) {
          this.onLogCallback?.(`[ESP32 RX] ${text}`);
        }
        this.parseMessage(text);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Keep connection warm every 5 seconds to prevent idle socket drop
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('PING');
        } catch {
          // ignore
        }
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(delayMs?: number) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.isManualDisconnect) return;

    const backoff = delayMs !== undefined ? delayMs : Math.min(5000, 1500 + this.reconnectAttempts * 1000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.connected && !this.isManualDisconnect) {
        this.connect();
      }
    }, backoff);
  }

  public async sendCommand(cmd: string): Promise<boolean> {
    let wireCmd = cmd.trim();
    if (cmd === 'CHARGED') {
      wireCmd = 'OPEN_GATE2';
    }

    // 1. Primary: Direct WebSocket transmit if connected (Zero overhead, instant)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(wireCmd);
        this.onLogCallback?.(`[ESP32 WS TX] ${wireCmd}`);
        this.setStatus(true);
        return true;
      } catch (err: any) {
        this.onLogCallback?.(`[ESP32 WS Err] ${err?.message || err}`);
      }
    }

    // 2. Secondary Fallback: If WebSocket is not open, use Direct HTTP + Backend Relay
    let sent = false;
    const cleanHost = this.host.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '').trim();
    const ip = cleanHost.split(':')[0] || '192.168.4.1';

    // A. Direct HTTP to ESP32 Port 80 (/cmd?cmd=...)
    try {
      await fetch(`http://${ip}:80/cmd?cmd=${encodeURIComponent(wireCmd)}`, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
      });
      this.onLogCallback?.(`[ESP32 HTTP Fallback TX] ${wireCmd} to http://${ip}:80/cmd`);
      sent = true;
      this.setStatus(true);
    } catch {
      // ignore, proceed to relay
    }

    // B. Backend Relay via server.py
    try {
      const resp = await fetch('/api/esp/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: wireCmd,
          host: this.host,
          token: this.AUTH_TOKEN,
        }),
      });
      const res = await resp.json();
      if (res.ok) {
        this.onLogCallback?.(`[ESP32 Relay TX] ${wireCmd} (${res.message || 'Relayed'})`);
        sent = true;
        this.setStatus(true);
      }
    } catch {
      // non-fatal
    }

    if (sent) {
      this.setStatus(true);
    } else if (!this.connected) {
      this.scheduleReconnect(500);
    }

    return sent;
  }

  public parseTelemetryObject(j: any) {
    if (!j || typeof j !== 'object') return;
    if (typeof j.carCount === 'number') this.onTelemetryCallback?.({ carCount: j.carCount });
    if (typeof j.lockoutRemainingMs === 'number') this.onTelemetryCallback?.({ lockoutSec: j.lockoutRemainingMs / 1000 });

    const STATE_MAP: Record<number, string> = {
      0: 'IDLE',
      1: 'RED',
      2: 'YELLOW',
      3: 'GATE1_OPEN',
      4: 'GATE1_OPEN',
      5: 'GATE2_OPEN',
    };

    let mappedState = 'IDLE';
    if (typeof j.state === 'number') {
      mappedState = STATE_MAP[j.state] || 'IDLE';
    } else if (typeof j.state === 'string') {
      mappedState = j.state;
    }

    if (j.gate2 === 'OPEN') {
      mappedState = 'GATE2_OPEN';
    } else if (j.gate1 === 'OPEN' && (mappedState === 'IDLE' || mappedState === 'GATE1_OPEN')) {
      mappedState = 'GATE1_OPEN';
    }

    this.onTelemetryCallback?.({ gateState: mappedState });

    if (typeof j.distanceCm === 'number') this.onTelemetryCallback?.({ distanceCm: j.distanceCm });
    if (typeof j.log === 'string' && j.log.length > 0) this.onLogCallback?.(`[ESP32] ${j.log}`);
  }

  private parseMessage(text: string) {
    if (text.startsWith('{')) {
      try {
        const j = JSON.parse(text);
        this.parseTelemetryObject(j);
      } catch {
        // ignore malformed JSON
      }
      return;
    }

    if (text.startsWith('COUNT:')) {
      const count = parseInt(text.split(':')[1], 10);
      if (!isNaN(count)) this.onTelemetryCallback?.({ carCount: count });
    } else if (text.startsWith('STATE:')) {
      this.onTelemetryCallback?.({ gateState: text.split(':')[1] });
    } else if (text.startsWith('DIST:')) {
      const dist = parseFloat(text.split(':')[1]);
      if (!isNaN(dist)) this.onTelemetryCallback?.({ distanceCm: dist });
    } else if (text.startsWith('LOCKOUT:')) {
      const sec = parseFloat(text.split(':')[1]);
      if (!isNaN(sec)) this.onTelemetryCallback?.({ lockoutSec: sec });
    }
  }
}
