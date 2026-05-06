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
const workspaceDirs = [
  "apps/desktop",
  "apps/web",
  "packages/core",
  "packages/server",
  "packages/ui",
  "packages/trpc-contract",
];
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

// And apps/web. We're not building it here, but when npm install runs
// in apps/desktop it walks up to the repo root, sees the `workspaces`
// field, and tries to process every member — including apps/web.
// If apps/web's package.json still has workspace:/catalog: refs, npm
// chokes with EUNSUPPORTEDPROTOCOL even though we're not installing
// apps/web's deps.
rewrite("apps/web");

// We deliberately KEEP the `workspaces` field on the root package.json.
// Earlier we tried stripping it as belt-and-braces (so npm wouldn't walk
// workspace members), but on Linux that broke `bun --filter=...
// run build` — `vite build` failed with a bare `error: ENOENT` ~8ms in,
// before vite even started. Symptom only on ubuntu-22.04 / bun 1.2.21;
// macOS handled the same sequence fine. The apps/web rewrite above is
// already enough to make `npm install --omit=dev` succeed inside
// apps/desktop, so the strip wasn't pulling its weight.

// Rewrite any copy of a workspace package that bun may have
// materialised into node_modules. On platforms / bun versions that
// symlink, fs.writeFileSync follows the link to packages/* (which we
// already wrote, so this is a no-op). On platforms where bun COPIES
// the workspace package into node_modules, the copy carries the
// original `workspace:*` / `catalog:` refs and must be patched
// separately or npm will choke when it walks the dep tree.
//
// We touch every plausible location: the hoisted root, and the
// per-app node_modules under apps/desktop (which can also receive
// copies depending on bun's linker mode).
const NODE_MODULE_PARENTS = ["node_modules", "apps/desktop/node_modules"];
const SCOPE = "@notebooklm";
for (const parent of NODE_MODULE_PARENTS) {
  const scopeDir = path.join(ROOT, parent, SCOPE);
  if (!fs.existsSync(scopeDir)) continue;
  for (const name of fs.readdirSync(scopeDir)) {
    const dir = path.join(scopeDir, name);
    // If the entry is a symlink to packages/<name>, skip — writing
    // through it would overwrite the source with relative paths
    // computed from this node_modules location, which point to the
    // wrong place. The source rewrite earlier in this script already
    // covered it.
    let entryStat;
    try {
      entryStat = fs.lstatSync(dir);
    } catch {
      continue;
    }
    if (entryStat.isSymbolicLink()) {
      console.log(
        `resolve-monorepo-refs: ${parent}/${SCOPE}/${name} is a symlink — skipping (source already covered)`,
      );
      continue;
    }
    const pkgFile = path.join(dir, "package.json");
    if (!fs.existsSync(pkgFile)) continue;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    } catch {
      continue;
    }
    resolveCatalog(pkg, pkgFile);
    resolveWorkspace(pkg, pkgFile, dir);
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(
      `resolve-monorepo-refs: patched ${parent}/${SCOPE}/${name}/package.json`,
    );
  }
}

console.log("resolve-monorepo-refs: done.");
