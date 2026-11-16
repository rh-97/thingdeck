// @vitest-environment node
import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCertificates } from './certs.ts';

const fixtures = join(import.meta.dirname, 'fixtures');
const folder = (...files: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'td-certs-'));
  for (const f of files) copyFileSync(join(fixtures, f), join(dir, f.replace('test-ca', 'company-ca')));
  return dir;
};

describe('loadCertificates', () => {
  it('returns nothing when the folder is missing or empty', () => {
    expect(loadCertificates('/does/not/exist')).toEqual([]);
    expect(loadCertificates(folder())).toEqual([]);
  });

  it('reads binary (DER) certificates and converts them to PEM', () => {
    const [cert] = loadCertificates(folder('test-ca.der'));
    expect(cert!.subject).toBe('CN=ThingsDeck Test Root CA');
    expect(cert!.pem).toBe(readFileSync(join(fixtures, 'test-ca.pem'), 'utf8').trim());
  });

  it('reads PEM files, including bundles with several certificates', () => {
    const dir = folder();
    const pem = readFileSync(join(fixtures, 'test-ca.pem'), 'utf8');
    const server = readFileSync(join(fixtures, 'test-server.pem'), 'utf8');
    writeFileSync(join(dir, 'bundle.crt'), `${pem}\n${server}`);
    expect(loadCertificates(dir).map((c) => c.subject)).toEqual([
      'CN=ThingsDeck Test Root CA',
      'CN=localhost',
    ]);
  });

  it('ignores unrelated files and reports broken certificates clearly', () => {
    const dir = folder();
    writeFileSync(join(dir, 'README.md'), '# notes');
    expect(loadCertificates(dir)).toEqual([]);
    writeFileSync(join(dir, 'broken.cer'), 'not a certificate');
    expect(() => loadCertificates(dir)).toThrow('broken.cer is not a valid certificate');
  });
});

describe('trusting a company CA end to end', () => {
  let url: string;
  let close: () => void;

  beforeAll(async () => {
    const server = createServer(
      {
        key: readFileSync(join(fixtures, 'test-server.key')),
        cert: readFileSync(join(fixtures, 'test-server.pem')),
      },
      (_req, res) => res.end('trusted'),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `https://localhost:${(server.address() as AddressInfo).port}/`;
    close = () => server.close();
  });
  afterAll(() => close());

  const fetchIn = (extraCa?: string) =>
    new Promise<string>((resolve) => {
      const script = `fetch(${JSON.stringify(url)}).then(r => r.text()).then(t => console.log(t)).catch(e => console.log('failed: ' + (e.cause?.code ?? e.message)))`;
      execFile(
        process.execPath,
        ['-e', script],
        { env: { ...process.env, NODE_EXTRA_CA_CERTS: extraCa ?? '' } },
        (_err, stdout) => resolve(stdout.trim()),
      );
    });

  it('rejects the inspected connection without the CA, and accepts it with the converted binary CA', async () => {
    expect(await fetchIn()).toMatch(/^failed: /);
    const bundle = join(mkdtempSync(join(tmpdir(), 'td-bundle-')), 'ca.pem');
    writeFileSync(
      bundle,
      loadCertificates(folder('test-ca.der'))
        .map((c) => c.pem)
        .join('\n'),
    );
    expect(await fetchIn(bundle)).toBe('trusted');
  });
});
