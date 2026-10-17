import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

// Small accessible primitives: a menu button with a popover menu, and tabs. No dependencies.

export { Icon, ICONS, type IconName } from './icons';

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
