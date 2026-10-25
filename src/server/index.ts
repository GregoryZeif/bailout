import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
// Works both from src/server (tsx) and dist-server/server (compiled).
const root = join(here, '..', '..');

process.on('unhandledRejection', (e) => console.error('[process] unhandled rejection', e));
process.on('uncaughtException', (e) => console.error('[process] uncaught exception', e));

const server = await startServer({
  port: Number(process.env.PORT ?? 3001),
  dataDir: process.env.DATA_DIR ?? join(root, 'data'),
  staticDir: join(root, 'dist', 'client'),
});

const shutdown = async (sig: string) => {
  console.log(`[process] ${sig} received, saving rooms…`);
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
