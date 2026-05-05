// Render apps/desktop/build/icon.svg into the three icon files
// electron-builder consumes:
//
//   - icon.png   (1024×1024) — Linux AppImage / .desktop entry,
//                              also used for BrowserWindow({ icon })
//                              at runtime.
//   - icon.ico   (Windows)   — multi-size container (16/24/32/48/64/
//                              128/256). NSIS installer, Explorer
//                              taskbar/tray, "Open with" dialog all
//                              read different sizes from this file.
//   - icon.icns  (macOS)     — multi-size container the .app bundle
//                              advertises via Info.plist. Dock + Finder
//                              + Cmd-Tab pull from here.
//
// Why explicit ICO/ICNS instead of letting electron-builder auto-derive
// from the PNG: the auto-derive path scales a single 1024 PNG down to
// 16/32px with a generic resampler, which produces fuzzy edges in the
// taskbar. Generating each size from sharp's own resizer (and packing
// via png2icons) keeps the small sizes legible.
//
// All three outputs are checked in so a fresh clone packages correctly
// without anyone needing to remember to re-run this. Re-run via
// `bun run build:icon` whenever you edit icon.svg.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import png2icons from "png2icons";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, "..", "build");
const svgPath = join(buildDir, "icon.svg");
const pngPath = join(buildDir, "icon.png");
const icoPath = join(buildDir, "icon.ico");
const icnsPath = join(buildDir, "icon.icns");

if (!existsSync(svgPath)) {
  console.error(`build-icon: source SVG missing at ${svgPath}`);
  process.exit(1);
}

const svg = readFileSync(svgPath);

// Step 1: render the canonical 1024×1024 PNG. Density 384 ≈ 1024/(96/36)
// — empirically the cleanest scaling for a 1024-target SVG with sharp.
const png1024 = await sharp(svg, { density: 384 })
  .resize(1024, 1024, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(pngPath, png1024);
console.log(`build-icon: wrote ${pngPath}`);

// Step 2: pack ICO (Windows). png2icons.createICO accepts a single PNG
// buffer and produces all the standard sub-sizes internally; BICUBIC is
// the highest-quality resampler it ships. The third arg is "0" for
// compression off (ICO viewers historically choke on PNG-compressed
// entries below 256px), and `false` disables alpha-premultiply since
// our SVG already exports straight alpha.
const icoBuf = png2icons.createICO(png1024, png2icons.BICUBIC, 0, false);
if (!icoBuf) {
  console.error("build-icon: png2icons.createICO returned null");
  process.exit(1);
}
writeFileSync(icoPath, icoBuf);
console.log(`build-icon: wrote ${icoPath}`);

// Step 3: pack ICNS (macOS). createICNS uses the same source buffer and
// emits the Apple-blessed size set (16/32/64/128/256/512/1024 plus the
// @2x retina variants).
const icnsBuf = png2icons.createICNS(png1024, png2icons.BICUBIC, 0);
if (!icnsBuf) {
  console.error("build-icon: png2icons.createICNS returned null");
  process.exit(1);
}
writeFileSync(icnsPath, icnsBuf);
console.log(`build-icon: wrote ${icnsPath}`);
