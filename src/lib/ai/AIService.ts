export type AspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "21:9"
  | "3:2"
  | "2:3"
  | "5:4"
  | "4:5";

export type ImageSize = "1K" | "2K" | "4K";

export type LaoZhangSampling = {
  temperature?: number;
  /** Gemini uses topP (camelCase) in generationConfig */
  topP?: number;
};

type LaoZhangPart = {
  inlineData?: { data?: string; mimeType?: string; mime_type?: string };
  inline_data?: { data?: string; mime_type?: string };
  fileData?: { data?: string; mimeType?: string };
  file_data?: { data?: string; mime_type?: string };
  text?: string;
};

type LaoZhangGenerateResponse = {
  candidates?: Array<{
    finishReason?: string;
    finish_reason?: string;
    content?: {
      parts?: LaoZhangPart[];
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    block_reason?: string;
  };
};

const LAOZHANG_IMAGE_API_ORIGIN = "https://api.laozhang.ai";
const LAOZHANG_OPENAI_BASE = "https://api.laozhang.ai/v1";

/** Step1 可选：Pro 与 Flash（老张路径 segment 与 Google 模型名一致） */
export const LAOZHANG_IMAGE_MODEL_PRO = "gemini-3-pro-image-preview" as const;
export const LAOZHANG_IMAGE_MODEL_FLASH = "gemini-3.1-flash-image-preview" as const;
export const LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2 = "gpt-image-2" as const;
export type LaoZhangImageModelId =
  | typeof LAOZHANG_IMAGE_MODEL_PRO
  | typeof LAOZHANG_IMAGE_MODEL_FLASH
  | typeof LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2;

export function resolveLaoZhangImageModelFromBanana(bananaRaw: string): LaoZhangImageModelId {
  const v = bananaRaw.trim();
  if (v === "banana-2") return LAOZHANG_IMAGE_MODEL_FLASH;
  if (v === "gpt-image-2") return LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2;
  return LAOZHANG_IMAGE_MODEL_PRO;
}

/** Step1/2 生图失败时追加给用户的简短说明（原始错误信息仍保留在 message 中） */
export function laoZhangImageFailureUserHint(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("no_image") || d.includes("未找到图片 base64")) {
    return "上游本次未返回图片（NO_IMAGE），常见于高峰或 4K/强扩写。已自动重试仍失败时请：隔几分钟再试、改用 Banana 2、或先开「极速」生成 2K；若带参考图可暂时减少参考图张数。";
  }
  if (d.includes("429") || d.includes("饱和") || d.includes("限流")) {
    return "上游繁忙或限流，请稍后再试，或减少 Step1 同时生成张数。";
  }
  if (d.includes("缺少老张") || d.includes("api key")) {
    return "请在 Step1 顶部填写老张 API Key，或在 .env 中配置 LAOZHANG_API_KEY。";
  }
  if (d.includes("未找到图片") || d.includes("b64_json")) {
    return "gpt-image-2 上游未返回可用图片。可改用 Banana pro/2 重试，或确认老张令牌分组支持 Images API（/v1/images/generations、/v1/images/edits）。";
  }
  return "若持续失败，请检查老张 API Key、套餐额度，或稍后重试。";
}

export function laoZhangImageGenerateUrl(modelId: LaoZhangImageModelId): string {
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return `${LAOZHANG_OPENAI_BASE}/images/generations`;
  }
  return `${LAOZHANG_IMAGE_API_ORIGIN}/v1beta/models/${modelId}:generateContent`;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

/** 429/502/503 时指数退避；默认 1 次（不重试 HTTP），可用 LAOZHANG_IMAGE_MAX_ATTEMPTS 调大 */
const LAOZHANG_IMAGE_MAX_ATTEMPTS = readPositiveIntEnv("LAOZHANG_IMAGE_MAX_ATTEMPTS", 1);
/** finishReason=NO_IMAGE 时单独重试（与 HTTP 重试计数分离），默认 4 次 */
const LAOZHANG_NO_IMAGE_MAX_ATTEMPTS = readPositiveIntEnv("LAOZHANG_NO_IMAGE_MAX_ATTEMPTS", 4);
const LAOZHANG_RETRY_BASE_MS = 3_500;
/** 单次上游生图请求最大等待时长（避免 fetch 无限挂起） */
const LAOZHANG_HTTP_TIMEOUT_MS = 300_000;
/** 拉取外部参考图转 base64 的超时 */
const IMAGE_FETCH_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  return /aborted|timed out|timeout/i.test(error.message);
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const LAOZHANG_429_HINT =
  "建议：隔几分钟再试；可关闭「极速」、Step3 少选视角分批生成，减轻瞬时并发。";

