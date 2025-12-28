// lib/crypto.ts
// Chiffrement AES-256-GCM pour stocker des secrets utilisateur (clés API).
// ⚠️ Nécessite TIPOTE_KEYS_ENCRYPTION_KEY en base64 (32 bytes).
// Exemple (bash):
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let envLoaded = false;

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/**
 * En prod Next.js "standalone", `.env.local` n'est pas forcément chargé automatiquement.
 * On le charge ici (best effort) pour que process.env.TIPOTE_KEYS_ENCRYPTION_KEY soit dispo
 * sans devoir toucher la commande PM2.
 *
 * IMPORTANT: ce loader ne doit JAMAIS casser le runtime (fail-open).
 */
function loadEnvOnce() {
  if (envLoaded) return;
  envLoaded = true;

  try {
    const argv1 = process.argv?.[1] ? path.dirname(process.argv[1]) : "";
    const cwd = process.cwd();

    // On tente plusieurs racines possibles, car en standalone le cwd peut varier.
    // - cwd (si pm2 démarre depuis /home/tipote/tipote-app)
    // - dossier de server.js (process.argv[1])
    // - parents (au cas où le cwd serait .next/standalone)
    const candidates = uniq([
      cwd,
      path.resolve(cwd, ".."),
      path.resolve(cwd, "../.."),
      argv1,
      path.resolve(argv1, ".."),
      path.resolve(argv1, "../.."),
    ]);

    for (const dir of candidates) {
      const envLocalPath = path.join(dir, ".env.local");
      if (fs.existsSync(envLocalPath)) {
        dotenv.config({ path: envLocalPath });
        return;
      }
      const envPath = path.join(dir, ".env");
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        return;
      }
    }

    // Dernier recours: dotenv sans path (ne fait rien si aucun fichier)
    dotenv.config();
  } catch {
    // fail-open (ne doit jamais crasher l'app)
  }
}

// IMPORTANT: on charge l'env au chargement du module
loadEnvOnce();

function getKeyBytes(): Buffer {
  // Re-check au cas où ce module serait bundlé/initialisé avant que cwd soit bon
  loadEnvOnce();

  const raw = process.env.TIPOTE_KEYS_ENCRYPTION_KEY || "";
  if (!raw) {
    throw new Error("Missing TIPOTE_KEYS_ENCRYPTION_KEY");
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error("Invalid TIPOTE_KEYS_ENCRYPTION_KEY (base64 decode failed)");
  }

  if (buf.length !== 32) {
    throw new Error(
      `Invalid TIPOTE_KEYS_ENCRYPTION_KEY (expected 32 bytes, got ${buf.length})`,
    );
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
  const iv = crypto.randomBytes(12); // 96-bit nonce recommandé pour GCM

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
