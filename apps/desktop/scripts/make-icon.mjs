// Generate the Windows app icon (build-resources/icon.ico) from the shared brand
// mark (@casewright/brand/logo-mark.svg). The .ico is committed so the packaging
// pipeline never needs a rasterizer; re-run `pnpm make-icon` whenever the mark
// changes. Sizes follow the standard Windows icon ladder (16…256).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const repoRoot = join(here, '..', '..', '..');
const svgPath = join(repoRoot, 'packages', 'brand', 'logo-mark.svg');
const outDir = join(here, '..', 'build-resources');
const outFile = join(outDir, 'icon.ico');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const svg = readFileSync(svgPath);

// Render the 48px-viewBox mark at a high density so downscales stay crisp; the
// largest icon (256) renders 1:1 at density 384 (48 * 384/72 = 256).
const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, await pngToIco(pngs));

console.log(`✓ wrote ${outFile} (${SIZES.join(', ')} px)`);
