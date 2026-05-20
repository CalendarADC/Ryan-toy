import { NextResponse } from "next/server";

import {
  expandStep1PromptWithAi,
  parseStep1ExpandDepth,
  resolveStep1ExpandRuntimeConfig,
  type Step1ExpandDepth,
} from "@/lib/ai/step1PromptAiExpander";
import { inferJewelryProductKind } from "@/lib/ai/jewelrySoftLimits";
import { requireApiActiveUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type Body = {
  prompt: string;
  selectedStyles?: string[];
  /** fast=关闭思考；deep=开启 Kimi 思考模式 */
  expandDepth?: Step1ExpandDepth;
};

export async function POST(req: Request) {
  try {
    const authz = await requireApiActiveUser(req);
    if (!authz.ok) return authz.response;

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const selectedStyles = Array.isArray(body.selectedStyles) ? body.selectedStyles.filter(Boolean) : [];
    if (!prompt.trim()) {
      return NextResponse.json({ message: "缺少 prompt" }, { status: 400 });
    }

    const kind = inferJewelryProductKind(prompt);
    const expandDepth = parseStep1ExpandDepth(body.expandDepth);
    const result = await expandStep1PromptWithAi({ prompt, kind, selectedStyles, expandDepth });
    return NextResponse.json({
      expandedPrompt: result.expandedPrompt,
      model: result.model,
      kind,
      expandDepth,
      expandProvider: result.expandConfig.providerLabel,
      expandBaseUrlHost: result.expandConfig.baseUrlHost,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Step1 改写失败";
    const cfg = resolveStep1ExpandRuntimeConfig();
    console.error("[step1-expand]", cfg.baseUrlHost, e);
    return NextResponse.json(
      {
        message,
        expandProvider: cfg.providerLabel,
        expandBaseUrlHost: cfg.baseUrlHost,
      },
      { status: 500 }
    );
  }
}

