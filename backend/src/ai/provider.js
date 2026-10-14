import { messagesFor, validateOutput, PROMPT_VERSION } from '../../../shared/ai/contracts.js';
export async function inferOnServer(request, modelId, signal, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, input: messagesFor(request), max_output_tokens: 256, store: false }),
  });
  if (!response.ok) throw new Error('Server assistance failed. No automatic retry was made.');
  const body = await response.json();
  if (body.status !== 'completed') throw new Error('The server response was incomplete.');
  const raw = body.output?.flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('') || '';
  return { output: validateOutput(request.task, raw), modelId, modelVersion: modelId, promptVersion: PROMPT_VERSION, execution: 'server', warnings: ['AI-generated draft. Check accuracy before using it.'], usage: body.usage };
}
