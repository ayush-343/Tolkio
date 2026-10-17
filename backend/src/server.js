import 'dotenv/config';
import { communityModels } from './communities/models.js';
import { assertReplicaSet } from './communities/service.js';
import { circleProvider } from './communities/provider.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDB } from './lib/db.js';
import { WebhookReceipt } from './notifications/models.js';
import { CommunicationOperation } from './communication/models.js';

export async function startServer({ app = createApp(), connect = connectDB, port = process.env.PORT || 3000 } = {}) {
  for (const key of ['JWT_SECRET_KEY', 'STREAM_API_KEY', 'STREAM_API_SECRET']) {
    if (!process.env[key]) throw new Error(`Missing required configuration: ${key}`);
  }
  await connect();
  await Promise.all([WebhookReceipt.init(), CommunicationOperation.init(), ...communityModels.map(model => model.init())]);
  if (process.env.COMMUNITY_ENABLED === "true") {
    await assertReplicaSet();
    await circleProvider.verify();
  }
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once('error', reject);
  });
  let shuttingDown;
  const shutdown = () => shuttingDown ||= (async () => {
    app.locals.draining = true;
    const force = setTimeout(() => server.closeAllConnections?.(), 15000);
    force.unref();
    try {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections?.();
      });
      await mongoose.disconnect();
    } finally { clearTimeout(force); }
  })();
  return { app, server, shutdown };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ server, shutdown }) => {
    console.log(`Server listening on port ${server.address().port}`);
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
      shutdown().catch(() => { console.error('Graceful shutdown failed'); process.exitCode = 1; });
    });
  }).catch(() => { console.error('Startup failed: verify database and service configuration.'); process.exitCode = 1; });
}
