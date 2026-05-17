"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Step1StyleOption } from "@/lib/step1/step1StyleOptions";

export default function Step1StyleMenuOption({
  style,
  selected,
  onToggle,
  compact = false,
}: {
  style: Step1StyleOption;
  selected: boolean;
  onToggle: () => void;
  /** 预设向导内略紧凑；tooltip 仍挂到 body，避免被滚动区裁剪 */
  compact?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const showTooltip = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const pad = 12;
    const half = Math.min(170, (window.innerWidth - pad * 2) / 2);
    const left = Math.min(Math.max(centerX, pad + half), window.innerWidth - pad - half);
    setTooltipPos({ top: rect.bottom + 6, left });
    setHovered(true);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        role="option"
        aria-selected={selected}
        className={
          compact
            ? `flex w-full items-center justify-between rounded-xl border px-2 py-2 text-left text-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md ${
                selected
                  ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
                  : "border-transparent bg-white text-[#363028]"
              }`
            : `flex w-full items-center justify-between rounded-xl border border-transparent bg-white px-3 py-2 text-left text-sm shadow-sm transition-all duration-200 ease-out hover:-translate-y-1.5 hover:scale-[1.02] hover:shadow-lg ${
                selected ? "border-amber-300 bg-amber-50 font-semibold text-amber-900" : "text-[#363028]"
              }`
        }
        onClick={onToggle}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setHovered(false)}
        onFocus={showTooltip}
        onBlur={() => setHovered(false)}
      >
        <span className="min-w-0 truncate">{style.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={compact ? "text-[10px] opacity-60" : "text-[11px] opacity-60"}>
            {style.labelEn}
          </span>
          {selected ? <span className="text-amber-700">{"\u2713"}</span> : null}
        </span>
      </button>
      {hovered && tooltipPos
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[200] w-[min(340px,calc(100vw-24px))] -translate-x-1/2 whitespace-normal rounded-xl bg-white p-3 text-xs text-gray-700 shadow-xl ring-1 ring-gray-200"
              style={{ top: tooltipPos.top, left: tooltipPos.left }}
              role="tooltip"
            >
              <p className="text-[11px] leading-relaxed text-gray-600">{style.desc}</p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
