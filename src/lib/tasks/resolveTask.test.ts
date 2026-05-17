import { describe, expect, it, vi } from "vitest";

import { WEB_LOCAL_MODE_HEADER } from "@/lib/runtime/desktopLocalMode";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  },
}));

describe("ensureOwnedTaskId", () => {
  it("trusts client task id in web-local mode without database", async () => {
    const { ensureOwnedTaskId } = await import("./resolveTask");
    const id = await ensureOwnedTaskId("web-local-user", "task_abc123", {
      trustClientTaskId: true,
    });
    expect(id).toBe("task_abc123");
  });

  it("shouldTrustClientTaskId detects web-local header", async () => {
    const { shouldTrustClientTaskId } = await import("./resolveTask");
    const req = new Request("http://localhost/api/generate-main", {
      headers: { [WEB_LOCAL_MODE_HEADER]: "1" },
    });
    expect(shouldTrustClientTaskId(req)).toBe(true);
  });
});
