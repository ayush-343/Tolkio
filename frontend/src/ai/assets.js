import { validateManifest } from '../../../shared/ai/contracts.js';
import { sha256 } from '@noble/hashes/sha256';
export const cacheName = m => `talkio-model-${m.id}-${m.revision}`;
function hex(bytes) { return [...bytes].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function verifyFile(response, file) {
  if (!response.body) throw new Error(`Model file ${file.path} has no readable body.`);
  const reader = response.body.getReader();
  const hash = sha256.create();
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    hash.update(value);
  }
  return bytes === file.bytes && hex(hash.digest()) === file.sha256;
}
export async function modelCached(m) {
  validateManifest(m);
  const cache = await caches.open(cacheName(m));
  const complete = await cache.match(new URL(`${m.baseUrl}complete`, location.origin));
  if (!complete) return false;
  return (await Promise.all(m.files.map(f => cache.match(new URL(m.baseUrl + f.path, location.origin))))).every(Boolean);
}
export async function downloadModel(m, onProgress, signal) {
  validateManifest(m);
  const cache = await caches.open(cacheName(m));
  await cache.delete(new URL(`${m.baseUrl}complete`, location.origin));
  let done = 0;
  for (const file of m.files) {
    signal?.throwIfAborted();
    const url = new URL(m.baseUrl + file.path, location.origin);
    const existing = await cache.match(url);
    const existingIsValid = existing && await verifyFile(existing, file);
    if (!existingIsValid) {
      if (existing) await cache.delete(url);
      const r = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
      if (!r.ok) throw new Error('Model download failed. Retry to resume verified files.');
      if (!r.body) throw new Error('This browser cannot stream model files safely.');
      const [hashStream, cacheStream] = r.body.tee();
      const write = cache.put(url, new Response(cacheStream, { headers: r.headers }));
      const [valid] = await Promise.all([verifyFile(new Response(hashStream), file), write]);
      if (!valid) {
        await cache.delete(url);
        throw new Error('Artifact verification failed. Delete the download and retry.');
      }
    }
    done += file.bytes;
    onProgress?.(done / m.downloadBytes);
  }
  await cache.put(new URL(`${m.baseUrl}complete`, location.origin), new Response(m.revision));
}
export async function removeModel(m) {
  await caches.delete(cacheName(m));
  const modelBaseUrl = new URL(m.baseUrl, location.origin);
  // WebLLM maintains secondary caches. Delete only this model's versioned URLs.
  for (const name of await caches.keys()) {
    if (name.startsWith('talkio-model-')) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const url = new URL(req.url);
      if (url.origin === modelBaseUrl.origin && url.pathname.startsWith(modelBaseUrl.pathname)) await cache.delete(req);
    }
  }
}
export async function deviceCheck(m) {
  if (!globalThis.isSecureContext || !navigator.gpu) throw new Error('This browser cannot run local AI. Use a WebGPU-capable browser or choose server assistance.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No compatible GPU is available.');
  for (const f of m.requiredFeatures || ['shader-f16']) if (!adapter.features.has(f)) throw new Error(`This model requires GPU feature ${f}.`);
  if (m.bufferSizeRequired > adapter.limits.maxStorageBufferBindingSize) throw new Error('This GPU cannot allocate the model buffers.');
  const storage = await navigator.storage?.estimate();
  if (storage?.quota && storage.quota - storage.usage < m.downloadBytes * 2.2 && !await modelCached(m)) throw new Error('Not enough browser storage. Free space before downloading.');
  return { features: [...adapter.features], storage, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize };
}