function parseLaoZhangErrorDetail(status: number, bodyText: string): string {
  const trimmed = bodyText.trim();
  try {
    const j = JSON.parse(trimmed) as {
      error?: { message?: string; localized_message?: string };
    };
    const msg = j?.error?.message?.trim();
    if (msg) {
      if (status === 429 && !msg.includes("建议")) return `${msg}（${LAOZHANG_429_HINT}）`;
      return msg;
    }
    const loc = j?.error?.localized_message?.trim();
    if (loc && loc !== "Unknown error") {
      if (status === 429 && !loc.includes("建议")) return `${loc}（${LAOZHANG_429_HINT}）`;
      return loc;
    }
  } catch {
    /* 非 JSON */
  }
  if (status === 429) {
    return `上游繁忙或限流（429）。${LAOZHANG_429_HINT}若持续出现请联系老张客服或升级套餐。`;
  }
  if (status === 503 || status === 502) {
    return "上游暂时不可用（502/503），请稍后重试。";
  }
  return trimmed ? trimmed.slice(0, 800) : "(无响应正文)";
}

function base64FromLaoZhangPart(p: LaoZhangPart | undefined): string | null {
  if (!p) return null;
  const fromInline =
    p.inlineData?.data?.trim() ||
    p.inline_data?.data?.trim() ||
    p.fileData?.data?.trim() ||
    p.file_data?.data?.trim();
  if (fromInline) return fromInline;
  const t = p.text?.trim();
  if (!t) return null;
  if (t.startsWith("data:image/")) {
    const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(t);
    if (m?.[1]) return m[1];
  }
  // 少数代理把整段 base64 放在 text 里（无 data URL 前缀）
  if (/^[A-Za-z0-9+/=\s]+$/.test(t) && t.replace(/\s/g, "").length > 256) {
    return t.replace(/\s/g, "");
  }
  return null;
}

function extractImageBase64FromGenerateResponse(json: LaoZhangGenerateResponse): string | null {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  for (const c of candidates) {
    const parts = Array.isArray(c?.content?.parts) ? c.content.parts : [];
    for (const p of parts) {
      const b64 = base64FromLaoZhangPart(p);
      if (b64) return b64;
    }
  }
  return null;
}

function clonePayloadWithoutSampling(payload: object): object {
  const cloned = JSON.parse(JSON.stringify(payload)) as {
    generationConfig?: Record<string, unknown>;
  };
  const gc = cloned.generationConfig;
  if (gc) {
    delete gc.temperature;
    delete gc.topP;
    delete gc.top_p;
  }
  return cloned;
}

function noImageRetryWaitMs(noImageAttempt: number): number {
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.floor(Math.min(25_000, 2_000 + noImageAttempt * 1_500) * jitter);
}

function buildNoImageDetail(json: LaoZhangGenerateResponse): string {
  const reasons: string[] = [];
  const blockReason =
    json?.promptFeedback?.blockReason?.trim() || json?.promptFeedback?.block_reason?.trim();
  if (blockReason) reasons.push(`blockReason=${blockReason}`);
  const finishReasons = (json?.candidates ?? [])
    .map((c) => c?.finishReason?.trim() || c?.finish_reason?.trim())
    .filter((x): x is string => !!x);
  if (finishReasons.length) reasons.push(`finishReason=${finishReasons.join(",")}`);
  return reasons.length ? `（${reasons.join("；")}）` : "";
}

function hasNoImageFinishReason(json: LaoZhangGenerateResponse): boolean {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  return candidates.some((c) => {
    const r = (c?.finishReason || c?.finish_reason || "").toUpperCase();
    return r === "NO_IMAGE";
  });
}

function shouldRetryEmptyImageResponse(json: LaoZhangGenerateResponse): boolean {
  if (extractImageBase64FromGenerateResponse(json)) return false;
  if (hasNoImageFinishReason(json)) return true;
  // HTTP 200 但无任何 inline 图：按空结果重试（上游偶发只回文本 part）
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  return candidates.length > 0;
}

type GptImage2ImagesResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

function normalizeGptImage2B64Json(value: string): string {
  let v = value.trim();
  if (v.startsWith("data:")) {
    const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(v);
    if (m?.[1]) v = m[1];
  }
  v = v.replace(/\s/g, "");
  const pad = (4 - (v.length % 4)) % 4;
  if (pad) v += "=".repeat(pad);
  return v;
}

async function extractBase64FromGptImage2ImagesResponse(
  json: GptImage2ImagesResponse
): Promise<string | null> {
  const item = json?.data?.[0];
  if (!item) return null;
  if (item.b64_json?.trim()) return normalizeGptImage2B64Json(item.b64_json);
  if (item.url?.trim()) {
    const fetched = await fetchImageToBase64(item.url.trim());
    return fetched.base64;
  }
  return null;
}

