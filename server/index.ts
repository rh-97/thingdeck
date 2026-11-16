import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { buildApp } from './app.ts';
import { parseKey } from './crypto.ts';
import { openDb } from './db.ts';

const dataDir = process.env.DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });

/**
 * The encryption key for stored SmartThings tokens. Prefer THINGSDECK_SECRET;
 * otherwise one is generated once and kept next to the database.
 */
function loadKey() {
  if (process.env.THINGSDECK_SECRET) return parseKey(process.env.THINGSDECK_SECRET);
  const file = join(dataDir, 'secret.key');
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn(`[thingsdeck] Generated a token-encryption key at ${file}. Back it up with the database.`);
  }
  return parseKey(readFileSync(file, 'utf8'));
}

const app = buildApp({
  db: openDb(join(dataDir, 'thingsdeck.db')),
  secretKey: loadKey(),
  signup: process.env.THINGSDECK_SIGNUP === 'closed' ? 'closed' : 'open',
  logger: true,
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().then(() => process.exit(0)));
}
