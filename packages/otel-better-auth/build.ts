import { stat } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { build } from "esbuild";

const MINIFY = true;
const SOURCEMAP = true;

const MAX_SIZE = 50_000; // 50KB max for instrumentation package

type ExternalPluginFactory = (external: string[]) => Plugin;
const externalCjsToEsmPlugin: ExternalPluginFactory = (external) => ({
  name: "external",
  setup(builder): void {
    const escape = (text: string): string =>
      `^${text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`;
    const filter = new RegExp(external.map(escape).join("|"));
    builder.onResolve({ filter: /.*/, namespace: "external" }, (args) => ({
      path: args.path,
      external: true,
    }));
    builder.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "external",
    }));
    builder.onLoad({ filter: /.*/, namespace: "external" }, (args) => ({
      contents: `export * from ${JSON.stringify(args.path)}`,
    }));
  },
});

/** Adds support for require, __filename, and __dirname to ESM / Node. */
const esmNodeSupportBanner = {
  js: `import { fileURLToPath } from 'url';
import { createRequire as topLevelCreateRequire } from 'module';
import _nPath from 'path'
const require = topLevelCreateRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = _nPath.dirname(__filename);`,
};

const peerDependencies = ["@opentelemetry/api", "better-auth"];

async function buildAll(): Promise<void> {
  await build({
    platform: "node",
    format: "esm",
    splitting: false,
    entryPoints: ["src/index.ts"],
    outdir: "dist",
    bundle: true,
    minify: MINIFY,
    sourcemap: SOURCEMAP,
    banner: esmNodeSupportBanner,
    external: peerDependencies,
    plugins: [externalCjsToEsmPlugin(peerDependencies)],
  });

  // Check max size.
  const outputFile = "dist/index.js";
  const s = await stat(outputFile);
  if (s.size > MAX_SIZE) {
    // eslint-disable-next-line no-console
    console.error(
      `${outputFile}: the size of ${s.size} is over the maximum allowed size of ${MAX_SIZE}`,
    );
    process.exit(1);
  }
}

void buildAll();
