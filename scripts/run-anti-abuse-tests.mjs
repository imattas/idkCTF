import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const outdir = ".tmp-tests";
const outfile = `${outdir}/anti-abuse-tests.bundle.mjs`;

await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ["scripts/anti-abuse-tests-entry.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  logLevel: "silent",
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
