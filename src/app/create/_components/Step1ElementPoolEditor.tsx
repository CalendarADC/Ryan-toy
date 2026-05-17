"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  findElementPoolSearchMatches,
  resolveElementIndexForMatch,
  type ElementPoolTextSpan,
} from "@/lib/step1/step1Presets";
import { scrollTextareaRangeIntoView } from "@/lib/ui/scrollTextareaRangeIntoView";

const TEXTAREA_CLASS =
  "min-h-[120px] w-full resize-y rounded-xl border-0 bg-transparent p-3 text-sm leading-relaxed outline-none focus-visible:ring-0 selection:bg-amber-400 selection:text-gray-900";

function buildHighlightSegments(
  raw: string,
  matches: ElementPoolTextSpan[],
  activeIndex: number
): Array<{ text: string; kind: "plain" | "match" | "active" }> {
  if (!matches.length) return [{ text: raw, kind: "plain" }];
  const parts: Array<{ text: string; kind: "plain" | "match" | "active" }> = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.start > pos) parts.push({ text: raw.slice(pos, m.start), kind: "plain" });
    parts.push({
      text: raw.slice(m.start, m.end),
      kind: i === activeIndex ? "active" : "match",
    });
    pos = m.end;
  });
  if (pos < raw.length) parts.push({ text: raw.slice(pos), kind: "plain" });
  return parts;
}

export default function Step1ElementPoolEditor({
  elementRaw,
  setElementRaw,
  elements,
  textareaRef,
}: {
  elementRaw: string;
  setElementRaw: (v: string) => void;
  elements: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [hasNavigated, setHasNavigated] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  const matches = useMemo(
    () => findElementPoolSearchMatches(elementRaw, elements, query),
    [elementRaw, elements, query]
  );

  const hasQuery = query.trim().length > 0;
  const activeSpan = matches[matchIndex];
  const activeElementIndex = useMemo(() => {
    if (!activeSpan) return -1;
    return resolveElementIndexForMatch(elementRaw, elements, activeSpan);
  }, [activeSpan, elementRaw, elements]);

  const highlightSegments = useMemo(
    () => buildHighlightSegments(elementRaw, hasQuery ? matches : [], matchIndex),
    [elementRaw, matches, matchIndex, hasQuery]
  );

  useEffect(() => {
    setMatchIndex(0);
    setHasNavigated(false);
  }, [query, elementRaw]);

  const syncBackdropScroll = useCallback(() => {
    const ta = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!ta || !backdrop) return;
    backdrop.scrollTop = ta.scrollTop;
    backdrop.scrollLeft = ta.scrollLeft;
  }, [textareaRef]);

  const focusMatchAt = useCallback(
    (index: number) => {
      const span = matches[index];
      const ta = textareaRef.current;
      if (!span || !ta) return;
      setHasNavigated(true);
      ta.focus();
      ta.setSelectionRange(span.start, span.end);
      scrollTextareaRangeIntoView(ta, span.start, span.end);
      syncBackdropScroll();
    },
    [matches, textareaRef, syncBackdropScroll]
  );

  const goToMatch = useCallback(
    (index: number) => {
      if (!matches.length) return;
      const next = ((index % matches.length) + matches.length) % matches.length;
      setMatchIndex(next);
      focusMatchAt(next);
    },
    [matches, focusMatchAt]
  );

  const onSearch = () => {
    if (!matches.length) return;
    goToMatch(0);
  };

  const onNext = () => {
    if (!matches.length) return;
    if (!hasNavigated) goToMatch(0);
    else goToMatch(matchIndex + 1);
  };

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeElementIndex, matchIndex]);

  const statusText = !hasQuery
    ? ""
    : matches.length === 0
      ? "无匹配"
      : `${Math.min(matchIndex + 1, matches.length)}/${matches.length}`;

  const matchedSnippet =
    activeSpan && hasQuery ? elementRaw.slice(activeSpan.start, activeSpan.end) : "";

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) onNext();
                else onSearch();
              }
            }}
            placeholder="搜索元素"
            aria-label="在元素池中搜索元素"
            className="min-w-0 flex-1 rounded-lg border border-[rgba(94,111,130,0.25)] px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
          <button
            type="button"
            onClick={onNext}
            disabled={matches.length === 0}
            title="Enter 定位首条，Shift+Enter 或本按钮跳转下一处"
            className="shrink-0 rounded-lg border border-[rgba(94,111,130,0.2)] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一个
          </button>
        </div>
        {hasQuery ? (
          <p className="text-[10px] leading-relaxed text-gray-500">
            <span className={matches.length === 0 ? "text-red-600" : ""}>{statusText}</span>
            {matchedSnippet ? (
              <span className="ml-2 font-medium text-amber-900">
                当前：
                <span className="ml-1 inline-block rounded bg-amber-300 px-1.5 py-0.5 ring-2 ring-amber-600">
                  {matchedSnippet}
                </span>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[rgba(94,111,130,0.2)] bg-white focus-within:ring-2 focus-within:ring-amber-500">
        <div
          ref={backdropRef}
          aria-hidden
          className={[
            "pointer-events-none absolute inset-0 z-0 overflow-auto whitespace-pre-wrap break-words p-3 text-sm leading-relaxed text-gray-900",
            hasQuery ? "" : "invisible",
          ].join(" ")}
        >
          {highlightSegments.map((seg, i) => {
            if (seg.kind === "active") {
              return (
                <mark
                  key={i}
                  className="rounded-sm bg-amber-400 px-0.5 font-semibold text-gray-900 ring-2 ring-amber-600"
                >
                  {seg.text}
                </mark>
              );
            }
            if (seg.kind === "match") {
              return (
                <mark key={i} className="rounded-sm bg-amber-100 text-gray-900">
                  {seg.text}
                </mark>
              );
            }
            return <span key={i}>{seg.text}</span>;
          })}
        </div>
        <textarea
          ref={textareaRef}
          className={[
            TEXTAREA_CLASS,
            "relative z-[1]",
            hasQuery ? "text-transparent caret-gray-900" : "text-gray-900",
          ].join(" ")}
          value={elementRaw}
          onChange={(e) => setElementRaw(e.target.value)}
          onScroll={syncBackdropScroll}
          placeholder="天使翅+天体+卢恩符文,小鸟,小鸡"
          spellCheck={false}
        />
      </div>

      {elements.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs text-gray-500">已识别 {elements.length} 个元素（点击标签可跳转）：</p>
          <div className="max-h-[140px] overflow-y-auto rounded-lg border border-[rgba(94,111,130,0.12)] bg-[#fafafa] p-2">
            <div className="flex flex-wrap gap-1">
              {elements.map((el, i) => {
                const queryHit = hasQuery && el.includes(query.trim());
                const isActive = i === activeElementIndex && hasNavigated;
                return (
                  <button
                    key={`${el}-${i}`}
                    type="button"
                    ref={isActive ? activeChipRef : undefined}
                    onClick={() => {
                      const idx = matches.findIndex((m) => {
                        const slice = elementRaw.slice(m.start, m.end);
                        return slice === el || el.includes(slice) || slice.includes(el);
                      });
                      if (idx >= 0) goToMatch(idx);
                    }}
                    className={[
                      "max-w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] transition-colors",
                      isActive
                        ? "border-amber-600 bg-amber-300 font-semibold text-amber-950 ring-2 ring-amber-500"
                        : queryHit
                          ? "border-amber-200 bg-amber-50 text-amber-950"
                          : "border-transparent bg-white text-gray-700 hover:bg-gray-100",
                    ].join(" ")}
                    title={el}
                  >
                    {el}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
