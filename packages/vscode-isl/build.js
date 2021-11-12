const { readFile } = require('fs/promises');

const { pnpPlugin } = require('@yarnpkg/esbuild-plugin-pnp');
const { build } = require('esbuild');

async function main() {
  const {
    outputFiles: [bundleWebViewContentOutputFile],
  } = await build({
    entryPoints: ['src/react/index.tsx'],
    bundle: true,
    platform: 'browser',
    target: 'es2019',
    format: 'iife',
    write: false,
    plugins: [pnpPlugin()],
  });

  await build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    minifySyntax: true,
    outdir: 'build',
    platform: 'node',
    target: 'es2019',
    format: 'cjs',
    external: ['vscode'],
    plugins: [
      {
        name: 'webview-html-resolve-plugin',
        setup(buildConfig) {
          buildConfig.onResolve({ filter: /virtual-module-webview-content-js/ }, (args) => ({
            path: args.path,
            namespace: 'virtual-path',
          }));

          buildConfig.onLoad(
            { filter: /virtual-module-webview-content-js/, namespace: 'virtual-path' },
            () => ({ contents: bundleWebViewContentOutputFile.text, loader: 'text' })
          );

          buildConfig.onResolve({ filter: /virtual-module-webview-content-css/ }, (args) => ({
            path: args.path,
            namespace: 'virtual-path',
          }));

          buildConfig.onLoad(
            { filter: /virtual-module-webview-content-css/, namespace: 'virtual-path' },
            async () => ({
              contents: await readFile('src/react/index.css'),
              loader: 'text',
            })
          );
        },
      },
      pnpPlugin(),
    ],
  });
}

main();
