import { NextResponse } from "next/server";

import type { CopyTemplate, Copywriting, GalleryImage } from "@/store/jewelryGeneratorStore";
import {
  formatStep1ExpandErrorForUser,
  postStep1ExpandChat,
  resolveStep4CopyHttpTimeoutMs,
  resolveStep4CopyRuntimeConfig,
  sanitizeStep1ReferenceImageUrls,
} from "@/lib/ai/step1PromptAiExpander";
import {
  collectCopyVisionImageUrls,
  selectGalleryImagesForCopyVision,
} from "@/lib/copy/copyVisionGallery";
import { mergeCopyGalleryWithTaskImages } from "@/lib/copy/resolveCopyVisionFromTask";
import { inferJewelryProductKind } from "@/lib/ai/jewelrySoftLimits";
import { requireApiActiveUser } from "@/lib/apiAuth";
import { isDesktopBundledClientRequest } from "@/lib/runtime/desktopLocalMode";
import { prisma } from "@/lib/db";
import { resolveImagePersistMode } from "@/lib/runtime/imagePersistMode";
import { ensureOwnedTaskId, shouldTrustClientTaskId } from "@/lib/tasks/resolveTask";

type Body = {
  taskId?: string;
  provider: string;
  prompt: string;
  selectedMainImageId: string;
  /** Step2 ?? URL?data URL ? https??? Step3 ???????? */
  selectedMainImageUrl?: string;
  galleryImages: GalleryImage[];
  copyTemplate?: CopyTemplate | null;
};

/** 单张 data URL 上限，避免网页 POST 触发平台 413 */
const MAX_COPY_VISION_DATA_URL_CHARS = 1_200_000;

function dropOversizedDataUrls(gallery: GalleryImage[]): GalleryImage[] {
  return gallery
    .map((g) => {
      const url = g.url?.trim() ?? "";
      if (url.startsWith("data:image/") && url.length > MAX_COPY_VISION_DATA_URL_CHARS) {
        return { ...g, url: "" };
      }
      return g;
    })
    .filter((g) => !!g.url?.trim());
}

export const runtime = "nodejs";
/** 多模态文案生成可能超过默认 45s 上游超时，网页端需放宽函数时长。 */
export const maxDuration = 300;

const DEFAULT_COPY_TEMPLATE: CopyTemplate = {
  id: "default",
  name: "Etsy 标准模板",
  titleFormat:
    "输出英文 Etsy 标题，控制在 120-140 字符，覆盖品类、材质、主要元素、风格、受众词。",
  descriptionFormat:
    "英文 Description：Product Description → Material → Care Instructions → Order & Shipping Note → Customization Service；Material 材质须据识图+提示词判定（S925 / 18K Rose Gold Plated / Solid brass 三选一），禁止无依据瞎猜；全篇 emoji≤3；有宝石写锆石色与种类，禁天然宝石表述。",
  tagsFormat:
    "输出 13 个英文标签数组，每个 <= 20 字符，避免重复，优先高意图电商搜索词。",
  createdAt: "",
  updatedAt: "",
};

function normalizeTemplate(input: CopyTemplate | null | undefined): CopyTemplate {
  if (!input) return DEFAULT_COPY_TEMPLATE;
  return {
    ...DEFAULT_COPY_TEMPLATE,
    ...input,
    titleFormat: input.titleFormat?.trim() || DEFAULT_COPY_TEMPLATE.titleFormat,
    descriptionFormat: input.descriptionFormat?.trim() || DEFAULT_COPY_TEMPLATE.descriptionFormat,
    tagsFormat: input.tagsFormat?.trim() || DEFAULT_COPY_TEMPLATE.tagsFormat,
    name: input.name?.trim() || DEFAULT_COPY_TEMPLATE.name,
  };
}

function isNecklaceProduct(prompt: string, gallery: GalleryImage[]): boolean {
  const blob = [
    prompt,
    ...gallery.map((g) => g.debugPromptZh ?? ""),
  ]
    .join("\n")
    .toLowerCase();
  return /necklace|项链|choker|颈链/.test(blob);
}

