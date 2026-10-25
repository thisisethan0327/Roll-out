'use client';
/**
 * JUMP bar — the universal-search box in the console header (Console Phase C3).
 * Debounced live search against /api/admin/search with a grouped dropdown.
 * Keyboard: `/` focuses from anywhere, ↑/↓ move, Enter opens the highlighted
 * (or first) hit, Esc closes (through the shared overlay stack, so an open
 * dropdown closes before anything under it). Cross-app hits open in a new tab; rollout-native
 * hits navigate in place. Every failure degrades to an empty dropdown.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JumpGroup, JumpHit } from '@/lib/jump-search';
import { ArrowUpRight, ChevronRight } from '@/components/icons';
import { LoaderCircle, Search } from 'lucide-react';
import { sentence } from '@/components/glide-admin/parts';
import { useOverlayLayer } from '@/lib/overlay/stack';

const DEBOUNCE_MS = 220;

/**
 * `glide`: the Glide admin shell's look (search icon, sentence-case copy). The
 * shop console's admin path renders it without, exactly as before.
 */
export function JumpBar({ glide = false }: { glide?: boolean } = {}) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [q, setQ] = useState('');
    const [groups, setGroups] = useState<JumpGroup[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState(0);
    const seq = useRef(0);

    // While the dropdown shows, it is the top overlay layer: Escape closes it
    // (and leaves the field) without reaching a Sheet or dialog underneath.
    const showing = open && q.trim().length >= 2;
    useOverlayLayer(showing, () => {
        setOpen(false);
        inputRef.current?.blur();
    });

    // Flat list of hits in render order — for ↑/↓ + Enter.
    const flat: JumpHit[] = groups.flatMap((g) => g.hits);

    const go = useCallback(
        (hit: JumpHit) => {
            setOpen(false);
            if (hit.external) {
                window.open(hit.href, '_blank', 'noopener,noreferrer');
            } else {
                router.push(hit.href);
            }
        },
        [router],
    );

    const seeAll = useCallback(() => {
        if (!q.trim()) return;
        setOpen(false);
        router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`);
    }, [q, router]);

    // Debounced fetch.
    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) {
            setGroups([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const mine = ++seq.current;
        const h = setTimeout(async () => {
            try {
                const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, {
                    cache: 'no-store',
                });
                if (mine !== seq.current) return; // a newer query superseded this
                if (!res.ok) {
                    setGroups([]);
                    setLoading(false);
                    return;
                }
                const data = await res.json();
                setGroups((data?.groups ?? []).filter((g: JumpGroup) => g.hits.length > 0 || g.error));
                setActive(0);
                setOpen(true);
            } catch {
                if (mine === seq.current) setGroups([]);
            } finally {
                if (mine === seq.current) setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => clearTimeout(h);
    }, [q]);

    // `/` focuses from anywhere outside a text field.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/') return;
            const el = document.activeElement as HTMLElement | null;
            const tag = el?.tagName;
            const typing =
                tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable;
            if (typing) return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Close on outside click.
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // With the dropdown open, the overlay stack handles Escape (above).
        if (e.key === 'Escape' && !showing) {
            inputRef.current?.blur();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (flat.length > 0) go(flat[Math.min(active, flat.length - 1)]);
            else seeAll();
        }
    };

    let idx = -1; // running index across groups to align with `active`

    return (
        <div className="jump" ref={boxRef}>
            <div className="jump-inputwrap">
                {glide ? <Search size={19} strokeWidth={2} aria-hidden="true" /> : null}
                <span className="jump-slash" aria-hidden={glide ? true : undefined}>/</span>
                <input
                    ref={inputRef}
                    className="jump-input"
                    value={q}
                    placeholder={glide ? 'Jump to a customer, ticket, order, shop or user' : 'JUMP — search customers, tickets, orders, shops, users…'}
                    aria-label={glide ? 'Jump: search everything (press / to focus)' : undefined}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => groups.length > 0 && setOpen(true)}
                    onKeyDown={onInputKey}
                    spellCheck={false}
                    autoComplete="off"
                />
                {loading && (
                    <span className="jump-spinner" role={glide ? 'status' : undefined} aria-label={glide ? 'Searching' : undefined}>
                        {glide ? <LoaderCircle className="g-spin" size={18} strokeWidth={2} aria-hidden="true" /> : '…'}
                    </span>
                )}
            </div>

            {showing && (
                <div className="jump-drop">
                    {flat.length === 0 && !loading ? (
                        <div className="jump-empty">{glide ? `No matches for “${q.trim()}”` : `NO MATCHES FOR “${q.trim()}”`}</div>
                    ) : (
                        groups.map((g) => (
                            <div key={g.key} className="jump-group">
                                <div className="jump-group-label">
                                    {glide ? sentence(g.label) : g.label}
                                    {g.error && <span className="jump-group-err">{glide ? 'Source error' : 'SOURCE ERROR'}</span>}
                                </div>
                                {g.hits.map((hit) => {
                                    idx += 1;
                                    const i = idx;
                                    return (
                                        <button
                                            key={g.key + hit.id}
                                            type="button"
                                            className={`jump-hit ${i === active ? 'active' : ''}`}
                                            onMouseEnter={() => setActive(i)}
                                            onClick={() => go(hit)}
                                        >
                                            <span className="jump-hit-main">
                                                <span className="jump-hit-title">{hit.title}</span>
                                                {hit.subtitle && (
                                                    <span className="jump-hit-sub">{hit.subtitle}</span>
                                                )}
                                            </span>
                                            <span className="jump-hit-tags">
                                                {hit.badge && <span className="jump-badge">{glide ? sentence(hit.badge) : hit.badge}</span>}
                                                {hit.external && <span className="jump-ext"><ArrowUpRight /></span>}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                    <button type="button" className="jump-seeall" onClick={seeAll}>
                        {glide ? 'See all results' : 'SEE ALL RESULTS'} <ChevronRight />
                    </button>
                </div>
            )}
        </div>
    );
}
