/** 将 textarea 内当前选区滚动到可视区域中部（支持自动换行的长文本）。 */
export function scrollTextareaRangeIntoView(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number
): void {
  const value = textarea.value;
  if (!value.length) return;

  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  const mirrorStyle = mirror.style;
  mirrorStyle.position = "absolute";
  mirrorStyle.visibility = "hidden";
  mirrorStyle.pointerEvents = "none";
  mirrorStyle.whiteSpace = style.whiteSpace;
  mirrorStyle.wordWrap = style.wordWrap;
  mirrorStyle.overflowWrap = style.overflowWrap as string;
  mirrorStyle.font = style.font;
  mirrorStyle.fontSize = style.fontSize;
  mirrorStyle.fontFamily = style.fontFamily;
  mirrorStyle.lineHeight = style.lineHeight;
  mirrorStyle.letterSpacing = style.letterSpacing;
  mirrorStyle.padding = style.padding;
  mirrorStyle.border = style.border;
  mirrorStyle.boxSizing = style.boxSizing;
  mirrorStyle.width = `${textarea.clientWidth}px`;

  const before = document.createTextNode(value.slice(0, start));
  const mark = document.createElement("span");
  mark.textContent = value.slice(start, end) || "\u200b";
  const after = document.createTextNode(value.slice(end));

  mirror.append(before, mark, after);
  document.body.appendChild(mirror);

  const markTop = mark.offsetTop;
  const markHeight = mark.offsetHeight || parseFloat(style.lineHeight) || 20;
  document.body.removeChild(mirror);

  const paddingTop = parseFloat(style.paddingTop) || 0;
  const target =
    markTop + paddingTop - textarea.clientHeight / 2 + markHeight / 2;
  textarea.scrollTop = Math.max(0, target);
}