function extractFirstImageUrlFromMarkdown(text: string): string | null {
  const md = /!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/i.exec(text);
  if (md?.[1]) return md[1];
  const plain = /(https?:\/\/[^\s)\]"'<>]+)/i.exec(text);
  if (plain?.[1]) return plain[1];
  const dataUrl = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/i.exec(text);
  return dataUrl?.[1] ?? null;
}

function extractImageRefFromGptImage2ChatContent(content: unknown): string | null {
  if (typeof content === "string") {
    return extractFirstImageUrlFromMarkdown(content);
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; text?: string; image_url?: { url?: string } };
      if (p.type === "image_url" && p.image_url?.url?.trim()) return p.image_url.url.trim();
      if (p.type === "text" && p.text) {
        const nested = extractImageRefFromGptImage2ChatContent(p.text);
        if (nested) return nested;
      }
    }
    return null;
  }
  if (content && typeof content === "object") {
    const o = content as Record<string, unknown>;
    if (typeof o.url === "string" && o.url.trim()) return o.url.trim();
    if (typeof o.b64_json === "string" && o.b64_json.trim()) return o.b64_json.trim();
  }
  return null;
}

async function resolveInitImageBlobForGptImage2Edits(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const { mimeType, base64 } = dataUrlToBase64(url);
    const bytes = Buffer.from(base64, "base64");
    return new Blob([bytes], { type: mimeType });
  }
  const fetched = await fetchImageToBase64(url);
  const bytes = Buffer.from(fetched.base64, "base64");
  const ext = fetched.mimeType.includes("jpeg") || fetched.mimeType.includes("jpg") ? "jpg" : "png";
  return new Blob([bytes], { type: fetched.mimeType || `image/${ext}` });
}

function extensionForMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

async function postLaoZhangGptImage2ImagesApi(
  args: {
    operation: "generate" | "edit";
    prompt: string;
    initImageDataUrls?: string[];
  },
  laozhangApiKey?: string
): Promise<string> {
  const apiKey = requireLaoZhangApiKey(laozhangApiKey);
  const prefix =
    args.operation === "generate" ? "gpt-image-2 图像生成失败" : "gpt-image-2 图像编辑失败";
  const endpoint =
    args.operation === "generate"
      ? `${LAOZHANG_OPENAI_BASE}/images/generations`
      : `${LAOZHANG_OPENAI_BASE}/images/edits`;

  let lastStatus = 0;
  let lastBody = "";
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      if (args.operation === "generate") {
        res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2,
              prompt: args.prompt,
            }),
          },
          LAOZHANG_HTTP_TIMEOUT_MS
        );
      } else {
        const sourceUrl = args.initImageDataUrls?.[0]?.trim();
        if (!sourceUrl) {
          throw new Error("gpt-image-2 图生图缺少参考图。");
        }
        const blob = await resolveInitImageBlobForGptImage2Edits(sourceUrl);
        const form = new FormData();
        form.append("model", LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2);
        form.append("prompt", args.prompt);
        form.append("image", blob, `source.${extensionForMime(blob.type)}`);
        res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
          },
          LAOZHANG_HTTP_TIMEOUT_MS
        );
      }
      lastNetworkError = null;
    } catch (error) {
      lastNetworkError = error;
      const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
      if (hasMoreAttempts) {
        await sleep(Math.min(90_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt)));
        continue;
      }
      const detail =
        error instanceof Error
          ? isAbortLikeError(error)
            ? "上游接口响应超时（网络拥堵或服务繁忙）"
            : error.message
          : "请求上游接口失败";
      throw new Error(`${prefix}：${detail}`);
    }

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as GptImage2ImagesResponse;
      const b64 = await extractBase64FromGptImage2ImagesResponse(json);
      if (b64) return b64;
      throw new Error("gpt-image-2 Images API 返回中未找到 b64_json 或 url。");
    }

    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status === 503 || res.status === 502;
    const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
    if (!retryable || !hasMoreAttempts) {
      const detail = parseLaoZhangErrorDetail(res.status, lastBody);
      throw new Error(`${prefix}（HTTP ${res.status}）：${detail}`);
    }
    let waitMs = Math.min(180_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
    const ra = res.headers.get("retry-after");
    if (ra) {
      const sec = Number.parseInt(ra, 10);
      if (!Number.isNaN(sec) && sec > 0) waitMs = Math.min(180_000, sec * 1000);
    }
    await sleep(Math.floor(waitMs * (0.85 + Math.random() * 0.3)));
  }

  if (lastNetworkError) {
    const detail =
      lastNetworkError instanceof Error
        ? isAbortLikeError(lastNetworkError)
          ? "上游接口响应超时（网络拥堵或服务繁忙）"
          : lastNetworkError.message
        : "请求上游接口失败";
    throw new Error(`${prefix}：${detail}`);
  }
  const detail = parseLaoZhangErrorDetail(lastStatus, lastBody);
  throw new Error(`${prefix}（HTTP ${lastStatus}）：${detail}`);
}

