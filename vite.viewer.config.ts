import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The standalone viewer: one ES module, one stylesheet and its fonts, so Laravel, Python and Node hosts can serve
// dist/viewer as static files without Node at runtime. `npm run dev` serves dev/index.html with a sample snapshot.
export default defineConfig({
    plugins: [react()],
    root: '.',
    base: './',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    server: { open: '/dev/index.html' },
    build: {
        outDir: 'dist/viewer',
        emptyOutDir: true,
        assetsInlineLimit: 0,
        lib: {
            entry: 'src/standalone/main.tsx',
            formats: ['es'],
            fileName: () => 'app.js',
            cssFileName: 'app',
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
    },
});
