import { validateTask } from '../../../shared/ai/contracts.js';
import { localRuntime } from './runtime.js';
import { axiosInstance } from '../lib/axios.js';
export async function runTask(value, { benchmark = false, serverConsent = false, signal, runtime = localRuntime } = {}) {
  const request = validateTask(value);
  if (request.execution === 'local') return runtime.runTask(request, { benchmark, signal });
  if (!serverConsent) throw new Error('Choose server assistance before sending this text.');
  const { data: { data: job } } = await axiosInstance.post('/v1/ai/jobs', { ...request, serverConsent: true }, { signal, headers: { 'Idempotency-Key': crypto.randomUUID() } });
  for (let i = 0; i < 90; i++) {
    signal?.throwIfAborted();
    const { data: { data } } = await axiosInstance.get(`/v1/ai/jobs/${job.id}`, { signal });
    if (data.status === 'completed') return data.result;
    if (data.status === 'failed') throw new Error(data.error);
    await new Promise((resolve, reject) => {
      const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(done, document.hidden ? 10000 : 2000);
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  throw new Error('Server assistance is still pending. It will not be submitted again automatically.');
}
