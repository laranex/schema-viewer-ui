import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// What React Flow needs from a browser that jsdom lacks.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

class DOMMatrixStub {
    m22: number;
    constructor(transform?: string) {
        const scale = /scale\(([\d.]+)\)/.exec(transform ?? '');
        this.m22 = scale ? Number(scale[1]) : 1;
    }
}
globalThis.DOMMatrixReadOnly ??= DOMMatrixStub as unknown as typeof DOMMatrixReadOnly;

// Without Vitest globals, Testing Library cannot unmount between tests on its own.
afterEach(() => cleanup());
