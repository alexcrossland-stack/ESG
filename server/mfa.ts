import { generateSecret as otplibGenerateSecret, generate as generateTotp, verify as verifyTotp, generateURI } from "otplib";
import crypto from "crypto";

const MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? (() => { throw new Error("MFA_ENCRYPTION_KEY must be set in production"); })() as never : "default-dev-key-32chars-long-abcde");
const ALGORITHM = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update(MFA_ENCRYPTION_KEY).digest();

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, tagHex, encHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
  return decrypted.toString("utf8");
}

export function generateTotpSecret(): string {
  return otplibGenerateSecret({});
}

export async function generateTotpToken(secret: string): Promise<string> {
  return generateTotp({ secret });
}

export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  try {
    return await verifyTotp({ token, secret });
  } catch {
    return false;
  }
}

export function generateTotpUri(secret: string, email: string, issuer: string = "ESG Platform"): string {
  try {
    return generateURI({ strategy: "totp", secret, label: email, issuer });
  } catch {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  }
}

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(Math.ceil(BACKUP_CODE_LENGTH / 2))
      .toString("hex")
      .slice(0, BACKUP_CODE_LENGTH)
      .toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(code.replace(/-/g, "").toUpperCase(), salt, 32, (err, derived) => {
      if (err) reject(err);
      else resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

export async function verifyBackupCode(code: string, hash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [salt, hashHex] = hash.split(":");
    if (!salt || !hashHex) { resolve(false); return; }
    crypto.scrypt(code.replace(/-/g, "").toUpperCase(), salt, 32, (err, derived) => {
      if (err) { resolve(false); return; }
      const derivedHex = derived.toString("hex");
      try {
        resolve(crypto.timingSafeEqual(Buffer.from(hashHex, "hex"), Buffer.from(derivedHex, "hex")));
      } catch { resolve(false); }
    });
  });
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(hashBackupCode));
}
