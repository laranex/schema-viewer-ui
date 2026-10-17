import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

// The same key as the Python viewer, so a choice carries over between hosts on one origin.
export const THEME_KEY = 'laranex-schema-viewer-theme';

const stored = (): Theme | null => {
    try {
        const value = globalThis.localStorage?.getItem(THEME_KEY);
        return value === 'dark' || value === 'light' ? value : null;
    } catch {
        return null; // Storage may be unavailable.
    }
};

const prefersDark = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

// The theme follows the system until one is chosen; a controlled theme always wins.
export function useTheme(controlled: Theme | undefined, onChange: ((theme: Theme) => void) | undefined, persist: boolean) {
    const [chosen, setChosen] = useState<Theme | null>(() => (persist ? stored() : null));
    const [system, setSystem] = useState<Theme>(() => (prefersDark() ? 'dark' : 'light'));

    useEffect(() => {
        const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
        if (!query) {
            return;
        }
        const listener = () => setSystem(query.matches ? 'dark' : 'light');
        query.addEventListener('change', listener);
        return () => query.removeEventListener('change', listener);
    }, []);

    const theme = controlled ?? chosen ?? system;
    const toggle = useCallback(() => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        if (controlled === undefined) {
            setChosen(next);
        }
        if (persist) {
            try {
                globalThis.localStorage?.setItem(THEME_KEY, next);
            } catch {
                // Storage may be unavailable.
            }
        }
        onChange?.(next);
    }, [theme, controlled, persist, onChange]);

    return { theme, toggle };
}
