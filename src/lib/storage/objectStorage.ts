import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

type S3Sdk = {
  S3Client: new (args: {
    region: string;
    endpoint: string;
    forcePathStyle: boolean;
    credentials: { accessKeyId: string; secretAccessKey: string };
  }) => { send: (cmd: unknown) => Promise<unknown> };
  PutObjectCommand: new (args: {
    Bucket: string;
    Key: string;
    Body: Buffer;
    ContentType: string;
    CacheControl: string;
  }) => unknown;
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

export function explainObjectStorageDisabled(opts?: ObjectStorageGateOptions): string {
  if (isKeyOnlyAuthEnabled() && !opts?.allowInKeyOnlyAuth) {
    return "GEMMUSE_KEY_ONLY_AUTH=1 且当前场景未放行对象存储";
  }
  if (envEnabled(process.env.DESKTOP_LOCAL_IMAGE_STORAGE) && !opts?.allowInDesktopLocalImageStorage) {
    return "DESKTOP_LOCAL_IMAGE_STORAGE=1 且当前场景未放行对象存储";
  }
  const missing: string[] = [];
  if (!process.env.R2_ENDPOINT?.trim()) missing.push("R2_ENDPOINT");
  if (!process.env.R2_BUCKET?.trim()) missing.push("R2_BUCKET");
  if (!process.env.R2_ACCESS_KEY_ID?.trim()) missing.push("R2_ACCESS_KEY_ID");
  if (!process.env.R2_SECRET_ACCESS_KEY?.trim()) missing.push("R2_SECRET_ACCESS_KEY");
  if (!process.env.R2_PUBLIC_BASE_URL?.trim()) missing.push("R2_PUBLIC_BASE_URL");
  if (missing.length) return `缺少环境变量：${missing.join(", ")}`;
  return "未知原因（对象存储配置未生效）";
}

function loadS3Sdk(): S3Sdk | null {
  const searchRoots: string[] = [];
  const standaloneRoot = process.env.GEMMUSE_STANDALONE_ROOT?.trim();
  if (standaloneRoot) {
    searchRoots.push(join(standaloneRoot, "node_modules"));
    searchRoots.push(standaloneRoot);
  }
  const nodePath = process.env.NODE_PATH?.trim();
  if (nodePath) {
    for (const part of nodePath.split(process.platform === "win32" ? ";" : ":")) {
      const p = part.trim();
      if (p) searchRoots.push(p);
    }
  }
  searchRoots.push(join(process.cwd(), "node_modules"));

  for (const root of searchRoots) {
    const pkgJson = join(root, "@aws-sdk", "client-s3", "package.json");
    if (!existsSync(pkgJson)) continue;
    try {
      const req = createRequire(pkgJson);
      return req(".") as S3Sdk;
    } catch {
      /* try next root */
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@aws-sdk/client-s3") as S3Sdk;
  } catch {
    return null;
  }
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
  const sdk = loadS3Sdk();
  if (!sdk) {
    throw new Error(
      "对象存储 SDK 未找到（@aws-sdk/client-s3）。请安装最新桌面版；若已是最新版，请完全退出后重启 GemMuse。"
    );
  }
  const { S3Client, PutObjectCommand } = sdk;

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
