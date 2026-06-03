/**
 * 桌面版打包时 Next standalone 可能误收 release-dist-* / release-win-unpacked（历史安装包目录）。
 * outputFileTracingExcludes 为主防线；本脚本在 postbuild 再删一次，避免嵌套进 electron-builder。
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standaloneRoot = join(root, ".next", "standalone");

if (!existsSync(join(standaloneRoot, "server.js"))) {
  process.exit(0);
}

/** @param {string} name */
function isReleaseArtifactDir(name) {
  return (
    name === "release-dist" ||
    name.startsWith("release-dist-") ||
    name === "release-win-unpacked"
  );
}

/** @param {string} dir */
function purgeReleaseArtifactsUnder(dir) {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!isReleaseArtifactDir(name)) continue;
    const target = join(dir, name);
    try {
      if (!statSync(target).isDirectory()) continue;
    } catch {
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    console.log("[purge-standalone-build-artifacts] removed", target);
    removed++;
  }
  return removed;
}

let total = purgeReleaseArtifactsUnder(standaloneRoot);
for (const name of readdirSync(standaloneRoot)) {
  const child = join(standaloneRoot, name);
  try {
    if (statSync(child).isDirectory() && !isReleaseArtifactDir(name)) {
      total += purgeReleaseArtifactsUnder(child);
    }
  } catch {
    /* ignore */
  }
}

if (total === 0) {
  console.log("[purge-standalone-build-artifacts] ok (clean)");
} else {
  console.log(`[purge-standalone-build-artifacts] removed ${total} dir(s)`);
}
