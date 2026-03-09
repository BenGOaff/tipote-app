// lib/piiCrypto.ts
// Per-user field-level encryption for PII (leads, contact info).
// Each user has a unique data-encryption key (DEK), itself wrapped with
// a master key (env PII_MASTER_KEY). Even admin/DB access shows only ciphertext.
//
// AES-256-GCM per field — each field gets its own IV.
// Blind indexes via HMAC-SHA256 allow equality search on encrypted fields.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32; // 256 bits

// ---------- master key ----------

function getMasterKey(): Buffer {
  const hex = process.env.PII_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "Missing or invalid PII_MASTER_KEY env var (expected 64 hex chars = 32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

function getHmacSecret(): Buffer {
  const hex = process.env.PII_HMAC_SECRET;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "Missing or invalid PII_HMAC_SECRET env var (expected 64 hex chars = 32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

// ---------- DEK management ----------

/** Generate a new random data-encryption key for a user. */
export function generateDEK(): string {
  return randomBytes(KEY_LEN).toString("hex");
}

/** Wrap (encrypt) a DEK with the master key for storage. */
export function wrapDEK(dekHex: string): string {
  const mk = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, mk, iv);
  const enc = Buffer.concat([
    cipher.update(dekHex, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Unwrap (decrypt) a DEK using the master key. */
export function unwrapDEK(wrapped: string): string {
  const mk = getMasterKey();
  const [ivH, tagH, ctH] = wrapped.split(":");
  if (!ivH || !tagH || !ctH) throw new Error("Invalid wrapped DEK format");
  const decipher = createDecipheriv(ALGO, mk, Buffer.from(ivH, "hex"));
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ctH, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// ---------- field encryption ----------

/** Encrypt a plaintext value with a user's DEK. Returns iv:tag:ct (hex). */
export function encryptField(plaintext: string, dekHex: string): string {
  const key = Buffer.from(dekHex, "hex");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypt a value produced by encryptField(). */
export function decryptField(encoded: string, dekHex: string): string {
  const key = Buffer.from(dekHex, "hex");
  const [ivH, tagH, ctH] = encoded.split(":");
  if (!ivH || !tagH || !ctH) throw new Error("Invalid encrypted field format");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivH, "hex"));
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ctH, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// ---------- blind index ----------

/**
 * Create a deterministic blind index for equality search.
 * Combines user_id + field value so the same email for different users
 * produces different indexes (prevents cross-user correlation).
 */
export function blindIndex(userId: string, value: string): string {
  const secret = getHmacSecret();
  return createHmac("sha256", secret)
    .update(`${userId}:${value.toLowerCase().trim()}`)
    .digest("hex");
}

// ---------- helper: encrypt lead PII fields ----------

export type LeadPII = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  quiz_answers?: unknown | null;
};

export type EncryptedLeadFields = {
  email_encrypted: string;
  email_blind_idx: string;
  first_name_encrypted: string | null;
  last_name_encrypted: string | null;
  phone_encrypted: string | null;
  quiz_answers_encrypted: string | null;
};

/** Encrypt all PII fields of a lead. */
export function encryptLeadPII(
  pii: LeadPII,
  dekHex: string,
  userId: string
): EncryptedLeadFields {
  return {
    email_encrypted: encryptField(pii.email, dekHex),
    email_blind_idx: blindIndex(userId, pii.email),
    first_name_encrypted: pii.first_name
      ? encryptField(pii.first_name, dekHex)
      : null,
    last_name_encrypted: pii.last_name
      ? encryptField(pii.last_name, dekHex)
      : null,
    phone_encrypted: pii.phone ? encryptField(pii.phone, dekHex) : null,
    quiz_answers_encrypted: pii.quiz_answers
      ? encryptField(JSON.stringify(pii.quiz_answers), dekHex)
      : null,
  };
}

/** Decrypt all PII fields of a lead row. */
export function decryptLeadPII(
  row: Record<string, any>,
  dekHex: string
): {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  quiz_answers: unknown | null;
} {
  return {
    email: row.email_encrypted
      ? decryptField(row.email_encrypted, dekHex)
      : row.email ?? "",
    first_name: row.first_name_encrypted
      ? decryptField(row.first_name_encrypted, dekHex)
      : row.first_name ?? null,
    last_name: row.last_name_encrypted
      ? decryptField(row.last_name_encrypted, dekHex)
      : row.last_name ?? null,
    phone: row.phone_encrypted
      ? decryptField(row.phone_encrypted, dekHex)
      : row.phone ?? null,
    quiz_answers: row.quiz_answers_encrypted
      ? JSON.parse(decryptField(row.quiz_answers_encrypted, dekHex))
      : row.quiz_answers ?? null,
  };
}
