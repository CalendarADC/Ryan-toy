import { contextBridge, ipcRenderer } from "electron";

function readArg(prefix: string): string {
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

const deviceId = readArg("--desktop-device-id=");
const encodedName = readArg("--desktop-device-name=");
const deviceName = encodedName ? decodeURIComponent(encodedName) : "Desktop Device";

contextBridge.exposeInMainWorld("desktopBridge", {
  isDesktop: true,
  getDeviceInfo: () => ({ deviceId, deviceName }),
  copyImagePngBase64: (base64: string) =>
    ipcRenderer.invoke("clipboard:write-image-png", base64) as Promise<boolean>,
});
