import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The npm library: React, ReactDOM and React Flow stay external; elkjs and its worker source are bundled so
// consumers never need a bundler plugin for the worker.
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist/lib',
        emptyOutDir: true,
        sourcemap: true,
        lib: {
            entry: {
                index: 'src/index.ts',
                contract: 'src/contract/index.ts',
                adapters: 'src/adapters/index.ts',
            },
            formats: ['es'],
            cssFileName: 'styles',
        },
        rollupOptions: {
            external: (id) => /^(react|react-dom|@xyflow\/react)(\/|$)/.test(id),
        },
    },
});
