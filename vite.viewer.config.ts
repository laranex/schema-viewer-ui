import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { ico, png } from './scripts/ico';
import { FAVICON_SVG, faviconPixels } from './src/viewer/brand';

// favicon.svg and favicon.ico (16 and 32 pixels) from the brand mark in src/viewer/brand.ts, the same bytes every build.
const favicon = (): Plugin => ({
    name: 'laranex-favicon',
    apply: 'build',
    generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: FAVICON_SVG });
        this.emitFile({ type: 'asset', fileName: 'favicon.ico', source: ico([16, 32].map((size) => ({ size, png: png(faviconPixels(size), size) }))) });
    },
});

// The standalone viewer: app.js and app.css with fixed names, plus fonts and the lazily loaded ELK layout engine under
// assets/, so Laravel, Python and Node hosts can serve dist/viewer as static files without Node at runtime.
// `npm run dev` serves dev/index.html with the contract fixtures. The build also writes the favicon.
export default defineConfig({
    plugins: [react(), favicon()],
    base: './',
    server: { port: 5181, strictPort: true },
    build: {
        outDir: 'dist/viewer',
        emptyOutDir: true,
        assetsInlineLimit: 0,
        modulePreload: false,
        rollupOptions: {
            input: 'src/standalone/main.tsx',
            preserveEntrySignatures: 'exports-only',
            output: {
                entryFileNames: 'app.js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: (asset) => (asset.names.some((name) => name.endsWith('.css')) ? 'app.css' : 'assets/[name]-[hash][extname]'),
            },
        },
    },
});
