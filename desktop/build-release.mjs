import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJsonPath = join(root, "package.json");

const DESKTOP_SHORTCUT_TAGLINE = "点燃您的奇思妙想！";

function desktopShortcutDescription(version) {
  return `${DESKTOP_SHORTCUT_TAGLINE} v${version}`;
}

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonPath, "utf8"));
}

function writePackageJson(pkg) {
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const env = {
  ...process.env,
  NEXT_OUTPUT_STANDALONE: "1",
};

const pkgSnapshot = readPackageJson();
const savedDescription = pkgSnapshot.description;

try {
  pkgSnapshot.description = desktopShortcutDescription(pkgSnapshot.version);
  writePackageJson(pkgSnapshot);

  run("npm", ["run", "build"], { env, cwd: root });
  run("npm", ["run", "desktop:compile"], { env, cwd: root });
  run("electron-builder", ["--win", "--publish", "never"], { env, cwd: root });
} finally {
  const pkg = readPackageJson();
  pkg.description = savedDescription;
  writePackageJson(pkg);
}
