/**
 * Electron 打包后 `server.js` 位于 `app.asar` 内时，`process.chdir(__dirname)` 在 Windows 上会 ENOENT。
 * 父进程已将 cwd 设为 exe 目录；此处跳过失败的 chdir，由 Next 使用 `dir` 参数继续启动。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const server = join(process.cwd(), ".next", "standalone", "server.js");
let s;
try {
  s = readFileSync(server, "utf8");
} catch {
  process.exit(0);
}

if (s.includes("GEMMUSE_STANDALONE_ROOT") && s.includes("process.chdir(dir)")) {
  console.log("[patch-standalone-chdir] already applied");
  process.exit(0);
}

const dirNeedle = "const dir = path.join(__dirname)";
const dirReplacement =
  "const dir = process.env.GEMMUSE_STANDALONE_ROOT\n  ? path.resolve(process.env.GEMMUSE_STANDALONE_ROOT)\n  : path.join(__dirname)";

if (s.includes(dirNeedle) && !s.includes("GEMMUSE_STANDALONE_ROOT")) {
  s = s.replace(dirNeedle, dirReplacement);
}

const chdirNeedle = "process.chdir(__dirname)";
if (s.includes(chdirNeedle)) {
  s = s.replace(
    chdirNeedle,
    `try {\n  process.chdir(dir)\n} catch {\n  try {\n    ${chdirNeedle}\n  } catch {\n    /* Electron+asar: chdir may fail on Windows. */\n  }\n}`
  );
}

if (s === readFileSync(server, "utf8")) {
  console.warn("[patch-standalone-chdir] no changes applied");
  process.exit(0);
}

writeFileSync(server, s, "utf8");
console.log("[patch-standalone-chdir] ok");