function buildStep4DescriptionRulesBlock(isNecklace: boolean): string {
  return [
    "description 核心原则：多用短句，让用户带入使用场景，写清楚产品优势。",
    "description emoji 规则（硬性）：禁止在每个段落标题或每条卖点前加 emoji（例如禁止「✨ Product Description」「💖 Care Instructions」）；全篇 description 内 emoji 总数不得超过 3 个，且仅用于点缀正文，不可充当列表符号。",
    "description 宝石规则（硬性）：若产品可见镶嵌宝石，必须在正文中写清宝石颜色与种类（一般为 zircon / cubic zirconia，可用商品色名如 champagne zircon、deep sea blue zircon 等）；禁止出现 natural gemstone、天然宝石、天然石、真宝石、precious stone、ruby/sapphire/emerald 等暗示天然贵重石的表述，除非用户原文已明确要求。",
    "description 材质规则（硬性 — 禁止瞎猜）：",
    "- 写 Material 段前必须先查看附带产品图（识图），并交叉核对用户 prompt 与 material_evidence 字段。",
    "- 主材质只能在以下三者中择一作为正文主表述：S925 sterling silver、18K Rose Gold Plated、Solid brass。",
    "- 禁止在无依据时随机挑选、轮换或「为了好听」默认写 18K Rose Gold Plated / rose gold plated。",
    "- 判定优先级：① 产品图可见金属色泽与镀层 ② 用户 prompt / image_prompt_hints 中的明确材质词 ③ 若仍无法区分，只写「metal finish as shown in the product photos」并描述可见色泽，不得虚构未出现的镀层或材质名。",
    "- 仅当图片或文案明确为「银底 + 玫瑰金镀层 / 分色镀金」等双层工艺时，才可写 S925 基底并说明 18K rose gold plated accents；否则只写一种主材质。",
    "- Title、Material 段、tags 中的材质表述必须一致，且与识图结论一致。",
    "description 必须按以下段落顺序组织（段落标题用纯英文，标题行本身不要 emoji）：",
    "1) Product Description — 卖点与造型、佩戴/礼赠场景。",
    "2) Material — 必须在 Care Instructions 之前单独成段；仅写入经识图+提示词确认的主材质与工艺/表面处理、产品特点（尺寸感、重量感、风格、适用人群等）。",
    isNecklace
      ? "   若判定为项链类产品：Material 段必须写明提供 40cm 与 60cm 两种链长选项（或 40 cm / 60 cm length options）。"
      : "   若非项链：不要写链长选项。",
    "3) Care Instructions — 护理与保养建议。",
    "4) Order & Shipping Note — 手工定制周期、个体差异、图片仅参考、定制品非质量问题不退换等。",
    "5) Customization Service — 可定制说明（若有）。",
    "可参考 Order 表达：Each ring is handcrafted to order, so please allow 21–28 business days for production before shipping...（按品类改写 ring/necklace/pendant）。",
  ].join("\n");
}

function inferCopyMaterialEvidence(prompt: string, gallery: GalleryImage[]): string {
  const blob = [prompt, ...gallery.map((g) => g.debugPromptZh ?? "")]
    .join("\n")
    .toLowerCase();

  const s925: string[] = [];
  const rose: string[] = [];
  const brass: string[] = [];

  if (/s925|925\s*银|sterling\s*silver|纯银|银材|银戒|银吊坠|银戒指|silver\s*ring|silver\s*pendant/.test(blob)) {
    s925.push("prompt/image hints: sterling silver / S925 / 银");
  }
  if (
    /18k\s*rose|rose\s*gold\s*plated|镀金|镀玫瑰金|玫瑰金镀|金镀|gold\s*plated|gold-plated|k\s*金镀/.test(
      blob
    )
  ) {
    rose.push("prompt/image hints: 18K rose gold plated / 镀金");
  }
  if (/solid\s*brass|黄铜|红铜|铜材|\bbrass\b/.test(blob) && !/gold\s*plated|镀/.test(blob)) {
    brass.push("prompt/image hints: solid brass / 黄铜");
  }

  const active = [
    s925.length ? "s925" : null,
    rose.length ? "rose_gold_plated" : null,
    brass.length ? "brass" : null,
  ].filter(Boolean);

  const lines = [
    `material_signals_s925=${s925.join("; ") || "none"}`,
    `material_signals_rose_gold_plated=${rose.join("; ") || "none"}`,
    `material_signals_brass=${brass.join("; ") || "none"}`,
    `material_signal_count=${active.length}`,
    active.length === 1
      ? `material_suggested_primary=${active[0]} (from text hints only — must still confirm on product images)`
      : active.length > 1
        ? "material_suggested_primary=conflict (multiple text hints — resolve using product image metal color, do not guess)"
        : "material_suggested_primary=unknown (must infer from attached product images; do not invent plating)",
  ];
  return lines.join("\n");
}

