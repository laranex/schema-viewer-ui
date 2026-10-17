import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

// Small accessible primitives: a menu button with a popover menu, and tabs. No dependencies.

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
    return (
        <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {PATHS[name]}
        </svg>
    );
}

const PATHS = {
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </>
    ),
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    fit: <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />,
    hand: <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0" />,
    select: <path d="M3 3h4M3 3v4M21 3h-4M21 3v4M3 21h4M3 21v-4M21 21h-4M21 21v-4M9 9h6v6H9z" />,
    relationships: <path d="M4 6h7a3 3 0 0 1 3 3v9M10 14l4 4 4-4" />,
    tables: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18M3 15h18M9 10v10" />
        </>
    ),
    eye: (
        <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    arrange: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <path d="M10 6.5h4a3 3 0 0 1 3 3V14" />
        </>
    ),
    help: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" />
        </>
    ),
    download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
    keyboard: (
        <>
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
        </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
    sun: (
        <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
    ),
    more: (
        <>
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
        </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 5 5L20 7" />,
    warning: <path d="M12 3 2 21h20L12 3zM12 10v4M12 17h.01" />,
    details: (
        <>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h5" />
        </>
    ),
    changes: (
        <>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5M12 7v5l3 2" />
        </>
    ),
    compare: <path d="M8 4v16M16 4v16M3 8h5M16 8h5M3 16h5M16 16h5" />,
    migrations: (
        <>
            <circle cx="6" cy="6" r="2" />
            <circle cx="6" cy="18" r="2" />
            <path d="M6 8v8M12 6h8M12 12h8M12 18h8" />
        </>
    ),
    external: <path d="M14 4h6v6M20 4l-9 9M17 14v6H4V7h6" />,
    focus: (
        <>
            <circle cx="12" cy="12" r="3" />
            <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" />
        </>
    ),
    link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    behind: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </>
    ),
    branch: (
        <>
            <circle cx="6" cy="5" r="2" />
            <circle cx="6" cy="19" r="2" />
            <circle cx="18" cy="7" r="2" />
            <path d="M6 7v10M18 9a6 6 0 0 1-6 6H6" />
        </>
    ),
    circle: <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />,
} as const;

// A long identifier (schema.table.column, a path, a type) wraps after its separators before it is split anywhere else.
export function Ident({ text }: { text: string }) {
    const parts = text.split(/(?<=[._/:,])(?=.)/);
    // One span, so a flex parent sees one item and the accessible name stays one word.
    return <span className="ident">{parts.map((part, i) => (i ? [<wbr key={i} />, part] : part))}</span>;
}

type MenuProps = {
    label: string;
    // What the button shows; the label is its accessible name.
    trigger: ReactNode;
    children: ReactNode;
    placement?: 'above' | 'below';
    align?: 'start' | 'end';
    className?: string;
    title?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

// A button that opens a menu: arrow keys move between items, Escape or a click outside closes it.
export function Menu({ label, trigger, children, placement = 'above', align = 'start', className, title, open: controlled, onOpenChange }: MenuProps) {
    const [own, setOwn] = useState(false);
    const open = controlled ?? own;
    const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setOwn(value));
    const root = useRef<HTMLDivElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const id = useId();

    useEffect(() => {
        if (!open) {
            return;
        }
        const away = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', away);
        return () => document.removeEventListener('pointerdown', away);
    });

    useEffect(() => {
        if (open) {
            menu.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
        }
    }, [open]);

    const keys = (event: KeyboardEvent<HTMLDivElement>) => {
        const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
        const at = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
        } else if (event.key === 'Escape' || event.key === 'Tab') {
            event.stopPropagation();
            setOpen(false);
        }
    };

    return (
        <div ref={root} className={`menu${className ? ` ${className}` : ''}`}>
            <button type="button" className="menu__trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} title={title ?? label} onClick={() => setOpen(!open)}>
                {trigger}
            </button>
            {open && (
                <div ref={menu} id={id} role="menu" aria-label={label} className={`menu__list menu__list--${placement} menu__list--${align}`} onKeyDown={keys} onClick={(e) => (e.target as HTMLElement).closest('[data-closes]') && setOpen(false)}>
                    {children}
                </div>
            )}
        </div>
    );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="menu__label">{children}</div>;
export const MenuSeparator = () => <div className="menu__separator" role="separator" />;

