// Prints the gzipped size of the built JavaScript and checks it against the 300 KB budget (spec §6.3).
// Usage: node tools/report-size.mjs [outDir]   (default: dist)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 300;
const outDir = process.argv[2] ?? 'dist';
const assetsDir = join(outDir, 'assets');

const files = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
let totalRaw = 0;
let totalGzip = 0;
for (const name of files) {
  const source = readFileSync(join(assetsDir, name));
  const gzip = gzipSync(source, { level: 9 }).length;
  totalRaw += source.length;
  totalGzip += gzip;
  console.log(`  ${name.padEnd(40)} ${kb(source.length).padStart(9)}  gzip ${kb(gzip).padStart(9)}`);
}
console.log(`JS total: ${kb(totalRaw)}, gzipped ${kb(totalGzip)} (budget ${BUDGET_KB} KB gzipped, fonts excluded)`);

if (totalGzip > BUDGET_KB * 1024) {
  console.error(`JS bundle is over the ${BUDGET_KB} KB gzipped budget.`);
  process.exit(1);
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
