// lib/crypto.ts
// Chiffrement AES-256-GCM pour stocker les tokens OAuth en DB.
// Clé : env SOCIAL_TOKENS_ENCRYPTION_KEY (hex 64 chars = 32 bytes).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96 bits recommandé pour GCM
const TAG_LEN = 16; // 128 bits

function getKey(): Buffer {
  const hex = process.env.SOCIAL_TOKENS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "Missing or invalid SOCIAL_TOKENS_ENCRYPTION_KEY (expected 64 hex chars = 32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Chiffre une chaîne en AES-256-GCM.
 * Retourne : iv(hex):tag(hex):ciphertext(hex)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Déchiffre une chaîne produite par encrypt().
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivHex, tagHex, ctHex] = encoded.split(":");
  if (!ivHex || !tagHex || !ctHex) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ctHex, "hex");

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
