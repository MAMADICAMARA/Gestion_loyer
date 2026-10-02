import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";

// Stockage objet (cahier des charges, Partie 3 : "S3-compatible, un préfixe
// par organisation, URLs signées"). `ObjectStorage` est l'unique surface que
// le reste de l'app connaît — les routes ne savent jamais si le backend est
// S3/R2/MinIO ou le disque local, seulement qu'on peut y déposer un fichier
// et en obtenir une URL signée à durée limitée.
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  remove(key: string): Promise<void>;
}

class S3Storage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT, // non défini = AWS S3 standard ; sinon R2/MinIO/etc.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType })
    );
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return presign(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// Repli développement/démo quand aucun bucket S3-compatible n'est configuré
// (pas de S3_BUCKET dans l'environnement). Même contrat `ObjectStorage` —
// seule la route GET /api/documents/raw/* (montée sans requireAuth, comme
// un vrai endpoint S3 public) change : elle vérifie elle-même la signature
// HMAC + l'expiration, exactement le rôle que joue la signature d'une URL
// S3 présignée. Jamais de secrets réels en jeu, jamais utilisé si S3_BUCKET
// est défini — à ne pas déployer tel quel en production.
class LocalDiskStorage implements ObjectStorage {
  private baseDir = path.resolve(process.cwd(), "uploads");
  private secret = process.env.LOCAL_STORAGE_SECRET ?? process.env.JWT_ACCESS_SECRET ?? "dev-only-insecure-secret";

  async put(key: string, data: Buffer): Promise<void> {
    const dest = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = this.sign(key, exp);
    const base = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return `${base}/api/documents/raw/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
  }

  async remove(key: string): Promise<void> {
    await fs.unlink(path.join(this.baseDir, key)).catch(() => {});
  }

  sign(key: string, exp: number): string {
    return crypto.createHmac("sha256", this.secret).update(`${key}:${exp}`).digest("hex");
  }

  verify(key: string, exp: number, sig: string): boolean {
    if (Date.now() / 1000 > exp) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }
}

const useS3 = Boolean(process.env.S3_BUCKET);
export const storage: ObjectStorage = useS3 ? new S3Storage() : new LocalDiskStorage();
// Exposé uniquement pour la route locale GET /api/documents/raw/* (vérification
// de signature + lecture disque) — jamais utilisé quand S3 est actif.
export const localStorage = useS3 ? null : (storage as LocalDiskStorage);

console.log(`[storage] backend actif : ${useS3 ? "S3-compatible" : "disque local (dev)"}`);
