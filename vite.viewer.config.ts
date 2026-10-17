import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The standalone viewer: app.js and app.css with fixed names, plus fonts and the lazily loaded ELK layout engine under
// assets/, so Laravel, Python and Node hosts can serve dist/viewer as static files without Node at runtime.
// `npm run dev` serves dev/index.html with the contract fixtures.
export default defineConfig({
    plugins: [react()],
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
