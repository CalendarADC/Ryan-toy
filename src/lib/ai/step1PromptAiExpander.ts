import {
  type JewelryProductKind,
  getRingMotifShankScaleTier,
  ensureStep1ExpandedRingMotifShankPhrase,
  STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE,
  STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE,
} from "@/lib/ai/jewelrySoftLimits";

/** 灯泡扩写：快速=关闭 Kimi 思考；深度=开启思考（质量更好、更慢） */
export type Step1ExpandDepth = "fast" | "deep";

export const STEP1_EXPAND_DEPTH_STORAGE_KEY = "gemmuse.step1ExpandDepth";

export function parseStep1ExpandDepth(input: unknown): Step1ExpandDepth {
  return input === "fast" ? "fast" : "deep";
}

export function step1ExpandDepthUsesThinking(depth: Step1ExpandDepth): boolean {
  return depth === "deep";
}

export function isKimiStep1ExpandModel(model: string): boolean {
  return /kimi/i.test(model);
}

type ExpandArgs = {
  prompt: string;
  kind: JewelryProductKind;
  selectedStyles?: string[];
  expandDepth?: Step1ExpandDepth;
};

export const STEP1_EXPAND_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
export const STEP1_EXPAND_DEFAULT_MODEL = "ark-code-latest";
/** 火山方舟多模态识图；须在控制台开通，可用 STEP1_EXPAND_VISION_MODEL 覆盖 */
export const STEP1_EXPAND_DEFAULT_VISION_MODEL = "doubao-1-5-vision-pro-32k-250115";

export const STEP1_REFERENCE_VISION_MAX_IMAGES = 3;

export type Step1ExpandRuntimeConfig = {
  baseUrl: string;
  model: string;
  /** 供前端/日志核对：桌面与网页差异来自环境变量，不是两套代码 */
  providerLabel: string;
  baseUrlHost: string;
};

type ExpandResult = {
  expandedPrompt: string;
  model: string;
  expandConfig: Step1ExpandRuntimeConfig;
};

export type ReferenceAnalyzeResult = {
  analyzedPrompt: string;
  model: string;
  expandConfig: Step1ExpandRuntimeConfig;
};

export type Step1ExpandVisionRuntimeConfig = Step1ExpandRuntimeConfig & {
  chatCompletionsUrl: string;
  visionModel: string;
};

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type Step1ChatMessage = {
  role: "system" | "user";
  content: string | ChatContentPart[];
};

export function labelStep1ExpandProvider(baseUrl: string): string {
  const u = baseUrl.toLowerCase();
  if (u.includes("volces.com") || u.includes("ark.cn-beijing")) return "字节火山方舟";
  if (u.includes("modelverse.cn")) return "Modelverse 网关";
  return "自定义扩写网关";
}

