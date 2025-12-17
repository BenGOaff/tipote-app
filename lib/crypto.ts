// lib/crypto.ts
// Chiffrement AES-256-GCM pour stocker des secrets utilisateur (clés API).
// ⚠️ Nécessite TIPOTE_KEYS_ENCRYPTION_KEY en base64 (32 bytes).
// Exemple (bash):
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import crypto from "crypto";

function getKeyBytes(): Buffer {
  const raw = process.env.TIPOTE_KEYS_ENCRYPTION_KEY || "";
  if (!raw) {
    throw new Error("Missing TIPOTE_KEYS_ENCRYPTION_KEY");
  }

  // base64 -> 32 bytes
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error("TIPOTE_KEYS_ENCRYPTION_KEY must be base64");
  }

  if (buf.length !== 32) {
    throw new Error("TIPOTE_KEYS_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return buf;
}

export type EncryptedPayload = {
  ciphertext_b64: string;
  iv_b64: string;
  tag_b64: string;
};

export function encryptString(plaintext: string): EncryptedPayload {
  const key = getKeyBytes();
  const iv = crypto.randomBytes(12); // recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const enc1 = cipher.update(Buffer.from(plaintext, "utf8"));
  const enc2 = cipher.final();
  const ciphertext = Buffer.concat([enc1, enc2]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext_b64: ciphertext.toString("base64"),
    iv_b64: iv.toString("base64"),
    tag_b64: tag.toString("base64"),
  };
}

export function decryptString(payload: EncryptedPayload): string {
  const key = getKeyBytes();
  const iv = Buffer.from(payload.iv_b64, "base64");
  const tag = Buffer.from(payload.tag_b64, "base64");
  const ciphertext = Buffer.from(payload.ciphertext_b64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const dec1 = decipher.update(ciphertext);
  const dec2 = decipher.final();
  return Buffer.concat([dec1, dec2]).toString("utf8");
}
