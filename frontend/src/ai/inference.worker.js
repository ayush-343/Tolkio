import { MLCEngine } from '@mlc-ai/web-llm';
import { cacheName, verifyFile } from './assets.js';
import { resolveCachedAsset } from './asset-url.js';
import { validateManifest, validateTask, messagesFor, validateOutput, PROMPT_VERSION } from '../../../shared/ai/contracts.js';
let engine;
let manifest;
// Local inference has no network transport: only verified, previously downloaded files.
self.fetch = async input => {
  if (!manifest) throw new Error('Load a model before requesting its files.');
  const { file: f, url } = resolveCachedAsset(input, manifest, self.location.origin);
  const r = await (await caches.open(cacheName(manifest))).match(url);
  if (!r) throw new Error('A model file was evicted. Download the model again.');
  if (!await verifyFile(r.clone(), f)) throw new Error('Cached model integrity check failed.');
  return r;
};
// Native Cache.add performs its own network fetch, bypassing self.fetch.
// Route WebLLM's cache population through our verified, offline-only reader.
Cache.prototype.add = async function (input) {
  const response = await self.fetch(input);
  await this.put(input, response);
};
self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    if (type === 'load') {
      manifest = validateManifest(payload);
      // Earlier deployments may have cached the app HTML at WebLLM's aliases.
      // Remove only invalid HTML for this model, retaining other cached weights.
      const base = new URL(manifest.baseUrl, self.location.origin);
      for (const name of await caches.keys()) {
        if (!name.startsWith('webllm/')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) continue;
          const response = await cache.match(request);
          if (response?.headers.get('content-type')?.includes('text/html')) await cache.delete(request);
        }
      }
      engine = new MLCEngine({ appConfig: { model_list: [{ model_id: manifest.id, model: new URL(manifest.baseUrl, self.location.origin).href, model_lib: new URL(manifest.baseUrl + 'model.wasm', self.location.origin).href, overrides: { context_window_size: 2048, max_history_size: 1 } }] }, initProgressCallback: p => self.postMessage({ id, progress: p.progress, text: p.text }), logLevel: 'ERROR' });
      await engine.reload(manifest.id, { context_window_size: 2048, max_history_size: 1 });
      self.postMessage({ id, result: { ready: true } });
    } else if (type === 'run') {
      if (!engine) throw new Error('Load a model first.');
      const request = validateTask(payload);
      await engine.resetChat();
      const start = performance.now();
      let firstTokenMs = null;
      let raw = '';
      let finishReason;
      const stream = await engine.chat.completions.create({ messages: messagesFor(request), stream: true, max_tokens: 256, temperature: 0.3, extra_body: { enable_thinking: false }, ...(request.task === 'quiz' ? { response_format: { type: 'json_object' } } : {}) });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text && firstTokenMs === null) firstTokenMs = performance.now() - start;
        raw += text;
        if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      }
      await engine.resetChat();
      if (finishReason === 'length') throw new Error('The response reached its limit. Try a shorter input.');
      const output = validateOutput(request.task, raw);
      self.postMessage({ id, result: { output, modelId: manifest.id, modelVersion: manifest.revision, promptVersion: PROMPT_VERSION, execution: 'local', warnings: ['Experimental AI suggestion. Review for accuracy.'], metrics: { firstTokenMs, completionMs: performance.now() - start } } });
    }
  } catch (e) { self.postMessage({ id, error: e.message || 'Local inference failed.' }); }
};