/** 桌面 / Vercel / 本地 dev 共用：仅由 STEP1_EXPAND_* 环境变量决定上游，无分端硬编码 */
export function resolveStep1ExpandRuntimeConfig(): Step1ExpandRuntimeConfig {
  const baseUrl = (
    process.env.STEP1_EXPAND_BASE_URL || STEP1_EXPAND_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const model = process.env.STEP1_EXPAND_MODEL || STEP1_EXPAND_DEFAULT_MODEL;
  let baseUrlHost = baseUrl;
  try {
    baseUrlHost = new URL(baseUrl).host;
  } catch {
    /* keep raw */
  }
  return {
    baseUrl,
    model,
    providerLabel: labelStep1ExpandProvider(baseUrl),
    baseUrlHost,
  };
}

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const EXPAND_REASONING_TRACE_RE =
  /用户要求|我需要严格遵守|规则说|原始提示|反同质化规则|我决定|看例子|为了安全|这是针对|禁止输出思考|品类（推断）/i;

/** 从混有思考过程的回复中截取最终扩写正文 */
export function extractStep1ExpandFinalPrompt(
  raw: string,
  kind: JewelryProductKind
): string {
  const text = raw.trim();
  if (!text) return text;

  const obj = step1ExpandDesignObjectZh(kind);
  const startRe = new RegExp(`设计一枚S925银${obj}`);
  const startIdx = text.search(startRe);
  if (startIdx >= 0) {
    let slice = text.slice(startIdx).trim();
    const bgClause = buildStep1ExpandDisplayBackgroundClause(kind);
    const bgLine = `展示背景：${bgClause}`;
    const bgIdx = slice.indexOf(bgLine);
    if (bgIdx >= 0) {
      slice = slice.slice(0, bgIdx + bgLine.length).trim();
    }
    return slice;
  }

  if (EXPAND_REASONING_TRACE_RE.test(text)) {
    return "";
  }
  return text;
}

function looksLikeExpandReasoningTrace(text: string): boolean {
  if (!text.trim()) return false;
  if (/设计一枚S925银(?:戒指|吊坠)/.test(text)) {
    return EXPAND_REASONING_TRACE_RE.test(text.slice(0, Math.min(400, text.length)));
  }
  return EXPAND_REASONING_TRACE_RE.test(text);
}

function extractAssistantText(
  message?: { content?: string; reasoning_content?: string } | null,
  kind?: JewelryProductKind,
  options?: { expandThinkingEnabled?: boolean }
): string {
  const content = message?.content?.trim() ?? "";
  const reasoning = message?.reasoning_content?.trim() ?? "";

  const pick = (candidate: string) => {
    if (!candidate) return "";
    if (kind) {
      const extracted = extractStep1ExpandFinalPrompt(candidate, kind);
      if (extracted) return extracted;
    }
    return candidate;
  };

  // Kimi 思考模式：推理在 reasoning_content，最终扩写正文应在 content，勿把推理链写入结果
  if (options?.expandThinkingEnabled) {
    if (content) return pick(content);
    return "";
  }

  const contentLooksReasoning = looksLikeExpandReasoningTrace(content);
  const reasoningLooksReasoning = looksLikeExpandReasoningTrace(reasoning);

  if (content && !contentLooksReasoning) return pick(content);
  if (reasoning && !reasoningLooksReasoning) return pick(reasoning);
  if (content && /设计一枚S925银(?:戒指|吊坠)/.test(content)) return pick(content);
  if (reasoning && /设计一枚S925银(?:戒指|吊坠)/.test(reasoning)) return pick(reasoning);
  return pick(content) || pick(reasoning);
}

/** 识图走 Chat Completions（多模态）；Coding Plan 的 kimi 等模型仅在 coding/v3 下可用，勿改到 /api/v3 */
export function resolveStep1ExpandChatCompletionsUrl(configuredBase?: string): string {
  const raw = (configuredBase || process.env.STEP1_EXPAND_BASE_URL || STEP1_EXPAND_DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
  if (raw.includes("/api/coding/v3")) {
    return `${raw}/chat/completions`;
  }
  if (raw.endsWith("/api/v3")) {
    return `${raw}/chat/completions`;
  }
  if (raw.includes("/chat/completions")) {
    return raw;
  }
  if (raw.endsWith("/v1")) {
    return `${raw}/chat/completions`;
  }
  return `${raw}/chat/completions`;
}

export function resolveStep1ExpandVisionRuntimeConfig(): Step1ExpandVisionRuntimeConfig {
  const textCfg = resolveStep1ExpandRuntimeConfig();
  const visionModel =
    process.env.STEP1_EXPAND_VISION_MODEL?.trim() ||
    process.env.STEP1_EXPAND_MODEL?.trim() ||
    STEP1_EXPAND_DEFAULT_VISION_MODEL;
  const chatCompletionsUrl = resolveStep1ExpandChatCompletionsUrl(
    process.env.STEP1_EXPAND_BASE_URL || STEP1_EXPAND_DEFAULT_BASE_URL
  );
  let baseUrlHost = chatCompletionsUrl;
  try {
    baseUrlHost = new URL(chatCompletionsUrl).host;
  } catch {
    /* keep raw */
  }
  return {
    ...textCfg,
    model: visionModel,
    visionModel,
    chatCompletionsUrl,
    baseUrlHost,
    providerLabel: labelStep1ExpandProvider(chatCompletionsUrl),
  };
}

export function sanitizeStep1ReferenceImageUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const t = u.trim();
    if (!t.startsWith("data:image/") && !t.startsWith("http://") && !t.startsWith("https://")) {
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= STEP1_REFERENCE_VISION_MAX_IMAGES) break;
  }
  return out;
}