function extractPromptKeyInfo(
  prompt: string,
  gallery: GalleryImage[],
  visionImageCount: number
): string {
  const kind = inferJewelryProductKind(prompt);
  const necklace = isNecklaceProduct(prompt, gallery);
  const genderHints: string[] = [];
  const lower = prompt.toLowerCase();
  if (/女|女性|女士|girl|women|female/.test(lower)) genderHints.push("female");
  if (/男|男性|男士|men|male/.test(lower)) genderHints.push("male");
  const styleHints = Array.from(
    new Set(
      [
        "vintage",
        "gothic",
        "boho",
        "minimalist",
        "nature",
        "baroque",
        "art deco",
        "rococo",
        "dark",
      ].filter((s) => lower.includes(s))
    )
  );
  const debugLines = gallery
    .map((g) => `${g.type}: ${(g.debugPromptZh ?? "").replace(/\s+/g, " ").trim()}`)
    .filter((x) => x && !x.endsWith(":"))
    .slice(0, 8);
  return [
    `product_kind=${kind}`,
    `is_necklace=${necklace ? "yes" : "no"}`,
    `vision_images_attached=${visionImageCount}`,
    `target_gender=${genderHints.join(",") || "unknown"}`,
    `style_keywords=${styleHints.join(",") || "unknown"}`,
    inferCopyMaterialEvidence(prompt, gallery),
    debugLines.length ? `image_prompt_hints=\n${debugLines.join("\n")}` : "image_prompt_hints=none",
  ].join("\n");
}

function ruleBasedCopywriting(prompt: string): Copywriting {
  return {
    title: buildTitle(prompt),
    tags: pickTagsFromPrompt(prompt),
    description: buildDescription(prompt),
  };
}

function pickTagsFromPrompt(prompt: string): string[] {
  const raw = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const candidates = Array.from(
    new Set([
      "sterling silver",
      "ring",
      "statement ring",
      "gothic",
      "boho",
      "nature",
      "owl",
      "purple",
      "teardrop stone",
      "animal",
      "vintage",
      "gift",
      "handmade",
      ...raw.slice(0, 20),
    ])
  );

  const tags: string[] = [];
  for (const c of candidates) {
    const t = c
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^-+|-+$/g, "");
    if (!t) continue;
    if (tags.includes(t)) continue;
    if (t.length > 20) continue;
    tags.push(t);
    if (tags.length >= 13) break;
  }

  while (tags.length < 13) tags.push(`gothic boho ring ${tags.length + 1}`.slice(0, 20));
  return tags.slice(0, 13);
}

function buildTitle(prompt: string): string {
  const p = prompt.trim();
  if (!p) return "Handmade Gothic Boho Owl Statement Ring with Purple Teardrop Gemstone";
  const short = p.length > 50 ? p.slice(0, 50).trim() + "..." : p;
  return `Handmade ${short} - Gothic Boho Statement Ring`;
}

