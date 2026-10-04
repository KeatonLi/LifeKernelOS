import { build } from 'esbuild';
await build({
  entryPoints: [
    'apps/desktop/src/main.ts',
    'apps/desktop/src/preload.ts',
    'apps/desktop/src/worker.ts',
  ],
  outdir: 'dist-desktop',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: false,
  define: { 'import.meta.url': '"file:///unused-bundled-module"' },
});
