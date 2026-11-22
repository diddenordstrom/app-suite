/** Day cover photos on disk, next to the database (/data/uploads in Docker), so a backup of /data covers them. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type PhotoType = keyof typeof PHOTO_TYPES;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const NAME = /^[A-Za-z0-9_-]{16,64}\.(jpg|png|webp)$/;
const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export class PhotoStore {
  constructor(readonly dir: string) {}

  /** Store bytes under a random, unguessable name; returns the name. */
  save(bytes: Uint8Array, type: PhotoType): string {
    fs.mkdirSync(this.dir, { recursive: true });
    const name = `${crypto.randomBytes(18).toString("base64url")}.${PHOTO_TYPES[type]}`;
    fs.writeFileSync(path.join(this.dir, name), bytes);
    return name;
  }

  /** Bytes and content type, or null for unknown or malformed names. */
  read(name: string): { bytes: Buffer; type: string } | null {
    if (!NAME.test(name)) return null;
    try {
      return { bytes: fs.readFileSync(path.join(this.dir, name)), type: CONTENT_TYPES[name.split(".").pop()!] };
    } catch {
      return null;
    }
  }

  /** Best effort: a missing file is already gone. */
  remove(name: string | null | undefined): void {
    if (!name || !NAME.test(name)) return;
    try { fs.unlinkSync(path.join(this.dir, name)); } catch { /* already gone */ }
  }
}
