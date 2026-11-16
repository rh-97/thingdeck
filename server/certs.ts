import { X509Certificate } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CERT_EXTENSIONS = /\.(crt|pem|cer|der)$/i;
const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

export interface LoadedCertificate {
  file: string;
  subject: string;
  pem: string;
}

/**
 * Reads every certificate in a folder, accepting text (PEM, possibly several
 * per file) or binary (DER, as corporate CAs are often shipped), and returns
 * them as PEM so Node can use them via NODE_EXTRA_CA_CERTS.
 */
export function loadCertificates(dir: string): LoadedCertificate[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: LoadedCertificate[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!CERT_EXTENSIONS.test(name)) continue;
    const file = join(dir, name);
    const raw = readFileSync(file);
    const text = raw.toString('latin1');
    const blocks = text.includes('-----BEGIN CERTIFICATE-----') ? (text.match(PEM_BLOCK) ?? []) : [raw];
    for (const block of blocks) {
      let cert: X509Certificate;
      try {
        cert = new X509Certificate(block);
      } catch {
        throw new Error(`${name} is not a valid certificate (expected PEM text or binary DER)`);
      }
      out.push({ file: name, subject: cert.subject.replace(/\n/g, ', '), pem: cert.toString().trim() });
    }
  }
  return out;
}
