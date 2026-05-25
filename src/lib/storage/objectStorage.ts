import { isKeyOnlyAuthEnabled } from "@/lib/authMode";

type ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

type ObjectStorageGateOptions = {
  /**
   * 默认 false：密钥模式下不使用对象存储。
   * 对于 Kie 临时公网 URL 场景可显式放开。
   */
  allowInKeyOnlyAuth?: boolean;
  /**
   * 默认 false：桌面本地存图模式下不使用对象存储。
   * 对于 Kie 临时公网 URL 场景可显式放开。
   */
  allowInDesktopLocalImageStorage?: boolean;
};

function envEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

function getObjectStorageConfig(opts?: ObjectStorageGateOptions): ObjectStorageConfig | null {
  // 密钥 / 单机模式：图片仅存用户本机（浏览器或桌面目录），不上传 R2。
  if (isKeyOnlyAuthEnabled() && !opts?.allowInKeyOnlyAuth) return null;
  // 桌面版要求图片仅本地保存：显式关闭 R2 上传。
  if (envEnabled(process.env.DESKTOP_LOCAL_IMAGE_STORAGE) && !opts?.allowInDesktopLocalImageStorage) {
    return null;
  }

  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null;
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}

export async function uploadPngBase64ToObjectStorage(args: {
  base64: string;
  key: string;
  gateOptions?: ObjectStorageGateOptions;
}): Promise<{ url: string; objectKey: string } | null> {
  return uploadBinaryToObjectStorage({
    bytes: Buffer.from(args.base64, "base64"),
    key: args.key,
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
    gateOptions: args.gateOptions,
  });
}

export async function uploadBinaryToObjectStorage(args: {
  bytes: Buffer | Uint8Array;
  key: string;
  contentType?: string;
  cacheControl?: string;
  gateOptions?: ObjectStorageGateOptions;
}): Promise<{ url: string; objectKey: string } | null> {
  const cfg = getObjectStorageConfig(args.gateOptions);
  if (!cfg) return null;

  const sdk = await import("@aws-sdk/client-s3").catch(() => null);
  if (!sdk) return null;
  const { PutObjectCommand, S3Client } = sdk;

  const body = Buffer.isBuffer(args.bytes) ? args.bytes : Buffer.from(args.bytes);
  const client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: args.key,
      Body: body,
      ContentType: args.contentType || "application/octet-stream",
      CacheControl: args.cacheControl || "public, max-age=31536000, immutable",
    })
  );

  const base = cfg.publicBaseUrl.replace(/\/+$/, "");
  const cleanKey = args.key.replace(/^\/+/, "");
  return {
    url: `${base}/${cleanKey}`,
    objectKey: cleanKey,
  };
}
