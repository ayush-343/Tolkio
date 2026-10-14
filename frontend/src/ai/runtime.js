import { isApproved, validateTask } from '../../../shared/ai/contracts.js';
import { deviceCheck, modelCached } from './assets.js';
export class LocalRuntime {
  constructor(makeWorker = () => new Worker(new URL('./inference.worker.js', import.meta.url), { type: 'module' })) {
    this.makeWorker = makeWorker; this.pending = new Map(); this.sequence = 0; this.busy = false; this.blocked = false;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.busy) this.release('Local AI stopped when the app went to the background.');
    });
  }
  request(type, payload, onProgress, timeout = 120000, signal) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason || new Error('Local AI was cancelled.'));
      const cancel = () => this.release(signal?.reason?.message || 'Local AI was cancelled.');
      const timer = setTimeout(() => this.release('Local AI timed out. Load the model to retry.'), timeout);
      this.pending.set(id, { resolve, reject, onProgress, timer, signal, cancel });
      signal?.addEventListener('abort', cancel, { once: true });
      this.worker.postMessage({ id, type, payload });
    });
  }
  async load(manifest, onProgress, signal) {
    if (this.blocked) throw new Error('Local AI is paused during your call.');
    if (this.busy) throw new Error('Wait for the current operation or cancel it.');
    this.release(); this.busy = true;
    try {
      await deviceCheck(manifest);
      if (!await modelCached(manifest)) throw new Error('Download the model before loading it.');
      // release() may run while capability checks are pending.
      if (!this.busy || this.blocked) throw new Error('Loading was cancelled.');
      this.worker = this.makeWorker();
      this.worker.onmessage = ({ data }) => {
        const p = this.pending.get(data.id); if (!p) return;
        if (data.progress !== undefined) { p.onProgress?.(data); return; }
        clearTimeout(p.timer); this.pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
      };
      this.worker.onerror = () => this.release('The GPU or worker became unavailable. Load the model to retry.');
      const start = performance.now();
      await this.request('load', manifest, onProgress, 120000, signal);
      this.manifest = manifest; this.initializationMs = performance.now() - start; this.armIdle();
    } catch (e) { this.release(); throw e; } finally { this.busy = false; }
  }
  armIdle() { clearTimeout(this.idle); this.idle = setTimeout(() => this.release('Model released after five minutes of inactivity.'), 300000); }
  async runTask(value, { benchmark = false, signal } = {}) {
    const request = validateTask(value);
    if (request.execution !== 'local') throw new Error('Local runtime cannot send server requests.');
    if (this.blocked) throw new Error('Local AI is paused during your call.');
    if (!this.manifest || !this.worker) throw new Error('Load a downloaded model first.');
    if (this.busy) throw new Error('One generation is already running.');
    if (!benchmark && !isApproved(this.manifest, request)) throw new Error('This model/task/language combination has not passed evaluation. Use benchmark mode or explicit server assistance.');
    this.busy = true; clearTimeout(this.idle);
    try { return await this.request('run', request, null, 60000, signal); }
    catch (e) { this.release(); throw e; }
    finally { this.busy = false; if (this.worker) this.armIdle(); }
  }
  release(reason = 'Local AI was cancelled.') {
    clearTimeout(this.idle);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.signal?.removeEventListener('abort', p.cancel);
      p.reject(new Error(reason));
    }
    this.pending.clear(); this.worker?.terminate(); this.worker = null; this.manifest = null; this.busy = false;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('talkio-ai-released', { detail: reason }));
  }
  setCallActive(active) { this.blocked = active; if (active) this.release('Local AI paused for your call.'); }
}
export const localRuntime = new LocalRuntime();
