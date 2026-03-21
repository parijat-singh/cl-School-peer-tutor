// esbuild configuration — bundles 6 Lambda entry points to dist/{group}/index.mjs

import { build } from "esbuild";

const groups = ["auth", "bookings", "schools", "reviews", "misc", "scheduled"];

await build({
  entryPoints: Object.fromEntries(
    groups.map((g) => [`${g}/index`, `src/handlers/${g}/index.ts`])
  ),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  minify: true,
  treeShaking: true,
  sourcemap: true,
  // AWS SDK v3 is available in the Lambda runtime — externalize to reduce bundle size
  external: [
    "@aws-sdk/*",
    "@smithy/*",
    "googleapis",  // ~11MB — include via node_modules in Lambda zip instead
  ],
  banner: {
    // Required for ESM + __dirname compatibility in some packages
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log(`Built ${groups.length} Lambda groups to dist/`);
