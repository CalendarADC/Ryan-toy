/**
 * Next standalone + Turbopack 会把 @prisma/client 放到 `.next/node_modules/@prisma/client-*`，
 * 其 default.js 会 require 同级的 `.prisma/client/default`。
 * 同时保留 `standalone/node_modules/.prisma/client` 供常规 Node 解析。
 *
 * electron-builder 复制整棵 standalone 树时常会漏掉以 `.` 开头的目录，需在 package.json
 * extraResources 里再显式带上 `.prisma/client`（见 package.json build.extraResources）。
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const fromClient = join(root, "node_modules", ".prisma", "client");
const standaloneServer = join(root, ".next", "standalone", "server.js");

if (!existsSync(standaloneServer)) {
  process.exit(0);
}
if (!existsSync(fromClient)) {
  console.warn("[sync-standalone-prisma] skip: missing generated client at", fromClient);
  process.exit(0);
}

const targets = [
  join(root, ".next", "standalone", "node_modules", ".prisma", "client"),
  join(root, ".next", "standalone", ".next", "node_modules", ".prisma", "client"),
];

for (const dest of targets) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(fromClient, dest, { recursive: true, force: true });
  console.log("[sync-standalone-prisma] ok ->", dest);
}
