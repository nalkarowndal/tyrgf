import { acquireDataLock } from '../../apps/server/src/runtime-lock.ts';
import process from 'node:process';

try {
  const release = await acquireDataLock(process.argv[2]);
  process.on('message', async (message) => {
    if (message !== 'release') return;
    await release();
    process.disconnect();
  });
  process.send({ status: 'held' });
} catch (error) {
  process.send({ status: 'blocked', code: error.cause?.code ?? null });
  process.disconnect();
}
