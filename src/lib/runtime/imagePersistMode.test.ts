import { describe, expect, it } from "vitest";

import { WEB_LOCAL_MODE_HEADER } from "@/lib/runtime/desktopLocalMode";
import { resolveImagePersistMode } from "./imagePersistMode";

describe("resolveImagePersistMode", () => {
  it("uses clientOnly for web strict-local requests", () => {
    const req = new Request("http://localhost/api/generate-main", {
      headers: { [WEB_LOCAL_MODE_HEADER]: "1" },
    });
    const mode = resolveImagePersistMode(req, "web-local");
    expect(mode).toEqual({ clientOnly: true, localDisk: false });
  });
});
