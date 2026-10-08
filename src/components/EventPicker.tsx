'use client';
/**
 * Event picker for announcements. A native <select> cannot colour or animate its
 * options, so this is a small listbox: the event title first, then the date, and
 * the status as a badge at the END of the row — UPCOMING in gold with a slow
 * pulse, PAST muted. Official events carry a star. Keyboard: Enter/Space/ArrowDown
 * open, arrows move, Enter picks, Escape closes; typing in the filter narrows.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { EventOption } from './AnnouncementManager';

export function EventPicker({ options, value, onChange }: { options: EventOption[]; value: string; onChange: (id: string) => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const listId = useId();

    const selected = options.find((o) => o.id === value) ?? null;
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((o) => (o.title ?? o.label).toLowerCase().includes(q)) : options;
    }, [options, query]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => { setActive(0); }, [query, open]);

    const pick = (o: EventOption) => { onChange(o.id); setOpen(false); setQuery(''); };

    const onKey = (e: React.KeyboardEvent) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
        if (!open) return;
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(visible.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (visible[active]) pick(visible[active]); }
    };

    return (
        <div ref={root} className="evpick" onKeyDown={onKey}>
            <button type="button" className="admin-form-input evpick-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
                onClick={() => setOpen((v) => !v)}>
                {selected ? <Row o={selected} /> : <span className="evpick-placeholder">Pick an event…</span>}
                <span className="evpick-caret" aria-hidden="true">▾</span>
            </button>
            {open && (
                <div className="evpick-pop">
                    <input className="admin-form-input evpick-filter" placeholder="Type to filter…" value={query} autoFocus
                        onChange={(e) => setQuery(e.target.value)} aria-label="Filter events" />
                    <ul id={listId} role="listbox" className="evpick-list" aria-activedescendant={visible[active]?.id}>
                        {visible.length === 0 && <li className="evpick-empty">No events match.</li>}
                        {visible.map((o, i) => (
                            <li key={o.id} id={o.id} role="option" aria-selected={o.id === value}
                                className={`evpick-opt${i === active ? ' is-active' : ''}${o.id === value ? ' is-selected' : ''}`}
                                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                                <Row o={o} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function Row({ o }: { o: EventOption }) {
    const upcoming = o.upcoming ?? false;
    return (
        <span className="evpick-row">
            <span className="evpick-title">{o.official ? '★ ' : ''}{o.title ?? o.label}</span>
            {o.date && <span className="evpick-date">{o.date}</span>}
            <span className={`evpick-badge ${upcoming ? 'is-upcoming' : 'is-past'}`}>{upcoming ? 'UPCOMING' : 'PAST'}</span>
        </span>
    );
}