async function postLaoZhangGptImage2(args: {
  operation: "generate" | "edit";
  prompt: string;
  initImageDataUrls?: string[];
  laozhangApiKey?: string;
}): Promise<string> {
  try {
    return await postLaoZhangGptImage2ImagesApi(args, args.laozhangApiKey);
  } catch (imagesErr) {
    try {
      return await postLaoZhangOpenAiImageByChat(
        args.operation === "generate"
          ? {
              model: LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2,
              messages: [{ role: "user", content: args.prompt }],
              stream: false,
            }
          : {
              model: LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: args.prompt },
                    ...(args.initImageDataUrls ?? []).map((url) => ({
                      type: "image_url",
                      image_url: { url },
                    })),
                  ],
                },
              ],
              stream: false,
            },
        args.operation,
        args.laozhangApiKey
      );
    } catch {
      throw imagesErr instanceof Error ? imagesErr : new Error(String(imagesErr));
    }
  }
}

async function postLaoZhangOpenAiImageByChat(
  payload: object,
  operation: "generate" | "edit",
  laozhangApiKey?: string
): Promise<string> {
  const apiKey = requireLaoZhangApiKey(laozhangApiKey);
  const prefix = operation === "generate" ? "gpt-image-2 图像生成失败" : "gpt-image-2 图像编辑失败";
  const url = `${LAOZHANG_OPENAI_BASE}/chat/completions`;
  let lastStatus = 0;
  let lastBody = "";
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        LAOZHANG_HTTP_TIMEOUT_MS
      );
      lastNetworkError = null;
    } catch (error) {
      lastNetworkError = error;
      const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
      if (hasMoreAttempts) {
        const waitMs = Math.min(90_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
        await sleep(waitMs);
        continue;
      }
      const detail =
        error instanceof Error
          ? isAbortLikeError(error)
            ? "上游接口响应超时（网络拥堵或服务繁忙）"
            : error.message
          : "请求上游接口失败";
      throw new Error(`${prefix}：${detail}`);
    }

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        data?: Array<{ b64_json?: string; url?: string }>;
      };
      const fromImages = await extractBase64FromGptImage2ImagesResponse(json);
      if (fromImages) return fromImages;

      const content = json?.choices?.[0]?.message?.content;
      const imageRef = extractImageRefFromGptImage2ChatContent(content);
      if (!imageRef) {
        throw new Error("gpt-image-2 返回中未找到图片（无 b64_json/url，Chat 正文亦无图链）。");
      }
      if (imageRef.startsWith("data:")) {
        return dataUrlToBase64(imageRef).base64;
      }
      if (/^[A-Za-z0-9+/=\s]+$/.test(imageRef.replace(/\s/g, "")) && imageRef.length > 256) {
        return normalizeGptImage2B64Json(imageRef);
      }
      const image = await fetchImageToBase64(imageRef);
      return image.base64;
    }

    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status === 503 || res.status === 502;
    const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
    if (!retryable || !hasMoreAttempts) {
      const detail = parseLaoZhangErrorDetail(res.status, lastBody);
      throw new Error(`${prefix}（HTTP ${res.status}）：${detail}`);
    }
    let waitMs = Math.min(180_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
    const ra = res.headers.get("retry-after");
    if (ra) {
      const sec = Number.parseInt(ra, 10);
      if (!Number.isNaN(sec) && sec > 0) waitMs = Math.min(180_000, sec * 1000);
    }
    const jitter = 0.85 + Math.random() * 0.3;
    await sleep(Math.floor(waitMs * jitter));
  }

  if (lastNetworkError) {
    const detail =
      lastNetworkError instanceof Error
        ? isAbortLikeError(lastNetworkError)
          ? "上游接口响应超时（网络拥堵或服务繁忙）"
          : lastNetworkError.message
        : "请求上游接口失败";
    throw new Error(`${prefix}：${detail}`);
  }
  const detail = parseLaoZhangErrorDetail(lastStatus, lastBody);
  throw new Error(`${prefix}（HTTP ${lastStatus}）：${detail}`);
}

/**
 * 调用老张图像 generateContent：HTTP 429/502/503 与 LAOZHANG_IMAGE_MAX_ATTEMPTS 对齐；
 * 200 但无图（含 finishReason=NO_IMAGE）单独按 LAOZHANG_NO_IMAGE_MAX_ATTEMPTS 重试，与前者解耦。
 */
