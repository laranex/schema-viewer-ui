import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSnapshot } from '../src/standalone/snapshot';

const page = { href: 'https://app.example/schema/index.html', origin: 'https://app.example' };
const respond = (body: unknown, init: { status?: number; url?: string } = {}) => {
    const response = new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: init.url ?? '' });
    return response;
};

describe('fetchSnapshot', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('resolves the URL against the page and fetches it same-origin, bypassing the cache', async () => {
        const fetch = vi.fn(async () => respond({ format: 'x' }, { url: 'https://app.example/schema/snapshot.json' }));
        vi.stubGlobal('fetch', fetch);
        expect(await fetchSnapshot('snapshot.json', page)).toEqual({ ok: true, value: { format: 'x' } });
        expect(fetch).toHaveBeenCalledWith('https://app.example/schema/snapshot.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    });

    it('refuses a URL on another origin without requesting it', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        for (const url of ['https://other.example/snapshot.json', '//other.example/snapshot.json', 'http://app.example/snapshot.json', 'https://app.example:8443/s.json', 'data:application/json,{}']) {
            const result = await fetchSnapshot(url, page);
            expect(result.ok, url).toBe(false);
            expect(!result.ok && result.error, url).toMatch(/another origin/);
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it('refuses a response a redirect took to another origin', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond({}, { url: 'https://other.example/snapshot.json' })));
        expect(await fetchSnapshot('/snapshot.json', page)).toEqual({ ok: false, error: 'The snapshot request was redirected to another origin; the viewer only loads snapshots from its own origin.' });
    });

    it('reports a failed request by status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respond({}, { status: 403 })));
        expect(await fetchSnapshot('/snapshot.json', page)).toEqual({ ok: false, error: 'The snapshot request failed (403).' });
    });

    it('never treats an opaque origin as its own', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const result = await fetchSnapshot('snapshot.json', { href: 'file:///tmp/index.html', origin: 'null' });
        expect(result.ok).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });
});
