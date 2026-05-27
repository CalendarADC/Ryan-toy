"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import BrandButton from "./BrandButton";
import { emitToast } from "@/lib/ui/toast";
import { CREATE_STEP_PAPER } from "./createStepShell";
import { step1CircleBtnClass } from "./createToolbarCircleButton";
import { IconArchiveFile } from "./step2ToolbarIcons";
// Step4 现在只保留文案区；图片预览/下载移动到 Step3

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function Step4Export() {
  const {
    galleryImages,
    selectedMainImageId,
    selectedMainImageUrl,
    copywriting,
    copyHistory,
    lastTextModelUsed,
    lastImageCountPassed,
    generateCopywriting,
    setCopywriting,
    deleteCopyHistoryRecord,
    status,
    error,
  } = useJewelryGeneratorStore();

  const step4StartedAt = status.step4GenerationStartedAt;
  const [step4ElapsedMs, setStep4ElapsedMs] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  const tagsAsEtsy = useMemo(() => {
    // Etsy tags 可用逗号分隔/空格分隔，这里用逗号+空格更直观
    return (copywriting.tags ?? []).join(", ");
  }, [copywriting.tags]);

  const normalizeForEtsy = (text: string) =>
    text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const canStartCopywriting =
    !!selectedMainImageId && !!(selectedMainImageUrl || galleryImages.length);

  useEffect(() => {
    if (step4StartedAt == null || !status.step4Generating) return;
    const id = window.setInterval(() => {
      setStep4ElapsedMs(Math.max(0, Date.now() - step4StartedAt));
    }, 200);
    return () => window.clearInterval(id);
  }, [status.step4Generating, step4StartedAt]);

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const displayElapsedMs =
    status.step4Generating && step4StartedAt != null ? step4ElapsedMs : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="text-lg font-bold text-gray-900 md:text-xl">Step 4：智能文案与导出</div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            aria-label="文案历史档案"
            title="文案历史档案"
            className={step1CircleBtnClass(historyOpen, false)}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <IconArchiveFile className="shrink-0" />
          </button>

          <BrandButton
            type="button"
            variant="primary"
            shape="full"
            className="h-[34px] px-4 text-sm"
            disabled={!canStartCopywriting || status.step4Generating}
            onClick={() => generateCopywriting()}
          >
            {status.step4Generating ? "生成中..." : "生成文案"}
          </BrandButton>

          {status.step4Generating ? (
            <div className="text-xs font-semibold text-gray-700">
              耗时：{formatElapsed(displayElapsedMs)}
            </div>
          ) : null}

          {!status.step4Generating && lastTextModelUsed ? (
            <div className="text-xs font-semibold text-gray-700">使用模型：{lastTextModelUsed}</div>
          ) : null}

          {!status.step4Generating && typeof lastImageCountPassed === "number" ? (
            <div className="text-xs font-semibold text-gray-700">传入图片张数：{lastImageCountPassed}</div>
          ) : null}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4">
        <section className={`${CREATE_STEP_PAPER} md:min-h-[200px]`}>
          <div className="text-sm font-semibold text-gray-900">文案区（复制即用）</div>

          <div className="mt-3 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">Title</div>
                <button
                  type="button"
                  disabled={!copywriting.title}
                  onClick={async () => {
                    try {
                      await copyToClipboard(copywriting.title);
                      emitToast({ message: "Title 已复制", type: "success" });
                    } catch {
                      emitToast({ message: "复制失败，请重试", type: "error" });
                    }
                  }}
                  className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-3 py-1 text-xs font-semibold text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] disabled:opacity-50"
                >
                  一键复制
                </button>
              </div>
              <textarea
                value={copywriting.title}
                readOnly
                className="h-24 w-full resize-none rounded-xl border border-[rgba(94,111,130,0.16)] bg-[color-mix(in_srgb,var(--create-surface-paper)_96%,var(--create-surface-tray))] p-3 text-sm text-gray-900 outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">Description</div>
                <button
                  type="button"
                  disabled={!copywriting.description}
                  onClick={async () => {
                    try {
                      await copyToClipboard(normalizeForEtsy(copywriting.description));
                      emitToast({ message: "Description 已复制", type: "success" });
                    } catch {
                      emitToast({ message: "复制失败，请重试", type: "error" });
                    }
                  }}
                  className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-3 py-1 text-xs font-semibold text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] disabled:opacity-50"
                >
                  一键复制
                </button>
              </div>
              <textarea
                value={copywriting.description}
                readOnly
                className="h-56 w-full resize-none rounded-xl border border-[rgba(94,111,130,0.16)] bg-[color-mix(in_srgb,var(--create-surface-paper)_96%,var(--create-surface-tray))] p-3 text-sm text-gray-900 outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">Tags（13 个）</div>
                <button
                  type="button"
                  disabled={!copywriting.tags?.length}
                  onClick={async () => {
                    try {
                      await copyToClipboard(normalizeForEtsy(tagsAsEtsy));
                      emitToast({ message: "Tags 已复制", type: "success" });
                    } catch {
                      emitToast({ message: "复制失败，请重试", type: "error" });
                    }
                  }}
                  className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-3 py-1 text-xs font-semibold text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] disabled:opacity-50"
                >
                  一键复制
                </button>
              </div>
              <textarea
                value={tagsAsEtsy}
                readOnly
                className="h-24 w-full resize-none rounded-xl border border-[rgba(94,111,130,0.16)] bg-[color-mix(in_srgb,var(--create-surface-paper)_96%,var(--create-surface-tray))] p-3 text-sm text-gray-900 outline-none"
              />
              {copywriting.tags?.length ? (
                <div className="text-[11px] text-gray-500">
                  当前标签数量：{copywriting.tags.length}（Etsy 期望 13 个，可后续再做严格校验）
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
      {historyOpen ? (
        <div
          className="fixed inset-0 z-[200] flex bg-black/25"
          onClick={() => setHistoryOpen(false)}
          aria-label="关闭文案历史档案"
        >
          <div
            className="ml-auto h-full w-full max-w-[560px] overflow-hidden border-l border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(94,111,130,0.16)] px-4 py-3">
              <div className="text-base font-semibold text-gray-900">文案历史档案</div>
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                className="h-[32px] px-3 text-xs"
                onClick={() => setHistoryOpen(false)}
              >
                关闭
              </BrandButton>
            </div>
            <div className="h-[calc(100%-56px)] space-y-3 overflow-y-auto p-3">
              {[...copyHistory]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((record) => (
                  <article
                    key={record.id}
                    className="rounded-2xl border border-[rgba(94,111,130,0.16)] bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="flex gap-3">
                      <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl border border-[rgba(94,111,130,0.16)] bg-[#EEF2F5]">
                        {record.sourceMainImageUrl ? (
                          <img
                            src={record.sourceMainImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-gray-400">
                            无图
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {record.copywriting.title || "未命名标题"}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-gray-700">
                          {record.copywriting.description || "（无描述）"}
                        </div>
                        <div className="mt-1 line-clamp-1 text-[11px] text-gray-500">
                          {(record.copywriting.tags ?? []).join(", ")}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1">
                      <BrandButton
                        type="button"
                        variant="outline"
                        shape="full"
                        className="h-[30px] px-2 text-[11px]"
                        onClick={() => {
                          setCopywriting(record.copywriting);
                          emitToast({ type: "success", message: "已载入历史文案。" });
                          setHistoryOpen(false);
                        }}
                      >
                        查看
                      </BrandButton>
                      <BrandButton
                        type="button"
                        variant="outline"
                        shape="full"
                        className="h-[30px] px-2 text-[11px]"
                        onClick={() => void copyToClipboard(record.copywriting.title)}
                      >
                        复制题
                      </BrandButton>
                      <BrandButton
                        type="button"
                        variant="outline"
                        shape="full"
                        className="h-[30px] px-2 text-[11px]"
                        onClick={() => void copyToClipboard(record.copywriting.description)}
                      >
                        复制描
                      </BrandButton>
                      <BrandButton
                        type="button"
                        variant="outline"
                        shape="full"
                        className="h-[30px] px-2 text-[11px]"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(record, null, 2)], {
                            type: "application/json;charset=utf-8",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `gemmuse-copy-record-${record.createdAt.replace(/[:.]/g, "-")}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        导出
                      </BrandButton>
                      <BrandButton
                        type="button"
                        variant="danger"
                        shape="full"
                        className="h-[30px] px-2 text-[11px]"
                        onClick={() => deleteCopyHistoryRecord(record.id)}
                      >
                        删除
                      </BrandButton>
                    </div>
                  </article>
                ))}
              {copyHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[rgba(94,111,130,0.22)] bg-white p-6 text-center text-sm text-gray-600">
                  暂无历史文案记录
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