async function postLaoZhangImageGenerate(
  payload: object,
  operation: "generate" | "edit",
  modelId: LaoZhangImageModelId = LAOZHANG_IMAGE_MODEL_PRO,
  laozhangApiKey?: string
): Promise<string> {
  const apiKey = requireLaoZhangApiKey(laozhangApiKey);
  const prefix = operation === "generate" ? "老张图像生成失败" : "老张图像编辑失败";
  const url = laoZhangImageGenerateUrl(modelId);

  let lastEmptyJson: LaoZhangGenerateResponse | null = null;
  let sawHttpOkWithoutImage = false;

  for (let noImageAttempt = 0; noImageAttempt < LAOZHANG_NO_IMAGE_MAX_ATTEMPTS; noImageAttempt++) {
    let lastStatus = 0;
    let lastBody = "";
    let didSamplingFallback = false;
    let lastNetworkError: unknown = null;
    let bodyToSend: object =
      noImageAttempt > 0 ? clonePayloadWithoutSampling(payload) : payload;

    for (let attempt = 0; attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(bodyToSend),
          },
          LAOZHANG_HTTP_TIMEOUT_MS
        );
        lastNetworkError = null;
      } catch (error) {
        lastNetworkError = error;
        const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
        if (hasMoreAttempts) {
          const waitMs = Math.min(90_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
          await sleep(waitMs);
          continue;
        }
        const detail =
          error instanceof Error
            ? isAbortLikeError(error)
              ? "上游接口响应超时（网络拥堵或服务繁忙）"
              : error.message
            : "请求上游接口失败";
        throw new Error(`${prefix}：${detail}`);
      }

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as LaoZhangGenerateResponse;
        const base64 = extractImageBase64FromGenerateResponse(json);
        if (base64) return base64;
        sawHttpOkWithoutImage = true;
        lastEmptyJson = json;
        const canNoImageRetry = noImageAttempt < LAOZHANG_NO_IMAGE_MAX_ATTEMPTS - 1;
        if (shouldRetryEmptyImageResponse(json) && canNoImageRetry) {
          await sleep(noImageRetryWaitMs(noImageAttempt));
          break;
        }
        throw new Error(`老张返回结果中未找到图片 base64 数据${buildNoImageDetail(json)}。`);
      }

      lastStatus = res.status;
      lastBody = await res.text().catch(() => "");

      const retryable = res.status === 429 || res.status === 503 || res.status === 502;
      const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;

      const payloadAny = bodyToSend as {
        generationConfig?: { temperature?: unknown; topP?: unknown; top_p?: unknown };
      };
      const hasSampling =
        !!payloadAny?.generationConfig &&
        (payloadAny.generationConfig.temperature !== undefined ||
          payloadAny.generationConfig.topP !== undefined ||
          payloadAny.generationConfig.top_p !== undefined);

      if (
        !retryable &&
        hasSampling &&
        !didSamplingFallback &&
        (res.status === 400 || res.status === 422)
      ) {
        const bodyLower = lastBody.toLowerCase();
        const looksLikeSamplingInvalid =
          bodyLower.includes("temperature") || bodyLower.includes("topp") || bodyLower.includes("top_p");

        if (looksLikeSamplingInvalid) {
          didSamplingFallback = true;
          bodyToSend = clonePayloadWithoutSampling(payload);
          continue;
        }
      }

      if (!retryable || !hasMoreAttempts) {
        const detail = parseLaoZhangErrorDetail(res.status, lastBody);
        throw new Error(`${prefix}（HTTP ${res.status}）：${detail}`);
      }

      let waitMs = Math.min(180_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
      const ra = res.headers.get("retry-after");
      if (ra) {
        const sec = parseInt(ra, 10);
        if (!Number.isNaN(sec) && sec > 0) {
          waitMs = Math.min(180_000, sec * 1000);
        }
      }
      if (res.status === 429) {
        const b = lastBody.toLowerCase();
        if (
          lastBody.includes("饱和") ||
          lastBody.includes("负载") ||
          b.includes("capacity") ||
          b.includes("overload")
        ) {
          waitMs = Math.min(180_000, Math.floor(waitMs * 1.85));
        }
      }
      const jitter = 0.85 + Math.random() * 0.3;
      await sleep(Math.floor(waitMs * jitter));
    }

    if (lastNetworkError) {
      const detail =
        lastNetworkError instanceof Error
          ? isAbortLikeError(lastNetworkError)
            ? "上游接口响应超时（网络拥堵或服务繁忙）"
            : lastNetworkError.message
          : "请求上游接口失败";
      throw new Error(`${prefix}：${detail}`);
    }
    if (!sawHttpOkWithoutImage && lastStatus !== 0) {
      const detail = parseLaoZhangErrorDetail(lastStatus, lastBody);
      throw new Error(`${prefix}（HTTP ${lastStatus}）：${detail}`);
    }
  }

  if (lastEmptyJson) {
    throw new Error(`老张返回结果中未找到图片 base64 数据${buildNoImageDetail(lastEmptyJson)}。`);
  }
  throw new Error(`${prefix}：未知错误（无响应）。`);
}

