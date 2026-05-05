// Rewrite bun-specific dep specifiers (`catalog:` and `workspace:*`)
// in package.json files into concrete version strings / file: paths
// so `npm install --omit=dev` (which electron-builder shells out to
// during release packaging) can resolve every dependency.
//
// Why this exists: bun's catalog feature (`{ "workspaces": { "catalog":
// {...} } }` at the root) and workspace protocol (`workspace:*`) are
// understood by `bun install` but not by npm. In dev that's fine —
// only bun ever reads the package.json. But during release, electron-
// builder spawns `npm install --omit=dev` inside `apps/desktop`, and
// npm errors with EUNSUPPORTEDPROTOCOL on the bun-specific syntax.
//
// We rewrite in-place. The CI runner is ephemeral, so we don't bother
// restoring afterwards. In dev you'd never run this — `bun install`
// resolves the bun-specific syntax natively.
//
// Re-run safe: re-running on already-resolved package.jsons is a no-op
// (catalog: refs become version strings; the rewrite skips
// non-bun-specific specifiers).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..", "..");

const root = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const catalog = root.workspaces?.catalog ?? {};

// Build a name→workspace-path map by reading every workspace package.json.
const workspaceDirs = ["apps/desktop", "apps/web", "packages/core", "packages/server", "packages/ui", "packages/trpc-contract"];
const workspaceByName = new Map();
for (const wsDir of workspaceDirs) {
  const file = path.join(ROOT, wsDir, "package.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  workspaceByName.set(pkg.name, { dir: wsDir, version: pkg.version });
}

function resolveCatalog(pkg, file) {
  for (const key of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const deps = pkg[key];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== "string") continue;
      if (spec === "catalog:" || spec.startsWith("catalog:")) {
        const v = catalog[name];
        if (!v) {
          console.error(
            `${file}: missing catalog entry for "${name}" (spec: "${spec}")`,
          );
          process.exit(1);
        }
        deps[name] = v;
      }
    }
  }
}

function resolveWorkspace(pkg, file, fromDir) {
  for (const key of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    const deps = pkg[key];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== "string") continue;
      if (!spec.startsWith("workspace:")) continue;
      const target = workspaceByName.get(name);
      if (!target) {
        console.error(
          `${file}: workspace ref "${name}" doesn't match any workspace package`,
        );
        process.exit(1);
      }
      // file: paths are resolved relative to the directory containing
      // the package.json that declares them. Use forward slashes so the
      // value is portable across platforms — npm parses both, but
      // backslashes occasionally trip up tools that re-read it.
      const rel = path
        .relative(fromDir, path.join(ROOT, target.dir))
        .replace(/\\/g, "/");
      deps[name] = `file:${rel}`;
    }
  }
}

function rewrite(wsDir) {
  const file = path.join(ROOT, wsDir, "package.json");
  if (!fs.existsSync(file)) return;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  resolveCatalog(pkg, file);
  resolveWorkspace(pkg, file, path.join(ROOT, wsDir));
  // Trailing newline so the file matches editor conventions.
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`resolve-monorepo-refs: rewrote ${wsDir}/package.json`);
}

// Workspace packages first — they're file:'d into apps/desktop, so
// their own package.jsons must be valid for npm before npm tries to
// install them transitively.
for (const wsDir of [
  "packages/core",
  "packages/server",
  "packages/ui",
  "packages/trpc-contract",
]) {
  rewrite(wsDir);
}

// Then the desktop app itself.
rewrite("apps/desktop");

console.log("resolve-monorepo-refs: done.");