function buildReferenceVisionUserContent(args: {
  imageUrls: string[];
  existingPrompt?: string;
  selectedStyles?: string[];
}): ChatContentPart[] {
  const lines = [
    "请根据附带的珠宝参考图，输出一段可直接用于 Banana Pro 文生图的中文提示词，目标是生成同款或极近似的单品主图。",
    "必须写清：品类（戒指或吊坠）、金属材质与色泽、主体造型/纹样、镶嵌与配石、工艺细节、整体风格气质、建议的展示角度与光影。",
    "只描述一件首饰、一张主图；禁止 JSON、Markdown、编号列表、前后解释。",
  ];
  if (args.selectedStyles?.length) {
    lines.push(`用户已选风格参考：${args.selectedStyles.join("、")}。`);
  }
  if (args.existingPrompt?.trim()) {
    lines.push(`用户当前草稿（请在其意图上补全，勿无关推翻）：${args.existingPrompt.trim()}`);
  }
  const parts: ChatContentPart[] = [{ type: "text", text: lines.join("\n") }];
  for (const url of args.imageUrls) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

function requireStep1ExpandApiKey(): string {
  const k = process.env.STEP1_EXPAND_API_KEY?.trim();
  if (!k) {
    const isDesktop = process.env.DESKTOP_LOCAL_IMAGE_STORAGE === "1";
    if (isDesktop) {
      throw new Error(
        "缺少 STEP1_EXPAND_API_KEY。桌面版请在 exe 安装目录或用户数据目录新建 .env.local 并填写 STEP1_EXPAND_API_KEY=你的API密钥，然后重启软件。"
      );
    }
    throw new Error(
      "缺少 STEP1_EXPAND_API_KEY。请在 .env.local 配置用于 Step1 强创意改写的新 API Key。"
    );
  }
  return k;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 上游 5xx / 429 / 连接池满等，短退避后重试常能成功 */
function shouldRetryStep1ExpandHttp(status: number, detail: string): boolean {
  if (status === 429 || status === 502 || status === 503) return true;
  if (status === 500) {
    const d = detail.toLowerCase();
    if (
      d.includes("too many connections") ||
      d.includes("1040") ||
      d.includes("timeout") ||
      d.includes("overloaded") ||
      d.includes("temporarily unavailable")
    ) {
      return true;
    }
    return true;
  }
  return false;
}

function parseExpandErrorDetail(text: string): string {
  let detail = text;
  try {
    const j = JSON.parse(text) as OpenAiChatResponse;
    detail = j?.error?.message || detail;
  } catch {
    // non-json
  }
  return detail;
}

/**
 * 供 generate-main 等在回退提示中区分「上游过载」与「配置问题」。
 */
export function step1ExpandDesignObjectZh(kind: JewelryProductKind): string {
  return kind === "ring" ? "戒指" : "吊坠";
}

/** 扩写结果中「展示背景」固定句（XXX = 戒指 / 吊坠） */
export function buildStep1ExpandDisplayBackgroundClause(kind: JewelryProductKind): string {
  const obj = step1ExpandDesignObjectZh(kind);
  return `根据设计，把${obj}放到你认为合适的展示背景里`;
}

/**
 * 将 AI 扩写里随机生成的布景/台面描述替换为固定展示背景句。
 * 输出保留「展示背景：」标签，便于与生图流程对齐。
 */
export function normalizeStep1ExpandedPromptDisplayBackground(
  expanded: string,
  kind: JewelryProductKind
): string {
  const clause = buildStep1ExpandDisplayBackgroundClause(kind);
  const fixedLine = `展示背景：${clause}`;

  let text = expanded.trim();
  if (!text) return fixedLine;

  text = text.replace(/展示背景[：:]\s*[^\n]+/g, "");
  text = text.replace(/(?:拍摄|陈列|布景|场景)(?:背景|环境)?[：:]\s*[^\n]+/g, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (text.includes(clause)) {
    if (!text.includes(fixedLine)) {
      text = text.replace(clause, fixedLine.replace(/^展示背景：/, ""));
    }
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  const sep = /[。！？.!?]\s*$/.test(text) ? "\n" : "。\n";
  return `${text}${sep}${fixedLine}`.trim();
}

/**
 * Step1 扩写 / 生图可用的锆石商品色名（历史上传色板）。
 * 扩写须从该列表选色，由 AI 根据设计自动搭配，不得自造列表外色名。
 */
export const STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES = [
  "粉红锆",
  "变蓝锆",
  "紫蓝锆",
  "中紫红锆",
  "深紫红锆",
  "桔红锆锆",
  "石榴红锆",
  "深石榴红锆",
  "橄榄锆",
  "香槟锆",
  "白锆",
  "黑尖晶锆",
  "红刚玉锆",
  "纳米黄锆",
  "尖晶蓝锆",
  "深纳米蓝锆",
  "浅纳米蓝锆",
  "中纳米蓝锆",
  "绿纳米锆",
  "鹅黄锆",
  "黑锆",
  "金黄锆",
  "苹果绿锆",
  "咖啡锆",
  "胭锆",
  "坦桑锆",
  "绿锆",
  "海蓝锆",
  "深海蓝锆",
] as const;

/** @deprecated 仅兼容旧测试引用 */
export const STEP1_EXPAND_ZIRCON_COLOR_OPTIONS = STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES;

export function formatStep1ZirconCatalogForPrompt(): string {
  return STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES.join("、");
}

/** 扩写输出中镶嵌配石的统一表述（旧版，仅兼容测试） */
export const STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_PHRASE = "镶嵌你认为颜色符合设计的锆石";

/** @deprecated 旧版委托句式 */
export const STEP1_EXPAND_ZIRCON_DESIGN_MATCHED_STONE = "你认为颜色符合设计的锆石";

/** 用户原文是否指定非锆石类主配石（此时可不强制改写成锆石） */
const NON_ZIRCON_GEM_IN_USER_PROMPT_RE =
  /(?:天然|主石|配石)?(?:钻石|红宝石|蓝宝石|祖母绿|翡翠|和田玉|珍珠|紫水晶|黄水晶|白水晶|水晶|玛瑙|碧玺|石榴石|橄榄石|尖晶石|刚玉|海蓝宝|坦桑石|碧玺石|月光石|托帕石)/i;

export function userPromptSpecifiesNonZirconGemstone(userPrompt: string): boolean {
  return NON_ZIRCON_GEM_IN_USER_PROMPT_RE.test(userPrompt);
}

/** 旧版「由生图配色」委托句式（仅用于后处理清除叠句残留） */
const LEGACY_ZIRCON_DELEGATION_RE =
  /(?:镶嵌)?(?:你认为颜色符合(?:整体(?:设计|意境)的)?)+(?:你认为颜色符合(?:整体)?设计的)?锆石|镶嵌你认为(?:符合设计的锆石颜色|颜色符合设计的锆石)|你认为符合设计的锆石/g;

/** 口语 stem（不在色板字面中）→ 商品色名 */
const ZIRCON_STEM_ALIASES: Array<[string, string]> = [
  ["透明无色", "白锆"],
  ["无色透明", "白锆"],
  ["淡粉", "粉红锆"],
  ["深粉", "粉红锆"],
  ["玫瑰金", "香槟锆"],
  ["烟灰", "黑锆"],
  ["炭灰", "黑锆"],
];

function normalizeZirconMentionsToCatalogNames(text: string): string {
  let out = text;
  const aliases = [...ZIRCON_STEM_ALIASES].sort((a, b) => b[0].length - a[0].length);
  for (const [stem, catalog] of aliases) {
    out = out.replace(
      new RegExp(`${stem}(?:色)?(?:的)?(?:小|大)?(?:锆石|锆)`, "g"),
      catalog
    );
  }

  const names = [...STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES].sort(
    (a, b) => b.length - a.length
  );
  for (const name of names) {
    const stem = name.replace(/锆$/u, "");
    out = out.replace(
      new RegExp(`${stem}(?:色)?(?:的)?(?:小|大)?(?:锆石|锆)`, "g"),
      name
    );
  }
  return out;
}

/**
 * AI 扩写后处理：配石色名须落在商品色板内；口语色名映射到目录名，清除旧委托句式叠句。
 */
export function normalizeStep1ExpandedZirconInlay(
  expanded: string,
  userPrompt: string
): string {
  if (userPromptSpecifiesNonZirconGemstone(userPrompt)) {
    return expanded.trim();
  }

  let text = expanded.trim();
  text = text.replace(LEGACY_ZIRCON_DELEGATION_RE, "");
  text = normalizeZirconMentionsToCatalogNames(text);

  for (const name of STEP1_EXPAND_ZIRCON_CATALOG_COLOR_NAMES) {
    text = text.replaceAll(`${name}石`, name);
  }

  text = text.replace(/[，、]{2,}/g, "，");
  text = text.replace(/[，、]\s*([。；\n])/g, "$1");
  return text.trim();
}

/** 用户原文是否明确要求珐琅/琉璃类材质 */
const ENAMEL_LIULI_IN_USER_PROMPT_RE =
  /珐琅|琉璃|掐丝珐琅|搪瓷珐琅|法琅|烧蓝|enamel|cloisonn[eé]|liuli|琉璃质|琉璃材质/i;

export function userPromptAllowsEnamelOrLiuli(userPrompt: string): boolean {
  return ENAMEL_LIULI_IN_USER_PROMPT_RE.test(userPrompt);
}

const ENAMEL_LIULI_IN_EXPANDED_RE =
  /珐琅|琉璃|掐丝珐琅|搪瓷珐琅|法琅|烧蓝|琉璃质|琉璃材质|enamel|cloisonn[eé]|liuli/gi;

/** 扩写禁止出现的镶嵌工艺（密镶 / 微镶 / 排镶等） */
const PAVE_INLAY_IN_EXPANDED_RE = /密镶|微镶|排镶/g;
const PAVE_INLAY_IN_USER_PROMPT_RE = /密镶|微镶|排镶/;

/** 用户原文是否明确要求密镶类工艺 */
export function userPromptAllowsPaveInlay(userPrompt: string): boolean {
  return PAVE_INLAY_IN_USER_PROMPT_RE.test(userPrompt);
}

/**
 * AI 扩写后处理：镶嵌相关描述禁止珐琅/琉璃（用户原文已要求时保留）；禁止密镶（用户原文已要求时保留）。
 */
export function sanitizeStep1ExpandedInlayMaterials(
  expanded: string,
  userPrompt: string
): string {
  let text = expanded;
  if (!userPromptAllowsEnamelOrLiuli(userPrompt)) {
    text = text.replace(ENAMEL_LIULI_IN_EXPANDED_RE, "");
  }
  if (!userPromptAllowsPaveInlay(userPrompt)) {
    text = text.replace(PAVE_INLAY_IN_EXPANDED_RE, "钉镶");
  }
  text = text.replace(/[，、]{2,}/g, "，");
  text = text.replace(/[，、]\s*([。；\n])/g, "$1");
  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}

/** 扩写结果统一后处理（展示背景 + 镶嵌禁珐琅琉璃 + 清除旧版锆石委托句式） */
export function finalizeStep1ExpandedPrompt(
  expanded: string,
  kind: JewelryProductKind,
  userPrompt: string
): string {
  let text = normalizeStep1ExpandedZirconInlay(
    sanitizeStep1ExpandedInlayMaterials(
      normalizeStep1ExpandedPromptDisplayBackground(expanded, kind),
      userPrompt
    ),
    userPrompt
  );
  if (kind === "ring") {
    const tier = getRingMotifShankScaleTier(userPrompt);
    if (tier) text = ensureStep1ExpandedRingMotifShankPhrase(text, tier);
  }
  return text;
}

export function step1ExpandFailureUserHint(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("1040") || d.includes("too many connections")) {
    return "当前多为上游服务暂时过载（数据库连接数已满等），通常与本地 STEP1_EXPAND_API_KEY 无关，请隔几秒再试；若长期出现需联系接口提供方扩容。";
  }
  if (d.includes("缺少 step1_expand") || d.includes("step1_expand_api_key")) {
    return "请在 .env.local 中配置 STEP1_EXPAND_API_KEY（及按需配置 STEP1_EXPAND_MODEL / STEP1_EXPAND_BASE_URL）。";
  }
  if (d.includes("401") || d.includes("unauthorized") || d.includes("invalid api key")) {
    return "请检查 STEP1_EXPAND_API_KEY 是否有效、是否过期。";
  }
  if (
    d.includes("403") &&
    (d.includes("overdue") || d.includes("unpaid") || d.includes("account overdue"))
  ) {
    if (d.includes("modelverse")) {
      return "扩写仍指向 Modelverse（多为 Vercel 未改 STEP1_EXPAND_BASE_URL）。请在 Vercel 把扩写三项改为火山方舟，或结清 Modelverse 账单。";
    }
    return "扩写上游账户欠费或未结清账单，请到对应平台（火山方舟 / Modelverse）控制台处理；网页端请在 Vercel 核对 STEP1_EXPAND_* 是否与桌面 .env.local 一致。";
  }
  if (
    /does not exist|you do not have access|model or endpoint/i.test(detail) &&
    (d.includes("404") || detail.includes("404"))
  ) {
    return "识图模型 ID 在火山方舟不存在或未开通。Coding Plan 请保持 STEP1_EXPAND_BASE_URL 为 coding/v3，并将 STEP1_EXPAND_VISION_MODEL 设为控制台已开通的多模态模型（如 kimi-k2.6）；或改用豆包视觉 endpoint ID。";
  }
  if (
    /image|vision|multimodal|multi-modal|不支持.*图|not support.*image|invalid.*image/i.test(detail)
  ) {
    return "当前 STEP1_EXPAND_VISION_MODEL 可能不支持识图，请在环境变量中配置火山方舟已开通的多模态模型（如豆包视觉系列或 kimi-k2.6）。";
  }
  return "若持续失败，请检查 STEP1_EXPAND_API_KEY / STEP1_EXPAND_MODEL / STEP1_EXPAND_BASE_URL，或稍后重试。";
}

export async function postStep1ExpandChat(args: {
  url: string;
  apiKey: string;
  model: string;
  messages: Step1ChatMessage[];
  temperature?: number;
  errorLabel?: string;
  maxTokens?: number;
  /** Kimi K2：true=思考模式（质量更好）；false=快速模式 */
  enableThinking?: boolean;
  expandKind?: JewelryProductKind;
}): Promise<string> {
  const apiKey = args.apiKey;
  const label = args.errorLabel ?? "Step1 AI";
  const payload: Record<string, unknown> = {
    model: args.model,
    temperature: args.temperature ?? 0.85,
    messages: args.messages,
    ...(typeof args.maxTokens === "number" ? { max_tokens: args.maxTokens } : {}),
    ...(typeof args.enableThinking === "boolean" && isKimiStep1ExpandModel(args.model)
      ? {
          thinking: { type: args.enableThinking ? "enabled" : "disabled" },
        }
      : {}),
  };
  const maxAttempts = 3;
  const backoffMs = [0, 900, 2200];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs[attempt]!);
    }

    let res: Response;
    let text: string;
    try {
      res = await fetch(args.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      text = await res.text().catch(() => "");
    } catch (netErr) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr);
      if (attempt === maxAttempts - 1) {
        throw new Error(`${label}失败（网络）：${msg}`);
      }
      continue;
    }

    if (res.ok) {
      let content = "";
      try {
        const data = JSON.parse(text) as OpenAiChatResponse;
        content = extractAssistantText(data?.choices?.[0]?.message, args.expandKind, {
          expandThinkingEnabled: args.enableThinking,
        });
      } catch {
        content = text.trim();
      }
      if (!content) throw new Error(`${label}返回为空。`);
      return content;
    }

    const detail = parseExpandErrorDetail(text);
    const retry =
      attempt < maxAttempts - 1 && shouldRetryStep1ExpandHttp(res.status, detail);
    if (!retry) {
      throw new Error(`${label}失败（HTTP ${res.status}）：${detail || "unknown error"}`);
    }
  }

  throw new Error(`${label}失败：重试次数已用尽。`);
}

