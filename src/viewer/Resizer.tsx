import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

export const PANEL_MIN = 160;
export const PANEL_MAX = 560;
const STEP = 24;

// A handle on a side panel's inner edge: drag it, or focus it and use the arrow keys, to resize the panel; double-click
// resets it. side says which edge of the canvas the panel is on, so dragging toward the canvas widens it either way.
// width: the panel's current width, read when a drag or key press starts, so it is never a stale render-time value.
export function Resizer({ side, width, label, onResize, onReset }: { side: 'left' | 'right'; width: () => number; label: string; onResize: (width: number) => void; onReset: () => void }) {
    const start = useRef<{ x: number; width: number } | null>(null);
    const clamp = (w: number) => Math.round(Math.max(PANEL_MIN, Math.min(PANEL_MAX, w)));
    const grow = (dx: number) => (side === 'left' ? dx : -dx);

    const down = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width: width() };
    };
    const move = (event: PointerEvent<HTMLDivElement>) => {
        if (start.current) {
            onResize(clamp(start.current.width + grow(event.clientX - start.current.x)));
        }
    };
    // Browsers coalesce pointer moves; the release position is the one that counts.
    const up = (event: PointerEvent<HTMLDivElement>) => {
        move(event);
        start.current = null;
    };
    const key = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : 0;
        if (step) {
            event.preventDefault();
            onResize(clamp(width() + grow(step)));
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            onResize(event.key === 'Home' ? PANEL_MIN : PANEL_MAX);
        }
    };

    return (
        <div
            className={`resizer resizer--${side}`}
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuemin={PANEL_MIN}
            aria-valuemax={PANEL_MAX}
            aria-valuenow={Math.round(width())}
            tabIndex={0}
            title="Drag to resize; double-click to reset"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onDoubleClick={onReset}
            onKeyDown={key}
        />
    );
}
