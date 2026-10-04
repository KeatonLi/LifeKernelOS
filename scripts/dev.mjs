if (process.argv.includes('--host') || process.argv.includes('--preview')) {
  process.env.LK_PREVIEW_EXAMPLE ??= '1';
  await import('./preview-desktop.ts');
} else {
  await import('./build-desktop.mjs');
  await import('./dev-desktop.mjs');
}
