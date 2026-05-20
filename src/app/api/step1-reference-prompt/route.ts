import { NextResponse } from "next/server";

import {
  analyzeStep1ReferencesWithAi,
  resolveStep1ExpandRuntimeConfig,
} from "@/lib/ai/step1PromptAiExpander";
import { requireApiActiveUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type Body = {
  referenceImageDataUrls?: string[];
  prompt?: string;
  selectedStyles?: string[];
};

export async function POST(req: Request) {
  try {
    const authz = await requireApiActiveUser(req);
    if (!authz.ok) return authz.response;

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const referenceImageDataUrls = Array.isArray(body.referenceImageDataUrls)
      ? body.referenceImageDataUrls.filter((x): x is string => typeof x === "string")
      : [];
    const existingPrompt = typeof body.prompt === "string" ? body.prompt : "";
    const selectedStyles = Array.isArray(body.selectedStyles)
      ? body.selectedStyles.filter(Boolean)
      : [];

    const result = await analyzeStep1ReferencesWithAi({
      referenceImageDataUrls,
      existingPrompt,
      selectedStyles,
    });

    return NextResponse.json({
      analyzedPrompt: result.analyzedPrompt,
      model: result.model,
      expandProvider: result.expandConfig.providerLabel,
      expandBaseUrlHost: result.expandConfig.baseUrlHost,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "参考图识图失败";
    const cfg = resolveStep1ExpandRuntimeConfig();
    console.error("[step1-reference-prompt]", cfg.baseUrlHost, e);
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