export function MenuCheck({ checked, onChange, children, hint, shortcut }: { checked: boolean; onChange: () => void; children: ReactNode; hint?: ReactNode; shortcut?: string }) {
    return (
        <button type="button" role="menuitemcheckbox" aria-checked={checked} className="menu__item" onClick={onChange}>
            <span className="menu__check">{checked && <Icon name="check" size={14} />}</span>
            <span className="menu__text">
                {children}
                {hint && <small>{hint}</small>}
            </span>
            {shortcut && <kbd>{shortcut}</kbd>}
        </button>
    );
}

export function MenuRadio({ checked, onSelect, children, hint, shortcut }: { checked: boolean; onSelect: () => void; children: ReactNode; hint?: ReactNode; shortcut?: string }) {
    return (
        <button type="button" role="menuitemradio" aria-checked={checked} className="menu__item" onClick={onSelect} data-closes>
            <span className="menu__check">{checked && <Icon name="check" size={14} />}</span>
            <span className="menu__text">
                {children}
                {hint && <small>{hint}</small>}
            </span>
            {shortcut && <kbd>{shortcut}</kbd>}
        </button>
    );
}

export function MenuItem({ onSelect, children, hint, shortcut, disabled }: { onSelect: () => void; children: ReactNode; hint?: ReactNode; shortcut?: string; disabled?: boolean }) {
    return (
        <button type="button" role="menuitem" className="menu__item" onClick={onSelect} disabled={disabled} data-closes>
            <span className="menu__text">
                {children}
                {hint && <small>{hint}</small>}
            </span>
            {shortcut && <kbd>{shortcut}</kbd>}
        </button>
    );
}

// badge: shown after the label, also in the compact row (with its own accessible text).
export type TabSpec<T extends string> = { value: T; label: string; icon?: IconName; count?: number; tone?: 'warning'; badge?: ReactNode };

// A tab list: arrow keys move between tabs, as the ARIA tabs pattern asks. When the labels do not fit on one row, the
// tabs other than the selected one show only their icon (the label stays their accessible name and tooltip); should
// even that not fit, the row scrolls and keeps the selected tab in view.
export function TabList<T extends string>({ tabs, value, onChange, label, className, idPrefix }: { tabs: TabSpec<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string; idPrefix: string }) {
    const row = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);
    // The width the row needs with every label shown, measured while it is shown.
    const natural = useRef(0);
    const signature = tabs.map((t) => `${t.value}:${t.count ?? ''}`).join(' ');
    useLayoutEffect(() => {
        natural.current = 0;
        setCompact(false);
    }, [signature]);
    useLayoutEffect(() => {
        const el = row.current;
        if (!el) {
            return;
        }
        const check = () => {
            if (!compact) {
                natural.current = el.scrollWidth;
            }
            const next = natural.current > el.clientWidth + 1;
            if (next !== compact) {
                setCompact(next);
            }
        };
        check();
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [compact, signature]);
    useEffect(() => {
        row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [value, compact]);

    const keys = (event: KeyboardEvent<HTMLDivElement>) => {
        const at = tabs.findIndex((t) => t.value === value);
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        const edge = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (step || edge >= 0) {
            event.preventDefault();
            const next = edge >= 0 ? tabs[edge] : tabs[(at + step + tabs.length) % tabs.length];
            onChange(next.value);
            (event.currentTarget.querySelector(`#${CSS.escape(`${idPrefix}-tab-${next.value}`)}`) as HTMLElement | null)?.focus();
        }
    };
    return (
        <div ref={row} role="tablist" aria-label={label} className={`${className ?? ''}${compact ? ' tabs--compact' : ''}`} onKeyDown={keys}>
            {tabs.map((t) => (
                <button
                    key={t.value}
                    type="button"
                    role="tab"
                    id={`${idPrefix}-tab-${t.value}`}
                    aria-selected={t.value === value}
                    aria-controls={`${idPrefix}-panel-${t.value}`}
                    tabIndex={t.value === value ? 0 : -1}
                    className="tab"
                    title={compact && t.value !== value ? t.label : undefined}
                    onClick={() => onChange(t.value)}
                >
                    {t.icon && <Icon name={t.icon} size={14} />}
                    <span className="tab__label">{t.label}</span>
                    {t.badge}
                    {t.count !== undefined && t.count > 0 && <span className={`tab__count${t.tone ? ` tab__count--${t.tone}` : ''}`}>{t.count}</span>}
                </button>
            ))}
        </div>
    );
}
