import Link from 'next/link';
import { jumpSearch, type JumpHit } from '@/lib/jump-search';
import { ArrowUpRight, ChevronRight, Search } from 'lucide-react';
import { AdminHead, adminStyles as a, sentence } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export const metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

/**
 * JUMP results page (Console Phase C3) — the full-page counterpart to the header
 * dropdown, sharing the exact same `jumpSearch`. Reached via the "SEE ALL
 * RESULTS" affordance or a direct /admin/search?q= link. Gated by the console
 * layout's requirePlatformAdmin.
 */
function HitRow({ hit }: { hit: JumpHit }) {
    const inner = (
        <>
            <div className="search-hit-main">
                <div className="search-hit-title">
                    {hit.title}
                    {hit.badge && <span className="admin-pill">{sentence(hit.badge)}</span>}
                </div>
                {hit.subtitle && <div className="search-hit-sub">{hit.subtitle}</div>}
            </div>
            <div className="search-hit-actions">
                {hit.altHref && (
                    <a
                        href={hit.altHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-action-btn muted"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {hit.altLabel ? sentence(hit.altLabel) : 'Alt'} <ArrowUpRight {...ic} />
                    </a>
                )}
                <span className="admin-action-btn" aria-hidden="true">
                    Open {hit.external ? <ArrowUpRight {...ic} /> : <ChevronRight {...ic} />}
                </span>
            </div>
        </>
    );

    return hit.external ? (
        <a href={hit.href} target="_blank" rel="noopener noreferrer" className="search-hit">
            {inner}
        </a>
    ) : (
        <Link href={hit.href} className="search-hit">
            {inner}
        </Link>
    );
}

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const { q } = await searchParams;
    const query = (q ?? '').trim();
    const results = query ? await jumpSearch(query) : null;
    const nonEmpty = (results?.groups ?? []).filter((g) => g.hits.length > 0 || g.error);

    return (
        <>
            <AdminHead
                title="Jump"
                sub={
                    results
                        ? `Universal search. ${results.total} hit${results.total === 1 ? '' : 's'} in ${results.tookMs} ms.`
                        : 'Universal search across the ecosystem.'
                }
            />

            <form className="admin-search" action="/admin/search" role="search">
                <input
                    name="q"
                    defaultValue={query}
                    className="admin-search-input"
                    placeholder="Customers, tickets, orders, products, users, shops, posts, events"
                    aria-label="Search everything"
                    autoFocus
                />
                <button type="submit" className="admin-action-btn">
                    <Search {...ic} /> Search
                </button>
            </form>
            {!query ? (
                <div className="admin-empty">Type a name, handle, email, order or ticket number to search everything at once.</div>
            ) : nonEmpty.length === 0 ? (
                <div className="admin-empty">No matches for “{query}”.</div>
            ) : (
                nonEmpty.map((g) => (
                    <section key={g.key} className={a.stack} aria-label={sentence(g.label)}>
                        <div className={a.group} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {sentence(g.label)}
                            {g.error && <span className="admin-pill warn">Source error</span>}
                        </div>
                        {g.error && <div className="admin-stat-note">{g.error}</div>}
                        <div className="search-hit-list">
                            {g.hits.map((hit) => (
                                <HitRow key={g.key + hit.id} hit={hit} />
                            ))}
                        </div>
                    </section>
                ))
            )}
        </>
    );
}
