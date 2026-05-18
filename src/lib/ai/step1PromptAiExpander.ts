import {
  type JewelryProductKind,
  userWantsDelicateThinWomensRing,
} from "@/lib/ai/jewelrySoftLimits";

type ExpandArgs = {
  prompt: string;
  kind: JewelryProductKind;
  selectedStyles?: string[];
};

type ExpandResult = {
  expandedPrompt: string;
  model: string;
};

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

function extractAssistantText(
  message?: { content?: string; reasoning_content?: string } | null
): string {
  const content = message?.content?.trim() ?? "";
  if (content) return content;
  return message?.reasoning_content?.trim() ?? "";
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

/** AI 扩写：锆石镶嵌可选颜色（须完整书写，禁止自造） */
export const STEP1_EXPAND_ZIRCON_COLOR_OPTIONS = [
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

export type Step1ExpandZirconColor = (typeof STEP1_EXPAND_ZIRCON_COLOR_OPTIONS)[number];

/** 供系统提示注入：锆石颜色白名单 */
export function formatStep1ExpandZirconColorWhitelist(): string {
  return STEP1_EXPAND_ZIRCON_COLOR_OPTIONS.join("、");
}

/** 用户原文是否指定非锆石类主配石（此时可不强制改写成锆石） */
const NON_ZIRCON_GEM_IN_USER_PROMPT_RE =
  /(?:天然|主石|配石)?(?:钻石|红宝石|蓝宝石|祖母绿|翡翠|和田玉|珍珠|紫水晶|黄水晶|白水晶|水晶|玛瑙|碧玺|石榴石|橄榄石|尖晶石|刚玉|海蓝宝|坦桑石|碧玺石|月光石|托帕石)/i;

export function userPromptSpecifiesNonZirconGemstone(userPrompt: string): boolean {
  return NON_ZIRCON_GEM_IN_USER_PROMPT_RE.test(userPrompt);
}

function pickStep1ExpandZirconColor(seed: string): Step1ExpandZirconColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return STEP1_EXPAND_ZIRCON_COLOR_OPTIONS[h % STEP1_EXPAND_ZIRCON_COLOR_OPTIONS.length]!;
}

/** 将扩写中的非锆石配石名改写为白名单锆石色名（用户未指定其它宝石时） */
const GEM_TO_ZIRCON_COLOR: Array<[RegExp, Step1ExpandZirconColor]> = [
  [/紫水晶/g, "中紫红锆"],
  [/黄水晶/g, "纳米黄锆"],
  [/白水晶|水晶/g, "白锆"],
  [/钻石/g, "白锆"],
  [/红宝石/g, "石榴红锆"],
  [/蓝宝石/g, "深海蓝锆"],
  [/祖母绿/g, "绿锆"],
  [/海蓝宝/g, "海蓝锆"],
  [/坦桑石/g, "坦桑锆"],
  [/玛瑙/g, "咖啡锆"],
  [/碧玺/g, "粉红锆"],
  [/石榴石/g, "深石榴红锆"],
  [/橄榄石/g, "橄榄锆"],
  [/尖晶石/g, "尖晶蓝锆"],
  [/刚玉/g, "红刚玉锆"],
  [/宝石/g, "香槟锆"],
];

function expandedTextHasZirconColor(text: string): boolean {
  return STEP1_EXPAND_ZIRCON_COLOR_OPTIONS.some((c) => text.includes(c));
}

/**
 * AI 扩写后处理：镶嵌配石优先锆石，锆石须使用白名单色名。
 */
export function normalizeStep1ExpandedZirconInlay(
  expanded: string,
  userPrompt: string
): string {
  let text = expanded;
  const defaultColor = pickStep1ExpandZirconColor(userPrompt);

  if (!userPromptSpecifiesNonZirconGemstone(userPrompt)) {
    for (const [re, color] of GEM_TO_ZIRCON_COLOR) {
      text = text.replace(re, color);
    }
  }

  for (const c of STEP1_EXPAND_ZIRCON_COLOR_OPTIONS) {
    text = text.replaceAll(`${c}石`, c);
  }

  text = text.replace(/锆石/g, defaultColor);

  if (
    !expandedTextHasZirconColor(text) &&
    /镶嵌|镶口|配石|爪镶|包镶|钉镶|密镶/.test(text) &&
    !userPromptSpecifiesNonZirconGemstone(userPrompt)
  ) {
    const trimmed = text.replace(/[。！？.!?]\s*$/, "");
    text = `${trimmed}，主配石采用${defaultColor}镶嵌。`;
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

/**
 * AI 扩写后处理：镶嵌相关描述禁止珐琅/琉璃（用户原文已要求时保留）。
 */
export function sanitizeStep1ExpandedInlayMaterials(
  expanded: string,
  userPrompt: string
): string {
  if (userPromptAllowsEnamelOrLiuli(userPrompt)) return expanded;
  let text = expanded.replace(ENAMEL_LIULI_IN_EXPANDED_RE, "");
  text = text.replace(/[，、]{2,}/g, "，");
  text = text.replace(/[，、]\s*([。；\n])/g, "$1");
  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}

/** 扩写结果统一后处理（展示背景 + 镶嵌禁珐琅琉璃 + 锆石色名） */
export function finalizeStep1ExpandedPrompt(
  expanded: string,
  kind: JewelryProductKind,
  userPrompt: string
): string {
  return normalizeStep1ExpandedZirconInlay(
    sanitizeStep1ExpandedInlayMaterials(
      normalizeStep1ExpandedPromptDisplayBackground(expanded, kind),
      userPrompt
    ),
    userPrompt
  );
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
  return "若持续失败，请检查 STEP1_EXPAND_API_KEY / STEP1_EXPAND_MODEL / STEP1_EXPAND_BASE_URL，或稍后重试。";
}

export async function expandStep1PromptWithAi(args: ExpandArgs): Promise<ExpandResult> {
  const apiKey = requireStep1ExpandApiKey();
  const baseUrl = (
    process.env.STEP1_EXPAND_BASE_URL || "https://ark.cn-beijing.volces.com/api/coding/v3"
  ).replace(/\/+$/, "");
  const model = process.env.STEP1_EXPAND_MODEL || "ark-code-latest";

  const system = [
    "You are a senior jewelry concept prompt expander for Chinese-speaking users.",
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
    "Task: 将用户输入改写为一段可直接用于 AI 生图的、精炼的简体中文提示词（电商主图级清晰度）。",
    "保持用户原始主题与意图不变；不要擅自更换品类（戒指/吊坠等以用户与品类推断为准）。",
    "补充珠宝专业表达：材质、工艺、可生产性、镶嵌逻辑、轮廓与光影，但避免空洞堆砌。",
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
    "优先改写为可量产的金属镶口工艺：爪镶、包镶、钉镶、珠镶、密镶、金属托镶、宝石镶口等。",
    "仅当用户原始提示中已明确写出珐琅或琉璃时，才可保留该类材质；否则一律不得写入扩写结果。",
    "",
    "=== 宝石镶嵌配石（硬性）===",
    "凡描述宝石镶嵌、配石、点缀石、彩宝镶口时：默认优先采用「锆石」作为主配石/点缀石表述。",
    "锆石必须写出下列颜色名称中的完整色名（禁止只写「锆石」不写颜色，禁止自造色名）：",
    formatStep1ExpandZirconColorWhitelist(),
    "书写示例：爪镶香槟锆、密镶深海蓝锆点缀、包镶中紫红锆主石。",
    "仅当用户原始提示已明确指定非锆石类宝石（如钻石、红宝石、蓝宝石、祖母绿、翡翠、珍珠、天然水晶等）时，才可保留该类宝石名称；否则不得用上述宝石替代锆石作为主配石表述。",
    "",
    ...(args.kind === "ring" && userWantsDelicateThinWomensRing(args.prompt)
      ? [
          "=== 女性细戒 — 主题与戒臂平衡（硬性）===",
          "用户意图为细戒/女戒/秀气通勤/适合女性日常佩戴：不论何种风格或主题，须强调纤细精致、可日常佩戴体量。",
          "主题宜沿戒面上弧分布或自戒肩顺滑融入戒圈（约 1.2–1.8 倍戒臂宽度为体量上限）；禁止中央巨大盾形/牌饰/高台压在极细戒臂上，禁止头重脚轻与台阶式突兀过渡。",
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

  const payload = {
    model,
    temperature: 0.85,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const url = `${baseUrl}/chat/completions`;
  const maxAttempts = 3;
  const backoffMs = [0, 900, 2200];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs[attempt]!);
    }

    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
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
        throw new Error(`Step1 AI 改写失败（网络）：${msg}`);
      }
      continue;
    }

    if (res.ok) {
      let content = "";
      try {
        const data = JSON.parse(text) as OpenAiChatResponse;
        content = extractAssistantText(data?.choices?.[0]?.message);
      } catch {
        content = text.trim();
      }
      if (!content) throw new Error("Step1 AI 改写返回为空。");
      return {
        expandedPrompt: finalizeStep1ExpandedPrompt(content, args.kind, args.prompt),
        model,
      };
    }

    const detail = parseExpandErrorDetail(text);
    const retry =
      attempt < maxAttempts - 1 && shouldRetryStep1ExpandHttp(res.status, detail);
    if (!retry) {
      throw new Error(`Step1 AI 改写失败（HTTP ${res.status}）：${detail || "unknown error"}`);
    }
  }

  throw new Error("Step1 AI 改写失败：重试次数已用尽。");
}