function requireLaoZhangApiKey(overrideKey?: string): string {
  const key = overrideKey?.trim() || process.env.LAOZHANG_API_KEY;
  if (!key) {
    throw new Error(
      "缺少老张 API Key：请在 Step1 顶部填写密钥（会随请求提交），或在安装目录 / 项目根目录的 .env 中配置 LAOZHANG_API_KEY（格式通常为 sk-…）。",
    );
  }
  return key;
}

function dataUrlToBase64(dataUrl: string): { mimeType: string; base64: string } {
  // data:image/png;base64,AAAA
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) {
    // 兜底：当它不是 data URL 时，调用方应该已经做了 fetch -> base64
    return { mimeType: "image/png", base64: dataUrl };
  }
  return { mimeType: m[1], base64: m[2] };
}

async function fetchImageToBase64(url: string): Promise<{ mimeType: string; base64: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {}, IMAGE_FETCH_TIMEOUT_MS);
  } catch (error) {
    const detail =
      error instanceof Error
        ? isAbortLikeError(error)
          ? "拉取参考图超时"
          : error.message
        : "拉取参考图失败";
    throw new Error(`无法拉取图片进行转换（${detail}）`);
  }
  if (!res.ok) {
    throw new Error(`无法拉取图片进行转换（HTTP ${res.status}）`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const ab = await res.arrayBuffer();
  const base64 = Buffer.from(ab).toString("base64");
  return { mimeType: contentType, base64 };
}

export async function laoZhangTextToImage(args: {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  sampling?: LaoZhangSampling;
  laoZhangImageModel?: LaoZhangImageModelId;
  laozhangApiKey?: string;
}): Promise<string> {
  const modelId = args.laoZhangImageModel ?? LAOZHANG_IMAGE_MODEL_PRO;
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return postLaoZhangGptImage2({
      operation: "generate",
      prompt: args.prompt,
      laozhangApiKey: args.laozhangApiKey,
    });
  }
  const payload = {
    contents: [{ parts: [{ text: args.prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: args.aspectRatio,
        imageSize: args.imageSize,
      },
      ...(args.sampling
        ? {
            temperature: args.sampling.temperature,
            topP: args.sampling.topP,
          }
        : {}),
    },
  };

  return postLaoZhangImageGenerate(payload, "generate", modelId, args.laozhangApiKey);
}

async function resolveInlineImagePart(
  initImageDataUrl: string
): Promise<{ inline_data: { mime_type: string; data: string } }> {
  if (initImageDataUrl.startsWith("data:")) {
    const { mimeType, base64 } = dataUrlToBase64(initImageDataUrl);
    return {
      inline_data: {
        mime_type: mimeType,
        data: base64,
      },
    };
  }

  const r = await fetchImageToBase64(initImageDataUrl);
  return {
    inline_data: {
      mime_type: r.mimeType,
      data: r.base64,
    },
  };
}

/** 多参考图图生图：prompt + 多张 inline 图按顺序传给 Gemini */
export async function laoZhangImagesToImage(args: {
  initImageDataUrls: string[];
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  sampling?: LaoZhangSampling;
  laoZhangImageModel?: LaoZhangImageModelId;
  /** Gemini 图改图时可选：把参考图放在 prompt 前，提高源图约束优先级 */
  promptAfterImages?: boolean;
  laozhangApiKey?: string;
}): Promise<string> {
  const modelId = args.laoZhangImageModel ?? LAOZHANG_IMAGE_MODEL_PRO;
  if (!args.initImageDataUrls.length) {
    throw new Error("laoZhangImagesToImage: 至少需要一张参考图");
  }
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return postLaoZhangGptImage2({
      operation: "edit",
      prompt: args.prompt,
      initImageDataUrls: args.initImageDataUrls,
      laozhangApiKey: args.laozhangApiKey,
    });
  }

  const imageParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
  for (const url of args.initImageDataUrls) {
    imageParts.push(await resolveInlineImagePart(url));
  }

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = args.promptAfterImages ? [...imageParts, { text: args.prompt }] : [{ text: args.prompt }, ...imageParts];

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: args.aspectRatio,
        imageSize: args.imageSize,
      },
      ...(args.sampling
        ? {
            temperature: args.sampling.temperature,
            topP: args.sampling.topP,
          }
        : {}),
    },
  };

  return postLaoZhangImageGenerate(payload, "edit", modelId, args.laozhangApiKey);
}