function buildDescription(prompt: string): string {
  const p = prompt.trim();
  return `A one-of-a-kind statement piece inspired by your design vision.

This sterling silver ring features a ${p ? "crafted look inspired by: " + p : "detailed studio design"} style with an eye-catching centerpiece and an elegant, wearable silhouette.

Perfect for Etsy buyers who love gothic boho aesthetics, nature-themed jewelry, and unique gifts for birthdays, anniversaries, or special celebrations.

Add it to your collection today and enjoy a timeless, artsy look that photographs beautifully on every angle.`;
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function normalizeTagsFromLlm(tags: unknown): string[] {
  const arr = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
  const finalTags: string[] = [];
  for (const t of arr) {
    const tt = String(t).trim();
    if (!tt) continue;
    if (tt.length > 20) continue;
    if (finalTags.includes(tt)) continue;
    finalTags.push(tt);
    if (finalTags.length >= 13) break;
  }
  while (finalTags.length < 13) {
    finalTags.push(`gothic boho ring ${finalTags.length + 1}`.slice(0, 20));
  }
  return finalTags.slice(0, 13);
}

function normalizeEtsyText(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  const authz = await requireApiActiveUser(req);
  if (!authz.ok) return authz.response;

  const desktopUpsert =
    authz.authSource === "desktop-runtime" && isDesktopBundledClientRequest(req);

  let prompt = "";
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    const taskIdRaw = typeof body.taskId === "string" ? body.taskId : "";
    const galleryImages = (body.galleryImages ?? []) as GalleryImage[];
    const selectedMainImageUrl =
      typeof body.selectedMainImageUrl === "string" ? body.selectedMainImageUrl : "";

    if (!prompt.trim()) {
      return NextResponse.json({ message: "缺少 prompt" }, { status: 400 });
    }
    const taskId = await ensureOwnedTaskId(authz.user.id, taskIdRaw, {
      upsertForDesktop: desktopUpsert,
      trustClientTaskId: shouldTrustClientTaskId(req),
    });
    if (!taskId) {
      return NextResponse.json(
        { message: "缺少 taskId，请先在左侧选择或新建任务。" },
        { status: 400 },
      );
    }

    const persistMode = resolveImagePersistMode(req, authz.authSource);
    let visionGallery = dropOversizedDataUrls(galleryImages);
    if (!persistMode.clientOnly && !persistMode.localDisk) {
      visionGallery = await mergeCopyGalleryWithTaskImages({
        userId: authz.user.id,
        taskId,
        gallery: visionGallery,
        fallbackMainUrl: selectedMainImageUrl,
      });
    } else {
      visionGallery = selectGalleryImagesForCopyVision(visionGallery, selectedMainImageUrl);
    }

    const imageUrls = sanitizeStep1ReferenceImageUrls(
      collectCopyVisionImageUrls(visionGallery, selectedMainImageUrl)
    );
    const debugImageCount = imageUrls.length;
    if (!imageUrls.length) {
      return NextResponse.json(
        {
          message:
            "无法读取产品图（可能图片过大或未上传）。网页版请减少图集体积后重试，或先在 Step2 确认主图已生成。",
        },
        { status: 400 }
      );
    }
    const template = normalizeTemplate(body.copyTemplate);
    const runtimeCfg = resolveStep4CopyRuntimeConfig();
    const usedModel = runtimeCfg.model;
    const apiKey = process.env.STEP1_EXPAND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ message: "缺少 STEP1_EXPAND_API_KEY，无法生成文案。" }, { status: 500 });
    }

    const keyInfo = extractPromptKeyInfo(prompt, visionGallery, debugImageCount);
    const necklaceProduct = isNecklaceProduct(prompt, visionGallery);
    const system = [
      "你是 Etsy 资深运营文案专家，负责基于珠宝产品图片与提示词信息生成可发布文案。",
      "必须只返回 JSON 对象，不要 Markdown，不要解释，不要代码块。",
      "JSON 结构固定：{title:string, description:string, tags:string[]}",
      "title 写作逻辑：给谁用 + 是什么 + 产品材质 + 风格 + 元素；符合 Etsy SEO；避免重复词；尽量写满 140 字符（不超过 140）。",
      buildStep4DescriptionRulesBlock(necklaceProduct),
      "tags 必须是 13 个英文标签，严格命中产品特点，不要宽泛词；每个 tag <= 20 字符；不要重复。",
      "tags 需要按 SEO 逻辑输出高意图关键词（材质、工艺、风格、元素、场景、礼赠对象）。",
      "严格按用户模板生成：",
      `title_format: ${template.titleFormat}`,
      `description_format: ${template.descriptionFormat}`,
      `tags_format: ${template.tagsFormat}`,
    ].join("\n");
    const userText = [
      "用户原始需求：",
      prompt,
      "",
      "从 Step3 图片与提示词提取的关键信息：",
      keyInfo,
      "",
      "重要：已附带产品图供识图。写 Material 段前必须先根据图片金属色泽确认主材质，再结合 material_evidence；不得在三者间随意猜测。",
      "",
      "请输出 JSON：title / description / tags。",
    ].join("\n");
    const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> =
      [{ type: "text", text: userText }, ...imageUrls.map((u) => ({ type: "image_url" as const, image_url: { url: u } }))];
    const copyHttpTimeoutMs = resolveStep4CopyHttpTimeoutMs();
    const finalContent = await postStep1ExpandChat({
      url: `${runtimeCfg.baseUrl}/chat/completions`,
      apiKey,
      model: runtimeCfg.model,
      temperature: 0.35,
      maxTokens: 1800,
      httpTimeoutMs: copyHttpTimeoutMs,
      enableThinking: false,
      errorLabel: "Step4 文案生成",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });

    const parsed = extractJsonObject(String(finalContent));
    if (!parsed || typeof parsed !== "object" || parsed === null) {
      return NextResponse.json({
        ...ruleBasedCopywriting(prompt),
        debug_used_model: usedModel,
        debug_image_count: debugImageCount,
      });
    }

    const p = parsed as Record<string, unknown>;
    const titleRaw = typeof p.title === "string" ? p.title.trim() : "";
    const descriptionRaw =
      typeof p.description === "string" ? p.description.trim() : "";
    const finalTags = normalizeTagsFromLlm(p.tags);

    const title = normalizeEtsyText(titleRaw || buildTitle(prompt));
    const description = normalizeEtsyText(descriptionRaw || buildDescription(prompt));

    const copywriting: Copywriting = {
      title,
      tags: finalTags,
      description,
    };

    if (!persistMode.clientOnly && !persistMode.localDisk) {
      await prisma.generatedCopywriting.create({
        data: {
          userId: authz.user.id,
          taskId,
          selectedMainImageId: body.selectedMainImageId ?? null,
          title,
          tags: finalTags,
          description,
          debugUsedModel: usedModel,
          debugImageCount,
        },
      });
    }

    return NextResponse.json({
      ...copywriting,
      debug_used_model: usedModel,
      debug_image_count: debugImageCount,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    const message = formatStep1ExpandErrorForUser(detail);
    return NextResponse.json(
      {
        message: `文案生成失败：${message}`,
        ...ruleBasedCopywriting(prompt),
        debug_used_model: null,
        debug_image_count: null,
      },
      { status: 500 }
    );
  }
}
