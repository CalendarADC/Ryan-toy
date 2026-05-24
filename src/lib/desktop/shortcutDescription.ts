export const DESKTOP_SHORTCUT_TAGLINE = "点燃您的奇思妙想！";

/** Windows 桌面/开始菜单快捷方式悬停说明（electron-builder 使用 package.json description） */
export function desktopShortcutDescription(version: string): string {
  return `${DESKTOP_SHORTCUT_TAGLINE} v${version}`;
}