export async function laoZhangImageToImage(args: {
  initImageDataUrl: string; // data:image/...;base64,...
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  sampling?: LaoZhangSampling;
  laoZhangImageModel?: LaoZhangImageModelId;
  promptAfterImages?: boolean;
  laozhangApiKey?: string;
}): Promise<string> {
  return laoZhangImagesToImage({
    initImageDataUrls: [args.initImageDataUrl],
    prompt: args.prompt,
    aspectRatio: args.aspectRatio,
    imageSize: args.imageSize,
    sampling: args.sampling,
    laoZhangImageModel: args.laoZhangImageModel,
    promptAfterImages: args.promptAfterImages,
    laozhangApiKey: args.laozhangApiKey,
  });
}

const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_MODEL = "nano-banana-pro";
const KIE_POLL_INTERVAL_MS = 2200;
const KIE_POLL_TIMEOUT_MS = 180_000;

type KieCreateTaskResponse = {
  code?: number;
  msg?: string;
  data?: { taskId?: string };
};

type KieRecordInfoResponse = {
  code?: number;
  message?: string;
  msg?: string;
  data?: {
    taskStatus?: "pending" | "processing" | "success" | "failed" | string;
    state?: "waiting" | "queuing" | "generating" | "success" | "fail" | string;
    status?: string;
    successFlag?: number;
    resultJson?: string;
    resultUrls?: string[];
    result_urls?: string[];
    images?: string[];
    failMsg?: string;
    failCode?: string;
    response?: { resultUrls?: string[]; resultJson?: string };
  };
};

function requireKieApiKey(kieApiKey?: string): string {
  const k = kieApiKey?.trim();
  if (!k) throw new Error("Missing Kie API key. Please set it in the key selector.");
  return k;
}

function assertPublicImageUrls(urls: string[]): string[] {
  const cleaned = urls.map((x) => x.trim()).filter(Boolean);
  const invalid = cleaned.find((u) => !/^https?:\/\//i.test(u));
  if (invalid) {
    throw new Error("Kie image editing only supports public http/https image URLs.");
  }
  return cleaned;
}

function toKieResolution(v: ImageSize): "1K" | "2K" | "4K" {
  if (v === "2K" || v === "4K") return v;
  return "1K";
}

async function createKieTask(args: {
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  imageSize: ImageSize;
  imageInputUrls?: string[];
  kieApiKey?: string;
}): Promise<string> {
  const apiKey = requireKieApiKey(args.kieApiKey);
  const payload = {
    model: KIE_MODEL,
    callBackUrl: "",
    input: {
      prompt: args.prompt,
      image_input: assertPublicImageUrls(args.imageInputUrls ?? []),
      aspect_ratio: args.aspectRatio,
      output_format: "png",
      resolution: toKieResolution(args.imageSize),
    },
  };
  const res = await fetchWithTimeout(
    `${KIE_BASE_URL}/jobs/createTask`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    LAOZHANG_HTTP_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kie createTask failed (HTTP ${res.status})${text ? `: ${text.slice(0, 220)}` : ""}`);
  }
  const data = (await res.json()) as KieCreateTaskResponse;
  if (data.code && data.code !== 200) {
    throw new Error(`Kie createTask failed: ${data.msg || `code=${data.code}`}`);
  }
  const taskId = data.data?.taskId?.trim();
  if (!taskId) throw new Error("Kie createTask failed: missing taskId.");
  return taskId;
}

function extractKieResultUrls(record: KieRecordInfoResponse): string[] {
  const data = record.data;
  const directArrays = [data?.response?.resultUrls, data?.resultUrls, data?.result_urls, data?.images];
  for (const arr of directArrays) {
    if (Array.isArray(arr) && arr.length) {
      const extracted = arr.filter((x): x is string => typeof x === "string");
      if (extracted.length) return extracted;
    }
  }
  const rawCandidates = [data?.response?.resultJson, data?.resultJson];
  const raw = rawCandidates.find((x) => typeof x === "string" && x.trim()) || "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      resultUrls?: unknown;
      result_urls?: unknown;
      images?: unknown;
      output?: { images?: unknown };
    };
    const maybeUrlArrays = [parsed.resultUrls, parsed.result_urls, parsed.images, parsed.output?.images];
    for (const arr of maybeUrlArrays) {
      if (Array.isArray(arr) && arr.length) {
        const extracted = arr.filter((x): x is string => typeof x === "string");
        if (extracted.length) return extracted;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function isKieSuccessStatus(status: string): boolean {
  return ["success", "succeeded", "completed", "done", "finish", "finished"].includes(status);
}

function isKieFailedStatus(status: string): boolean {
  return ["failed", "fail", "error", "cancelled", "canceled"].includes(status);
}

function resolveKieTaskStatus(data: KieRecordInfoResponse["data"]): string {
  const status = (data?.taskStatus || data?.state || data?.status || "").toLowerCase().trim();
  if (status) return status;
  if (data?.successFlag === 1) return "success";
  if (data?.successFlag === 0) return "failed";
  return "";
}

async function waitKieTaskResult(taskId: string, kieApiKey?: string): Promise<string> {
  const apiKey = requireKieApiKey(kieApiKey);
  const startedAt = Date.now();
  let lastStatus = "";
  let lastMsg = "";
  while (Date.now() - startedAt < KIE_POLL_TIMEOUT_MS) {
    const res = await fetchWithTimeout(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      LAOZHANG_HTTP_TIMEOUT_MS
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kie recordInfo failed (HTTP ${res.status})${text ? `: ${text.slice(0, 220)}` : ""}`);
    }
    const data = (await res.json()) as KieRecordInfoResponse;
    if (data.code && data.code !== 200) {
      throw new Error(`Kie recordInfo failed: ${data.msg || data.message || `code=${data.code}`}`);
    }
    lastMsg = data.msg || data.message || "";
    const status = resolveKieTaskStatus(data.data);
    if (status) lastStatus = status;
    const resultUrls = extractKieResultUrls(data);
    const firstUsable = resultUrls.find((x) => /^https?:\/\//i.test(x));
    // 兼容上游状态值不一致：只要已返回可用 URL 就直接认为成功。
    if (firstUsable) return firstUsable;
    if (isKieSuccessStatus(status)) {
      throw new Error("Kie task succeeded but returned no usable image URL.");
    }
    if (isKieFailedStatus(status)) {
      throw new Error(`Kie task failed: ${data.data?.failMsg || data.msg || data.message || "upstream status=failed"}`);
    }
    await sleep(KIE_POLL_INTERVAL_MS);
  }
  throw new Error(`Kie task timed out (taskId=${taskId}, lastStatus=${lastStatus || "unknown"}, msg=${lastMsg || "n/a"}). Please retry.`);
}

