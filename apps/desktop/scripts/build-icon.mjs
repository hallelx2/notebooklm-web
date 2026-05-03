// Render apps/desktop/build/icon.svg to a 1024×1024 PNG. electron-builder
// auto-derives icon.icns (macOS) and icon.ico (Windows) from the PNG when
// it's present in the build/ directory; Linux uses the PNG directly.
//
// Run via `bun run build:icon` from apps/desktop. Re-run whenever you edit
// the SVG. The PNG is checked in so a fresh clone packages correctly
// without anyone needing to remember to re-run this.
//
// Why a script and not a build hook: electron-builder doesn't accept SVG
// directly, and we'd rather not re-run sharp on every `bun run build:electron`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, "..", "build");
const svgPath = join(buildDir, "icon.svg");
const pngPath = join(buildDir, "icon.png");

if (!existsSync(svgPath)) {
  console.error(`build-icon: source SVG missing at ${svgPath}`);
  process.exit(1);
}

const svg = readFileSync(svgPath);

await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(pngPath);

console.log(`build-icon: wrote ${pngPath}`);
