import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The standalone viewer as one script for the offline HTML export: the same entry as app.js with the lazily loaded ELK
// layout engine inlined, so a page that inlines it needs no other script. Its stylesheet and fonts are app.css's; the
// build writes to dist/offline and scripts/viewer-html.mjs moves offline.js into dist/viewer.
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist/offline',
        emptyOutDir: true,
        assetsInlineLimit: 0,
        modulePreload: false,
        rollupOptions: {
            input: 'src/standalone/main.tsx',
            preserveEntrySignatures: 'exports-only',
            output: {
                entryFileNames: 'offline.js',
                codeSplitting: false,
            },
        },
    },
});
