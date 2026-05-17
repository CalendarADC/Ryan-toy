export {};

declare global {
  interface Window {
    desktopBridge?: {
      isDesktop: boolean;
      getDeviceInfo?: () => { deviceId: string; deviceName: string };
      copyImagePngBase64?: (base64: string) => Promise<boolean>;
    };
  }
}
