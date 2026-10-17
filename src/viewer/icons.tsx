import type { ReactNode } from 'react';

// One icon system for the whole viewer. The icons and their shapes come from Laranex Laravel Schema Viewer (MIT, see
// NOTICE): a 16-unit grid, 1.6 strokes in currentColor, round caps and joins, Laravel's viewBox kept where it differs.
// Icons Laravel has no counterpart for (select, details, changes, compare, migrations, behind, branch, circle) are drawn
// in the same style. Colors always come from the control's tokens, never from the icon.
type IconSpec = { body: ReactNode; box?: [number, number]; strokeWidth?: number; fill?: boolean };

export const ICONS = {
    search: {
        box: [24, 24],
        strokeWidth: 1.8,
        body: (
            <>
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16 L20.5 20.5" />
            </>
        ),
    },
    minus: { body: <path d="M3 8 H13" /> },
    plus: { body: <path d="M8 3 V13 M3 8 H13" /> },
    fit: { body: <path d="M2.5 6 V2.5 H6 M10 2.5 H13.5 V6 M13.5 10 V13.5 H10 M6 13.5 H2.5 V10" /> },
    hand: {
        body: <path d="M5.5 8.5 V4 a1 1 0 0 1 2 0 V7.5 M7.5 7.5 V2.8 a1 1 0 0 1 2 0 V7.5 M9.5 7.5 V3.8 a1 1 0 0 1 2 0 V8.5 M11.5 8.5 V6 a1 1 0 0 1 2 0 V10 a4.5 4.5 0 0 1 -4.5 4.5 H8.6 a4 4 0 0 1 -3.1 -1.5 L2.7 9.6 a1.1 1.1 0 0 1 1.7 -1.4 L5.5 9.7" />,
    },
    select: { body: <path d="M2.5 5 V2.5 H5 M7.5 2.5 H8.5 M11 2.5 H13.5 V5 M2.5 7.5 V8.5 M2.5 11 V13.5 H5 M8.5 8.5 L14 10.3 L11.6 11.6 L10.3 14 Z" /> },
    relationships: { body: <path d="M2 4.5 H6.5 V11.5 H14 M11.5 9 L14 11.5 L11.5 14" /> },
    tables: { body: <path d="M2.5 3 H13.5 V13 H2.5 Z M2.5 6.3 H13.5 M2.5 9.6 H13.5 M6.5 6.3 V13" /> },
    eye: { body: <path d="M1.5 8 C3.5 4.5 5.6 3.2 8 3.2 C10.4 3.2 12.5 4.5 14.5 8 C12.5 11.5 10.4 12.8 8 12.8 C5.6 12.8 3.5 11.5 1.5 8 Z M8 6 A2 2 0 1 1 7.99 6 Z" /> },
    help: { body: <path d="M5.3 5.4 a2.7 2.7 0 1 1 3.9 2.4 c-0.75 0.38 -1.2 0.95 -1.2 1.8 V10.4 M8 13.3 V13.4" /> },
    download: { body: <path d="M8 2.5 V10 M4.5 6.5 L8 10 L11.5 6.5 M2.5 13.5 H13.5" /> },
    keyboard: {
        box: [20, 16],
        body: (
            <>
                <rect x="1.5" y="2" width="17" height="12" rx="2" />
                <path d="M5 6 H5.5 M8 6 H8.5 M11.5 6 H12 M14.5 6 H15 M5 9 H5.5 M14.5 9 H15 M7.5 11.5 H12.5" />
            </>
        ),
    },
    moon: { body: <path d="M13.5 9.5 A5.5 5.5 0 1 1 6.5 2.5 A4.5 4.5 0 0 0 13.5 9.5 Z" /> },
    sun: { body: <path d="M8 5 a3 3 0 1 0 0.01 0 Z M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M3.4 12.6 L4.5 11.5 M11.5 4.5 L12.6 3.4" /> },
    more: {
        box: [24, 24],
        fill: true,
        body: (
            <>
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
            </>
        ),
    },
    close: { body: <path d="M4 4 L12 12 M12 4 L4 12" /> },
    chevron: { body: <path d="M4 6 L8 10 L12 6" /> },
    check: { body: <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" /> },
    warning: { body: <path d="M8 2 L14.5 13.5 H1.5 Z M8 6.5 V9.5 M8 11.6 V11.7" /> },
    external: { body: <path d="M9.5 2.5 H13.5 V6.5 M13.5 2.5 L7.5 8.5 M11.5 9.5 V13.5 H2.5 V4.5 H6.5" /> },
    note: { body: <path d="M3.5 2.5 H10 L12.5 5 V13.5 H3.5 Z M6 7 H10 M6 9.5 H10 M6 12 H8.5" /> },
    details: {
        body: (
            <>
                <circle cx="8" cy="8" r="6" />
                <path d="M8 7.3 V11 M8 5 V5.1" />
            </>
        ),
    },
    changes: { body: <path d="M2.8 8 A5.2 5.2 0 1 0 4.3 4.3 M2.5 2.5 V4.9 H4.9 M8 5.2 V8 L10 9.4" /> },
    compare: { body: <path d="M2.5 2.5 H6.5 V13.5 H2.5 Z M9.5 2.5 H13.5 V13.5 H9.5 Z M3.7 8 H5.3 M10.7 8 H12.3 M11.5 7.2 V8.8" /> },
    migrations: {
        body: (
            <>
                <circle cx="4.5" cy="3.5" r="1.5" />
                <circle cx="4.5" cy="8" r="1.5" />
                <circle cx="4.5" cy="12.5" r="1.5" />
                <path d="M4.5 5 V6.5 M4.5 9.5 V11 M8 3.5 H13.5 M8 8 H13.5 M8 12.5 H13.5" />
            </>
        ),
    },
    behind: {
        body: (
            <>
                <circle cx="8" cy="8" r="5.8" />
                <path d="M8 4.8 V8 L10.2 9.4" />
            </>
        ),
    },
    branch: {
        body: (
            <>
                <circle cx="4.5" cy="3.5" r="1.5" />
                <circle cx="4.5" cy="12.5" r="1.5" />
                <circle cx="11.5" cy="4.5" r="1.5" />
                <path d="M4.5 5 V11 M11.5 6 a4.5 4.5 0 0 1 -4.5 4.5 H4.5" />
            </>
        ),
    },
    circle: { body: <circle cx="8" cy="8" r="5.5" strokeDasharray="2.2 2.2" /> },
} satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICONS;

// size is the height; an icon on a wider grid (the keyboard) is as much wider.
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
    const spec: IconSpec = ICONS[name];
    const [w, h] = spec.box ?? [16, 16];
    return (
        <svg
            className="icon"
            width={(size * w) / h}
            height={size}
            viewBox={`0 0 ${w} ${h}`}
            fill={spec.fill ? 'currentColor' : 'none'}
            stroke={spec.fill ? 'none' : 'currentColor'}
            strokeWidth={spec.strokeWidth ?? 1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {spec.body}
        </svg>
    );
}
