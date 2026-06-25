import crypto from 'node:crypto';
import { config } from '../config';

/**
 * Symmetric encryption for secrets stored at rest (e.g. first-party LLM provider API keys).
 * AES-256-GCM via node:crypto — no extra deps. The master key comes from `SECRETS_KEY`; when it's
 * unset the feature is "not configured" and any encrypt/decrypt call fails loudly rather than
 * silently storing plaintext.
 *
 * Blob format: `gcm:<iv b64>:<tag b64>:<ciphertext b64>` (versioned prefix leaves room to rotate).
 */

const PREFIX = 'gcm';
const IV_BYTES = 12; // GCM standard nonce size
const KEY_BYTES = 32; // AES-256

class SecretsError extends Error {}

/** Decode SECRETS_KEY (hex or base64) into a 32-byte buffer, or null when unset. */
function loadKey(): Buffer | null {
  const raw = config.secretsKey;
  if (!raw) {
    return null;
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretsError(
      `SECRETS_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}); use 64 hex chars or 32-byte base64`,
    );
  }
  return key;
}

let cachedKey: Buffer | null | undefined;
function key(): Buffer {
  if (cachedKey === undefined) {
    cachedKey = loadKey();
  }
  if (!cachedKey) {
    throw new SecretsError('SECRETS_KEY is not configured — cannot encrypt/decrypt secrets');
  }
  return cachedKey;
}

/** True when a usable master key is configured (admin UI gates on this, like Composio). */
export function secretsConfigured(): boolean {
  if (cachedKey === undefined) {
    try {
      cachedKey = loadKey();
    } catch {
      return false;
    }
  }
  return cachedKey != null;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

export function decrypt(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new SecretsError('Malformed secret blob');
  }
  const iv = Buffer.from(parts[1]!, 'base64');
  const tag = Buffer.from(parts[2]!, 'base64');
  const ciphertext = Buffer.from(parts[3]!, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