async function fetchImageUrlAsBase64(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {}, IMAGE_FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Failed to download Kie image (HTTP ${res.status}).`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr).toString("base64");
}

async function runKieNanoBanana(args: {
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  imageSize: ImageSize;
  imageInputUrls?: string[];
  kieApiKey?: string;
}): Promise<string> {
  const taskId = await createKieTask(args);
  const resultUrl = await waitKieTaskResult(taskId, args.kieApiKey);
  return fetchImageUrlAsBase64(resultUrl);
}

export async function kieTextToImage(args: {
  prompt: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  imageSize: ImageSize;
  kieApiKey?: string;
}): Promise<string> {
  return runKieNanoBanana(args);
}

export async function kieImageToImage(args: {
  prompt: string;
  initImageUrl: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  imageSize: ImageSize;
  kieApiKey?: string;
}): Promise<string> {
  return runKieNanoBanana({
    ...args,
    imageInputUrls: [args.initImageUrl],
  });
}

export async function kieImagesToImage(args: {
  prompt: string;
  initImageUrls: string[];
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  imageSize: ImageSize;
  kieApiKey?: string;
}): Promise<string> {
  return runKieNanoBanana({
    ...args,
    imageInputUrls: args.initImageUrls,
  });
}

export function kieImageFailureUserHint(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("http/https") || d.includes("public")) {
    return "Kie 图生图只支持公网可访问 URL，请改用云端图片地址或切回 LaoZhang。";
  }
  if (d.includes("timed out")) {
    return "Kie 任务执行超时，请稍后重试。";
  }
  if (d.includes("api key")) {
    return "请先在顶部密钥里切换到 Kie 并保存有效 API Key。";
  }
  return "Kie 生成失败，请检查密钥与网络后重试。";
}

export function toDataPng(base64: string) {
  return `data:image/png;base64,${base64}`;
}

/** @internal vitest */
export function extractImageBase64FromGenerateResponseForTest(json: LaoZhangGenerateResponse) {
  return extractImageBase64FromGenerateResponse(json);
}

/** @internal vitest */
export function shouldRetryEmptyImageResponseForTest(json: LaoZhangGenerateResponse) {
  return shouldRetryEmptyImageResponse(json);
}

/** @internal vitest */
export function extractBase64FromGptImage2ImagesResponseForTest(json: GptImage2ImagesResponse) {
  return extractBase64FromGptImage2ImagesResponse(json);
}

/** @internal vitest */
export function extractImageRefFromGptImage2ChatContentForTest(content: unknown) {
  return extractImageRefFromGptImage2ChatContent(content);
}
