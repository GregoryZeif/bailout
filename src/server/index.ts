import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
// Works both from src/server (tsx) and dist-server/server (compiled).
const root = join(here, '..', '..');

process.on('unhandledRejection', (e) => console.error('[process] unhandled rejection', e));
process.on('uncaughtException', (e) => console.error('[process] uncaught exception', e));

// No top-level await: hosts like Hostinger (LiteSpeed) load this file with require(),
// which Node refuses for modules that use top-level await.
startServer({
  port: Number(process.env.PORT ?? 3001),
  dataDir: process.env.DATA_DIR ?? join(root, 'data'),
  staticDir: join(root, 'dist', 'client'),
  // Tester tools are on while developing (running the TypeScript source), off in a build unless BAILOUT_TESTER=1.
  tester: process.env.BAILOUT_TESTER === '1' || (process.env.BAILOUT_TESTER !== '0' && import.meta.url.endsWith('.ts')),
  // On a live site, tester mode opens only for browsers that know this key (ignored if too short to be safe).
  testerKey: (process.env.BAILOUT_TESTER_KEY?.length ?? 0) >= 16 ? process.env.BAILOUT_TESTER_KEY : undefined,
  // Or list player ids (shown on the main menu), separated by commas or spaces.
  testers: (process.env.BAILOUT_TESTERS ?? '').split(/[\s,]+/).filter((id) => /^u_[\w-]{6,}$/.test(id)),
}).then((server) => {
  const shutdown = async (sig: string) => {
    console.log(`[process] ${sig} received, saving rooms…`);
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}, (e: unknown) => {
  console.error('[process] failed to start', e);
  process.exit(1);
});
