import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    // contract/scan.mjs imports the built contract module; tests run it on the sources instead, so they need no build.
    resolve: { alias: [{ find: /^\.\.\/dist\/lib\/contract\.js$/, replacement: fileURLToPath(new URL('src/contract/index.ts', import.meta.url)) }] },
    test: {
        include: ['tests/**/*.test.{ts,tsx}'],
        environment: 'jsdom',
        setupFiles: ['tests/setup.ts'],
    },
});
