import Link from 'next/link';
import { jumpSearch, type JumpHit } from '@/lib/jump-search';

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
                    {hit.badge && <span className="admin-pill" style={{ marginLeft: 8 }}>{hit.badge}</span>}
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
                        {hit.altLabel ?? 'ALT'} ↗
                    </a>
                )}
                <span className="admin-action-btn">{hit.external ? 'OPEN ↗' : 'OPEN ›'}</span>
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
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">JUMP</div>
                    <div className="admin-page-sub">
                        UNIVERSAL SEARCH
                        {results &&
                            ` · ${results.total} HIT${results.total === 1 ? '' : 'S'} · ${results.tookMs}MS`}
                    </div>
                </div>
            </div>

            <form className="admin-search" action="/admin/search">
                <input
                    name="q"
                    defaultValue={query}
                    className="admin-search-input"
                    placeholder="SEARCH CUSTOMERS · TICKETS · ORDERS · PRODUCTS · USERS · SHOPS · POSTS · EVENTS"
                    autoFocus
                />
                <button type="submit" className="admin-action-btn">
                    SEARCH ›
                </button>
            </form>

            {!query ? (
                <div className="admin-empty">TYPE A QUERY TO SEARCH ACROSS THE ECOSYSTEM</div>
            ) : nonEmpty.length === 0 ? (
                <div className="admin-empty">NO MATCHES FOR “{query}”</div>
            ) : (
                nonEmpty.map((g) => (
                    <div key={g.key} style={{ marginBottom: 20 }}>
                        <div className="admin-sidebar-section" style={{ padding: '4px 0' }}>
                            {g.label}
                            {g.error && (
                                <span className="admin-pill warn" style={{ marginLeft: 8 }}>
                                    SOURCE ERROR
                                </span>
                            )}
                        </div>
                        {g.error && <div className="admin-stat-note">{g.error}</div>}
                        <div className="search-hit-list">
                            {g.hits.map((hit) => (
                                <HitRow key={g.key + hit.id} hit={hit} />
                            ))}
                        </div>
                    </div>
                ))
            )}
        </>
    );
}
