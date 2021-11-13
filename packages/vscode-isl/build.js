const { pnpPlugin } = require('@yarnpkg/esbuild-plugin-pnp');
const { build } = require('esbuild');

async function main() {
  const start = new Date().getTime();

  const webBuildPromise = build({
    entryPoints: ['src/react/index.tsx'],
    bundle: true,
    outdir: 'build',
    platform: 'browser',
    target: 'es2019',
    format: 'iife',
    plugins: [pnpPlugin()],
  });
  const extensionBuildPromise = await build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    minifySyntax: true,
    outdir: 'build',
    platform: 'node',
    target: 'es2019',
    format: 'cjs',
    external: ['vscode'],
    plugins: [pnpPlugin()],
  });

  await Promise.all([webBuildPromise, extensionBuildPromise]);
  // eslint-disable-next-line no-console
  console.error(`Bundle finished in ${new Date().getTime() - start}ms.`);
}

main();
