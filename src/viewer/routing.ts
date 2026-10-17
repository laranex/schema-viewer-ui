import { HEADER_HEIGHT, ROW_HEIGHT } from './graph';

// Orthogonal edge routing, adapted from Laranex Laravel Schema Viewer (MIT), ui/src/routing.ts: out of a column row,
// along a lane in the gap beside the target, into the target row. Labels sit in that gap, moved until they clear cards
// and other labels.

// Space between layout columns. Edges run vertically in these gaps and their labels sit there too.
export const GAP = 240;
export const LABEL_WIDTH = GAP - 28;
const LABEL_HEIGHT = 17;
const LANE_STEP = 8;

// rows: the column rows the card shows, top to bottom. A column not among them meets the card at its header.
export type Box = { id: string; x: number; y: number; width: number; height: number; rows: string[] };

export type RouteRequest = {
    id: string;
    source: string;
    target: string;
    sourceColumn?: string;
    targetColumn?: string;
    labelled: boolean;
};

export type Route = {
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    channelX: number;
    labelX: number;
    labelY: number;
};

export const rowY = (box: Box, column: string | undefined) => {
    const index = column === undefined ? -1 : box.rows.indexOf(column);
    return index < 0 ? box.y + HEADER_HEIGHT / 2 : box.y + HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
};

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function route(boxes: Map<string, Box>, requests: RouteRequest[]): Map<string, Route> {
    type Draft = RouteRequest & { sx: number; sy: number; tx: number; ty: number; gap: number; same: boolean; base: number };
    const drafts: Draft[] = [];

    for (const r of requests) {
        const s = boxes.get(r.source);
        const t = boxes.get(r.target);
        if (!s || !t) {
            continue;
        }
        const sy = rowY(s, r.sourceColumn);
        const ty = rowY(t, r.targetColumn);
        const sc = s.x + s.width / 2;
        const tc = t.x + t.width / 2;
        const same = r.source === r.target || Math.abs(sc - tc) < (s.width + t.width) / 2 - 20;

        if (same) {
            const right = Math.max(s.x + s.width, t.x + t.width);
            drafts.push({ ...r, sx: s.x + s.width, sy, tx: t.x + t.width, ty, same, gap: right + GAP / 2, base: right + 28 });
        } else if (sc < tc) {
            drafts.push({ ...r, sx: s.x + s.width, sy, tx: t.x, ty, same, gap: t.x - GAP / 2, base: t.x - GAP / 2 });
        } else {
            drafts.push({ ...r, sx: s.x, sy, tx: t.x + t.width, ty, same, gap: t.x + t.width + GAP / 2, base: t.x + t.width + GAP / 2 });
        }
    }

    // Edges sharing a gap get their own lanes, ordered top to bottom, so vertical runs never sit on each other. Loops
    // between cards in one column get lanes just right of the cards, shorter loops inside longer ones.
    const lanes = new Map<string, Draft[]>();
    for (const d of drafts) {
        const key = `${d.same ? 'loop' : 'gap'}:${Math.round((d.same ? d.base : d.gap) / 10)}`;
        const group = lanes.get(key);
        if (group) {
            group.push(d);
        } else {
            lanes.set(key, [d]);
        }
    }
    const offsets = new Map<string, number>();
    const limit = GAP / 2 - 20;
    for (const group of lanes.values()) {
        if (group[0].same) {
            group.sort((a, b) => Math.abs(a.ty - a.sy) - Math.abs(b.ty - b.sy));
            group.forEach((d, i) => offsets.set(d.id, Math.min(limit, i * LANE_STEP)));
            continue;
        }
        group.sort((a, b) => (a.sy + a.ty) / 2 - (b.sy + b.ty) / 2);
        group.forEach((d, i) => offsets.set(d.id, Math.max(-limit, Math.min(limit, (i - (group.length - 1) / 2) * LANE_STEP))));
    }

    const cards = [...boxes.values()].map((b) => ({ x: b.x - 6, y: b.y - 6, w: b.width + 12, h: b.height + 12 }));
    const placed: Rect[] = [];
    const routes = new Map<string, Route>();
    // Labels of shorter vertical runs first: they have the least room to move.
    const order = [...drafts].sort((a, b) => Math.abs(a.ty - a.sy) - Math.abs(b.ty - b.sy));

    for (const d of order) {
        const channelX = (d.same ? d.base : d.gap) + (offsets.get(d.id) ?? 0);
        let labelY = (d.sy + d.ty) / 2;
        if (d.labelled) {
            const top = Math.min(d.sy, d.ty);
            const bottom = Math.max(d.sy, d.ty);
            const steps = [0];
            for (let step = 1; step <= 24; step++) {
                steps.push(step * (LABEL_HEIGHT + 4), -step * (LABEL_HEIGHT + 4));
            }
            const fits = (y: number) => {
                const box = { x: d.gap - LABEL_WIDTH / 2, y: y - LABEL_HEIGHT / 2, w: LABEL_WIDTH, h: LABEL_HEIGHT };
                return !cards.some((c) => overlaps(box, c)) && !placed.some((p) => overlaps(box, p));
            };
            // Stay on the vertical run when it is long enough, otherwise move freely along the gap.
            const candidates = steps.map((c) => labelY + c);
            const onRun = candidates.filter((y) => bottom - top < LABEL_HEIGHT * 2 || (y >= top && y <= bottom));
            labelY = onRun.find(fits) ?? candidates.find(fits) ?? labelY;
            placed.push({ x: d.gap - LABEL_WIDTH / 2, y: labelY - LABEL_HEIGHT / 2, w: LABEL_WIDTH, h: LABEL_HEIGHT });
        }
        routes.set(d.id, { sx: d.sx, sy: d.sy, tx: d.tx, ty: d.ty, channelX, labelX: d.gap, labelY });
    }
    return routes;
}

// An orthogonal path with rounded corners: across to the lane, along it, across to the target.
export function orthogonal(sx: number, sy: number, cx: number, tx: number, ty: number): string {
    const dy = ty - sy;
    const r = Math.min(10, Math.abs(dy) / 2, Math.abs(cx - sx), Math.abs(tx - cx));
    if (r < 1) {
        return `M ${sx} ${sy} L ${cx} ${sy} L ${cx} ${ty} L ${tx} ${ty}`;
    }
    const dirA = Math.sign(cx - sx) || 1;
    const dirB = Math.sign(tx - cx) || 1;
    const dirY = Math.sign(dy);
    return [`M ${sx} ${sy}`, `L ${cx - dirA * r} ${sy}`, `Q ${cx} ${sy} ${cx} ${sy + dirY * r}`, `L ${cx} ${ty - dirY * r}`, `Q ${cx} ${ty} ${cx + dirB * r} ${ty}`, `L ${tx} ${ty}`].join(' ');
}
