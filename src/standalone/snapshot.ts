// Fetches the snapshot a host names in data-snapshot-url (or src). Only the page's own origin is read: the URL is
// resolved against the page, a URL on another origin is refused before any request, and a response that a redirect
// took to another origin is not used. The request sends cookies only to the same origin and bypasses the HTTP cache,
// since a snapshot describes a private schema.

export type SnapshotResponse = { ok: true; value: unknown } | { ok: false; error: string };

export async function fetchSnapshot(url: string, page: Pick<Location, 'href' | 'origin'> = window.location): Promise<SnapshotResponse> {
    let target: URL;
    try {
        target = new URL(url, page.href);
    } catch {
        return { ok: false, error: 'The snapshot URL is not a valid URL.' };
    }
    const sameOrigin = (u: URL) => u.origin !== 'null' && u.origin === page.origin;
    if (!sameOrigin(target)) {
        return { ok: false, error: `The snapshot URL is on another origin (${target.origin}); the viewer only loads snapshots from ${page.origin}.` };
    }
    const response = await fetch(target.href, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (response.url && !sameOrigin(new URL(response.url))) {
        return { ok: false, error: 'The snapshot request was redirected to another origin; the viewer only loads snapshots from its own origin.' };
    }
    if (!response.ok) {
        return { ok: false, error: `The snapshot request failed (${response.status}).` };
    }
    return { ok: true, value: await response.json() };
}
