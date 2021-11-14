/* eslint-disable no-console */

const { pnpPlugin } = require('@yarnpkg/esbuild-plugin-pnp');
const { build } = require('esbuild');

async function watchBuildWeb() {
  await build({
    entryPoints: ['src/react/index.tsx'],
    bundle: true,
    outdir: 'build',
    platform: 'browser',
    target: 'es2019',
    format: 'iife',
    plugins: [pnpPlugin()],
    watch: {
      onRebuild(error) {
        if (error) {
          console.error('watch build failed:', error);
        } else {
          process.stderr.write(`\rRebuild succeeded at ${new Date().toLocaleString()}.`);
        }
      },
    },
  });
}

async function buildBoth() {
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
  console.error(`Bundle finished in ${new Date().getTime() - start}ms.`);
}

process.argv.includes('--watch-web') ? watchBuildWeb() : buildBoth();