export async function analyzeStep1ReferencesWithAi(args: {
  referenceImageDataUrls: string[];
  existingPrompt?: string;
  selectedStyles?: string[];
}): Promise<ReferenceAnalyzeResult> {
  const imageUrls = sanitizeStep1ReferenceImageUrls(args.referenceImageDataUrls);
  if (!imageUrls.length) {
    throw new Error("请先上传至少一张参考图。");
  }

  const apiKey = requireStep1ExpandApiKey();
  const visionCfg = resolveStep1ExpandVisionRuntimeConfig();

  const system = [
    "你是珠宝电商视觉分析与文生图提示词专家，服务中文用户。",
    "任务：根据用户上传的珠宝参考图，反推一段可直接交给 Banana Pro（Gemini 类珠宝主图模型）的中文生图提示词，用于生成同款或高度相似的单品。",
    "",
    "输出要求（硬性）：",
    "- 全文使用简体中文；禁止 JSON、Markdown、标题、解释性前后缀。",
    "- 明确品类：戒指 或 吊坠（从图中判断）。",
    "- 写清金属（如 S925 银、镀金等）、主体纹样/造型、镶嵌工艺、配石类型与布局、结构比例、风格气质。",
    "- 描述适合电商主图的视角与光影（如正面、轻微 3/4、台面静物），但避免冗长布景堆砌。",
    "- 只描述一件首饰的一张主图；禁止一图多件、系列陈列。",
    "- 不要输出「展示背景：」固定句或灯泡扩写专用的格式套话；这是给生图模型直接阅读的工艺与造型描述。",
    "- 若用户提供草稿文字或风格标签，在其意图上补全而非无关替换。",
  ].join("\n");

  const content = await postStep1ExpandChat({
    url: visionCfg.chatCompletionsUrl,
    apiKey,
    model: visionCfg.visionModel,
    temperature: 0.4,
    errorLabel: "参考图识图",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: buildReferenceVisionUserContent({
          imageUrls,
          existingPrompt: args.existingPrompt,
          selectedStyles: args.selectedStyles,
        }),
      },
    ],
  });

  const expandConfig: Step1ExpandRuntimeConfig = {
    baseUrl: visionCfg.chatCompletionsUrl,
    model: visionCfg.visionModel,
    providerLabel: visionCfg.providerLabel,
    baseUrlHost: visionCfg.baseUrlHost,
  };

  return {
    analyzedPrompt: content.trim(),
    model: visionCfg.visionModel,
    expandConfig,
  };
}

