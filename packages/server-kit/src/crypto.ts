import crypto from "node:crypto";

/**
 * AES-256-GCM with a fresh 12-byte nonce per record (D24).
 * Format: `v1.<nonce b64>.<tag b64>.<ciphertext b64>`. The key is derived from the master secret,
 * which lives only in the environment or a Docker secret.
 */
export interface Cipher { encrypt(plain: string): string; decrypt(token: string): string }

export function createCipher(masterKey: string): Cipher {
  const key = crypto.createHash("sha256").update(`runplan:v1:${masterKey}`).digest();
  return {
    encrypt(plain) {
      const nonce = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, nonce);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return ["v1", nonce.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
    },
    decrypt(token) {
      const [v, n, t, ct] = token.split(".");
      if (v !== "v1" || !n || !t || ct === undefined) throw new Error("bad ciphertext");
      const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(n, "base64"));
      d.setAuthTag(Buffer.from(t, "base64"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
    },
  };
}
