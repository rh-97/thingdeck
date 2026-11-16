import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCertificates } from './certs.ts';

/**
 * Launcher: applies optional network settings, then runs the server.
 * - Certificates in THINGSDECK_CA_DIR (default /certs) are trusted in addition
 *   to the built-in ones — for networks that inspect HTTPS with a company CA.
 * - HTTPS_PROXY / HTTP_PROXY / NO_PROXY are honoured by fetch when set.
 * Node reads both only at startup, so the server runs as a child process.
 */
const env = { ...process.env };
const dir = env.THINGSDECK_CA_DIR ?? '/certs';

const certs = loadCertificates(dir);
if (certs.length) {
  const bundle = join(tmpdir(), 'thingsdeck-extra-ca.pem');
  writeFileSync(bundle, certs.map((c) => c.pem).join('\n') + '\n');
  env.NODE_EXTRA_CA_CERTS = bundle;
  for (const c of certs) console.log(`[thingsdeck] Trusting extra CA from ${c.file}: ${c.subject}`);
}

if (env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy) {
  env.NODE_USE_ENV_PROXY ??= '1';
  console.log('[thingsdeck] Using the configured HTTP(S) proxy for outbound requests');
}

const child = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', join(import.meta.dirname, 'index.ts')],
  {
    env,
    stdio: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