export async function expandStep1PromptWithAi(args: ExpandArgs): Promise<ExpandResult> {
  const apiKey = requireStep1ExpandApiKey();
  const { baseUrl, model, providerLabel, baseUrlHost } = resolveStep1ExpandRuntimeConfig();

  const system = [
    "You are a senior jewelry concept prompt expander for Chinese-speaking users.",
    "",
    "【输出禁令 — 最高优先级】",
    "你可以在内部思考，但对外只输出一段可直接复制到生图框的最终中文提示词正文（写入 message.content）。",
    "禁止在最终正文中输出思考过程、规则复述、自问自答、分析草稿、英文、编号列表、前后解释。",
    "禁止在最终正文中出现「用户要求」「我需要」「规则说」「我决定」等元叙述。",
    "",
    "LANGUAGE (HARD): The entire expanded output MUST be written in Simplified Chinese (简体中文).",
    "Do not write the expanded prompt primarily in English. You may keep short unavoidable tokens (e.g. 925, AU750, 4K, brand codes) inline where natural.",
    "",
    "=== 强制开头格式（必须严格遵守）===",
    "根据品类判断（戒指/吊坠），输出必须以以下格式开头：",
    "- 戒指：设计一枚S925银戒指，【风格1融合风格2融合风格3】，设计主体是【设计元素】",
    "- 吊坠：设计一枚S925银吊坠，【风格1融合风格2融合风格3】，设计主体是【设计元素】",
    "",
    "例子：用户输入「向日葵戒指」选择哥特风+维多利亚哀悼风 → 开头必须为：设计一枚S925银戒指，哥特风融合维多利亚哀悼风格，设计主体是向日葵",
    "",
    "Task: 将用户输入改写为一段可直接用于 AI 生图的简体中文提示词（电商主图级清晰度）。",
    "保持用户原始主题与意图不变；不要擅自更换品类（戒指/吊坠等以用户与品类推断为准）。",
    "风格词（如洛可可/哥特）仅作为特征来源，不得只输出风格标签口号；必须转写为具体可见的结构、线条与工艺表达。",
    "",
    "=== 反同质化规则（硬约束，必须全部满足）===",
    "1) 不改变品类与主体元素。",
    "2) 只选一个设计主命题并贯穿（说明最想被看见什么、为此牺牲什么）。",
    "3) 明确外轮廓语法：对称性、重心、开口或延展方向。",
    "4) 明确镶嵌架构与石位节奏：镶口类型、主辅石关系、石位节奏。",
    "5) 主动规避常见模板，并声明至少两项与常规解法不同。",
    "",
    "=== 反同质化规则（强约束，每次命中 2-3 条）===",
    "6) 体块比例系统；7) 层级与空间结构；8) 线条节奏与转折逻辑；9) 负空间与留白策略；10) 产品工艺说明（镜抛/拉丝/氧化/锤纹等，可全表面同工艺但需写清意图）。",
    "输出长度控制：正文建议 6-8 句，约 220-320 字；写完即结束，不要追加解释。",
    "",
    "HARD OUTPUT RULE — SINGLE HERO PRODUCT ONLY:",
    "扩写正文必须只描述「一件」实体珠宝、「一张」主图画面；禁止一图多件、排戒展示、对比组图、系列陈列等。",
    "若用户列举多种动物或元素：视为同一枚首饰的设计灵感来源，或择一主元素统一呈现，不得要求画面出现多枚戒指/多件主体。",
    "戒指可佩戴性：戒圈与手指接触区域下方禁止向下凸出的尖刺、爪钩、悬挂结构等硌手造型，内侧尽量平顺可戴。",
    "",
    "=== 展示背景（硬性，唯一允许写法）===",
    `品类为戒指时展示背景句必须为：展示背景：根据设计，把戒指放到你认为合适的展示背景里`,
    `品类为吊坠时展示背景句必须为：展示背景：根据设计，把吊坠放到你认为合适的展示背景里`,
    "禁止描写具体台面/布景/环境（如丝绒、橡木、大理石、灰白无缝棚拍、深色木桌、柔光箱场景等）；禁止随机发明背景；把背景决策交给后续生图模型。",
    "扩写正文其它部分可写材质、工艺、造型与光影，但「展示背景」一行只能使用上述固定句。",
    "",
    "=== 镶嵌材质（硬性）===",
    "凡涉及镶嵌、镶口、填色、装饰面时：禁止出现「珐琅」「琉璃」及同义表达（掐丝珐琅、烧蓝、搪瓷釉、法琅、enamel、liuli 等）。",
    "禁止出现「密镶」「微镶」「排镶」及同义密排镶工艺；一律改用爪镶、包镶、钉镶、珠镶、金属托镶、宝石镶口等可量产工艺表述。",
    "仅当用户原始提示中已明确写出珐琅、琉璃或密镶时，才可保留对应表述；否则一律不得写入扩写结果。",
    "",
    "=== 宝石镶嵌配石（须在商品色板内选色，由你自动搭配）===",
    `可用锆石商品色名仅限以下列表（不得自造列表外色名）：${formatStep1ZirconCatalogForPrompt()}。`,
    "主石与点缀石须从该列表中各选 1 个（或主石 1 个 + 点缀 1–2 个）协调色号，并写全称（如「爪镶香槟锆主石，叶脉钉镶深海蓝锆点缀」）。",
    "具体选哪几个色号由你根据设计主题、风格、金属色（如 S925 银）与整体意境自动决定，但名称必须来自上述列表。",
    "禁止使用「镶嵌你认为颜色符合设计的锆石」等委托式空泛句式；禁止写列表外的颜色名（如淡粉锆石、玫瑰金锆等，应写「粉红锆」「香槟锆」等目录名）。",
    "禁止擅自将主配石改成钻石、红宝石、蓝宝石、祖母绿、翡翠、珍珠等，除非用户原文已明确指定。",
    "",
    ...(args.kind === "ring" && getRingMotifShankScaleTier(args.prompt) === "ultra-thin"
      ? [
          "=== 细戒/女戒 — 主题与戒臂比例（仅此情况硬性）===",
          `用户为细戒或女戒等：扩写正文必须**原样写入**：${STEP1_ULTRA_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE}。`,
          "",
        ]
      : []),
    ...(args.kind === "ring" && getRingMotifShankScaleTier(args.prompt) === "medium-thin"
      ? [
          "=== 中细戒/中性戒指 — 主题与戒臂比例（仅此情况硬性）===",
          `用户为中细戒或中性戒指等：扩写正文必须**原样写入**：${STEP1_MEDIUM_THIN_RING_MOTIF_SHANK_MANDATORY_PHRASE}。`,
          "",
        ]
      : []),
    "OUTPUT FORMAT: 只输出最终扩写后的中文提示词纯文本；禁止 JSON、Markdown、解释性前后缀。",
  ].join("\n");

  const user = [
    `品类（推断）: ${args.kind}`,
    args.selectedStyles?.length ? `用户已选风格: ${args.selectedStyles.join(" + ")}` : "",
    "用户原始提示:",
    args.prompt.trim(),
  ].filter(Boolean).join("\n");

  const expandDepth = parseStep1ExpandDepth(args.expandDepth);
  const enableThinking = step1ExpandDepthUsesThinking(expandDepth);
  const url = `${baseUrl}/chat/completions`;
  let content = await postStep1ExpandChat({
    url,
    apiKey,
    model,
    temperature: 0.85,
    maxTokens: enableThinking ? 4096 : 2048,
    enableThinking,
    expandKind: args.kind,
    errorLabel: "Step1 AI 改写",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  content = extractStep1ExpandFinalPrompt(content, args.kind);
  if (!content || !/^设计一枚S925银(?:戒指|吊坠)/.test(content)) {
    throw new Error(
      "Step1 AI 改写返回了思考过程而非最终提示词。请重试；若持续出现可检查 STEP1_EXPAND_MODEL 是否启用了思考模式。"
    );
  }

  return {
    expandedPrompt: finalizeStep1ExpandedPrompt(content, args.kind, args.prompt),
    model,
    expandConfig: { baseUrl, model, providerLabel, baseUrlHost },
  };
}
