// Minimal client for spektralab-host.exe: frames are [u32 json len][u32 payload len][json][payload] both ways.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// SpektraLab's install folder (the one holding spektralab-host.exe): SPEKTRALAB_DIR, else one beside this project
export const SPK = (process.env.SPEKTRALAB_DIR || fileURLToPath(new URL('../../../spektralab', import.meta.url))).replace(/\\/g, '/');

export class Host {
  constructor() {
    this.p = spawn(`${SPK}/spektralab-host.exe`, ['--resources', `${SPK}/host/engine`], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.buf = Buffer.alloc(0); this.next = 1; this.waiting = new Map();
    this.p.stderr.on('data', b => { if (process.env.SPK_LOG) process.stderr.write(b); });
    this.p.on('exit', c => { for (const w of this.waiting.values()) w.rej(new Error('host exited ' + c)); this.waiting.clear(); });
    this.p.stdout.on('data', b => {
      this.buf = Buffer.concat([this.buf, b]);
      while (this.buf.length >= 8) {
        const h = this.buf.readUInt32LE(0), n = this.buf.readUInt32LE(4);
        if (this.buf.length < 8 + h + n) return;
        const q = JSON.parse(this.buf.subarray(8, 8 + h).toString()), payload = this.buf.subarray(8 + h, 8 + h + n);
        this.buf = this.buf.subarray(8 + h + n);
        const w = this.waiting.get(q.id); this.waiting.delete(q.id);
        if (!w) continue;
        if (q.ok === false) w.rej(new Error(JSON.stringify(q.error))); else w.res({ result: q.result, payload });
      }
    });
  }
  call(method, params = {}, payload = Buffer.alloc(0)) {
    const id = this.next++, json = Buffer.from(JSON.stringify({ id, method, params }));
    const pre = Buffer.alloc(8); pre.writeUInt32LE(json.length, 0); pre.writeUInt32LE(payload.length, 4);
    return new Promise((res, rej) => { this.waiting.set(id, { res, rej }); this.p.stdin.write(Buffer.concat([pre, json, payload])); });
  }
  stop() { this.p.stdin.end(); setTimeout(() => this.p.kill(), 1500).unref(); }
}
