import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  html: {
    template: './src/index.html',
  },
  source: {
    entry: {
      index: './src/index.ts',
    },
    assetsInclude: [/\.glb$/, /\.gltf$/],
  },
  output: {
    distPath: {
      root: 'docs',
    },
    assetPrefix: './',
  },
  server: {
    host: '0.0.0.0',
    publicDir: [
      {
        name: 'public',
        copyOnBuild: true,
      },
      {
        name: 'assets',
        copyOnBuild: false,
      },
    ],
  },
});