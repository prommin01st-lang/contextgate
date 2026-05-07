/**
 * Credential Encryption Utility for ContextGate
 * AES-256-GCM with master key from CREDENTIAL_MASTER_KEY env
 */

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const SALT_LEN = 16;
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

function getMasterKey(): Buffer {
  const envKey = process.env.CREDENTIAL_MASTER_KEY;
  if (!envKey || envKey.length === 0) {
    throw new Error("CREDENTIAL_MASTER_KEY environment variable is required");
  }
  // Derive fixed-length key from env variable using scrypt
  return scryptSync(envKey, "contextgate-salt", KEY_LEN);
}

/**
 * Encrypt a plaintext credential string
 * Format: salt(16) + iv(16) + tag(16) + ciphertext
 */
export function encryptCredential(plaintext: string): string {
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);

  // Derive per-credential key using the salt
  const key = scryptSync(masterKey, salt, KEY_LEN);

  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a credential string encrypted with encryptCredential
 */
export function decryptCredential(ciphertext: string): string {
  const masterKey = getMasterKey();
  const combined = Buffer.from(ciphertext, "base64");

  if (combined.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error("Invalid encrypted credential (too short)");
  }

  const salt = combined.subarray(0, SALT_LEN);
  const iv = combined.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = combined.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const encrypted = combined.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  // Derive per-credential key using the salt
  const key = scryptSync(masterKey, salt, KEY_LEN);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}
