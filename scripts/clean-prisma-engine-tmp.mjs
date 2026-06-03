/**
 * prisma generate 在 Windows 上常留下 query_engine-*.dll.node.tmp*，会被 Next standalone 追踪进安装包（每个 ~20MB）。
 */
import { readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

/** @param {string} dir */
function cleanTmpEngineFiles(dir) {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.includes(".dll.node.tmp")) continue;
    unlinkSync(join(dir, name));
    removed++;
  }
  return removed;
}

const dirs = [
  join(root, "node_modules", ".prisma", "client"),
  join(root, ".next", "standalone", "node_modules", ".prisma", "client"),
  join(root, ".next", "standalone", ".next", "node_modules", ".prisma", "client"),
];

let total = 0;
for (const dir of dirs) {
  const n = cleanTmpEngineFiles(dir);
  if (n > 0) {
    console.log(`[clean-prisma-engine-tmp] removed ${n} tmp engine(s) from ${dir}`);
    total += n;
  }
}

if (total === 0) {
  console.log("[clean-prisma-engine-tmp] ok (nothing to remove)");
}
