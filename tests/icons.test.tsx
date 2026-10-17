import { render } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Icon, ICONS, type IconName } from '../src/viewer/ui';
import { root } from './helpers';

// One icon system: every icon is used, drawn in currentColor on Laravel Schema Viewer's grid, with no colors of its own.
const sources = readdirSync(root('src/viewer'))
    .filter((f) => /\.tsx?$/.test(f) && f !== 'icons.tsx')
    .map((f) => readFileSync(root('src/viewer', f), 'utf8'))
    .join('\n');

describe('icons', () => {
    it('are each used somewhere in the viewer', () => {
        const unused = Object.keys(ICONS).filter((name) => !new RegExp(`['"]${name}['"]`).test(sources));
        expect(unused).toEqual([]);
    });

    it('draw in currentColor on a 16-unit grid, or Laravel’s own grid for search, more and the keyboard', () => {
        for (const name of Object.keys(ICONS) as IconName[]) {
            const { container } = render(<Icon name={name} size={16} />);
            const svg = container.querySelector('svg') as SVGElement;
            const box = svg.getAttribute('viewBox');
            expect(['0 0 16 16', '0 0 24 24', '0 0 20 16']).toContain(box);
            expect(svg.getAttribute(name === 'more' ? 'fill' : 'stroke')).toBe('currentColor');
            expect(svg.getAttribute('aria-hidden')).toBe('true');
            expect(svg.getAttribute('height')).toBe('16');
        }
        expect(render(<Icon name="keyboard" size={16} />).container.querySelector('svg')?.getAttribute('width')).toBe('20');
    });

    it('carry no color literals', () => {
        for (const file of ['icons.tsx', 'ui.tsx', 'SchemaEdge.tsx', 'brand.ts']) {
            const text = readFileSync(root('src/viewer', file), 'utf8');
            const code = file === 'brand.ts' ? text.slice(0, text.indexOf('export const FAVICON_COLORS')) : text;
            expect(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
        }
    });
});
