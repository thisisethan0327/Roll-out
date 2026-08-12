/**
 * /post/[id] — read-only post page.
 *
 * Renders public, non-deleted posts only; everything else 404s. Shows the body
 * (with @mentions linkified → /u/<handle>), media, author, any linked event,
 * tagged store products (P2 §3.3), and — for reposts (P2 §3.1) — the original
 * it points at (plain: "↻ reposted by" header + original card; quote: the
 * reposter's body above an embedded original card; deleted/hidden original: an
 * "unavailable" shell). Engagement itself lives in the app.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchProductsByIds, formatMoney, type MedusaProduct } from '@/lib/medusa';

type Author = {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
} | null;

type PostRow = {
    id: string;
    type: string | null;
    body: string | null;
    hero_image_url: string | null;
    media_urls: string[] | null;
    tags: string[] | null;
    visibility: string | null;
    deleted_at: string | null;
    like_count: number | null;
    comment_count: number | null;
    repost_count: number | null;
    repost_of: string | null;
    created_at: string | null;
    linked_event_id: string | null;
    author: Author;
    linked_event: {
        id: string;
        title: string | null;
        code: string | null;
        start_at: string | null;
        location_name: string | null;
        visibility: string | null;
        cancelled_at: string | null;
    } | null;
};

type OriginalPost = {
    id: string;
    body: string | null;
    hero_image_url: string | null;
    media_urls: string[] | null;
    created_at: string | null;
    author: Author;
};

/** A repost target that exists in the DB but can no longer be shown. */
const UNAVAILABLE = 'unavailable' as const;

type ProductTag = { id: string; product: MedusaProduct | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_SELECT = `id, type, body, hero_image_url, media_urls, tags, visibility, deleted_at,
             like_count, comment_count, repost_count, repost_of, created_at, linked_event_id,
             author:profiles!posts_author_id_fkey(handle, display_name, avatar_url, is_verified),
             linked_event:events!posts_linked_event_id_fkey(id, title, code, start_at, location_name, visibility, cancelled_at)`;

async function loadPost(id: string): Promise<PostRow | null> {
    if (!UUID_RE.test(id)) return null;
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle();

    const post = data as PostRow | null;
    if (!post || post.deleted_at || post.visibility !== 'public') return null;
    return post;
}

/**
 * Load the post a repost points at. Returns null when there's nothing to load,
 * the sentinel UNAVAILABLE when the original exists but is deleted or no longer
 * public (render an IG-style shell), or the trimmed original otherwise.
 */
async function loadOriginal(
    repostOf: string | null,
): Promise<OriginalPost | typeof UNAVAILABLE | null> {
    if (!repostOf || !UUID_RE.test(repostOf)) return null;
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from('posts')
        .select(
            `id, body, hero_image_url, media_urls, visibility, deleted_at, created_at,
             author:profiles!posts_author_id_fkey(handle, display_name, avatar_url, is_verified)`,
        )
        .eq('id', repostOf)
        .maybeSingle();

    const orig = data as (OriginalPost & { deleted_at: string | null; visibility: string | null }) | null;
    if (!orig) return UNAVAILABLE;
    if (orig.deleted_at || orig.visibility !== 'public') return UNAVAILABLE;
    return {
        id: orig.id,
        body: orig.body,
        hero_image_url: orig.hero_image_url,
        media_urls: orig.media_urls,
        created_at: orig.created_at,
        author: orig.author,
    };
}

/** Tagged store products (≤5). Preserves tag order; missing/deleted products
 *  come back as { product: null } so the caller can shell them. */
async function loadProductTags(postId: string): Promise<ProductTag[]> {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from('post_product_tags')
        .select('medusa_product_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(5);

    const ids = ((data as any[]) ?? []).map((r) => r.medusa_product_id as string).filter(Boolean);
    if (ids.length === 0) return [];

    const products = await fetchProductsByIds(ids);
    const byId = new Map(products.map((p) => [p.id, p]));
    // De-dupe while preserving first-seen order.
    const seen = new Set<string>();
    const tags: ProductTag[] = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        tags.push({ id, product: byId.get(id) ?? null });
    }
    return tags;
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function initials(name: string | null | undefined, handle: string | null | undefined): string {
    const src = (name?.trim() || handle || '·').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/Los_Angeles',
        });
    } catch {
        return '';
    }
}

/** Split a body into text + @mention links (→ /u/<handle>). Renames break the
 *  link at render (handle-based), same as the app / IG. Hashtags (#) are left
 *  untouched. */
function linkifyMentions(text: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /@([a-z0-9_.-]+)/gi;
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const handle = m[1];
        out.push(
            <Link key={`m${key++}`} href={`/u/${handle}`} className="accent" style={{ textDecoration: 'none' }}>
                @{handle}
            </Link>,
        );
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const post = await loadPost(id);
    if (!post) return { title: 'Post not found' };

    const author = post.author?.display_name || post.author?.handle || 'Rollout member';
    const title = `${truncate(post.body, 60) || `${post.type ?? 'Post'} by ${author}`} · Rollout`;
    const desc = truncate(post.body, 160) || `A ${(post.type ?? 'post').toLowerCase()} on Rollout.`;
    const images = post.hero_image_url ? [post.hero_image_url] : ['/images/og-rollout.jpg'];
    return {
        title,
        description: desc,
        openGraph: { title, description: desc, images, type: 'article' },
        twitter: { card: 'summary_large_image', title, description: desc, images },
    };
}

export default async function PostPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const post = await loadPost(id);
    if (!post) notFound();

    const authorHandle = post.author?.handle ?? '';
    const authorName = post.author?.display_name || authorHandle || 'Member';
    const media = (post.media_urls ?? []).filter(Boolean);
    const ev = post.linked_event;
    const eventLive = ev && ev.visibility === 'public';

    // Repost hydration (§3.1). A plain repost has an empty body; a quote repost
    // carries the reposter's text above the embedded original.
    const isRepost = !!post.repost_of;
    const original = isRepost ? await loadOriginal(post.repost_of) : null;
    const bodyText = post.body ?? '';
    const isPlainRepost = isRepost && bodyText.trim().length === 0;

    const productTags = await loadProductTags(post.id);

    return (
        <>
            {/* HEADER */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
                <div className="container container-narrow" style={{ padding: '40px 0 28px' }}>
                    <div className="mono-row" style={{ fontSize: 10, marginBottom: 14 }}>
                        <span className="accent">{isRepost ? '↻ REPOST' : (post.type ?? 'POST').toUpperCase()}</span>
                        {post.created_at ? (
                            <>
                                <span className="sep" />
                                <span>{fmtDate(post.created_at)}</span>
                            </>
                        ) : null}
                    </div>

                    {authorHandle ? (
                        <Link
                            href={`/u/${authorHandle}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
                        >
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    border: '1px solid var(--gold)',
                                    background: post.author?.avatar_url
                                        ? `url(${post.author.avatar_url}) center/cover no-repeat`
                                        : 'var(--bg-3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: 'var(--font-display)',
                                    fontWeight: 700,
                                    fontSize: 13,
                                    color: 'var(--gold)',
                                    flexShrink: 0,
                                }}
                            >
                                {!post.author?.avatar_url && initials(authorName, authorHandle)}
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text)', letterSpacing: 0.5 }}>
                                    {authorName}
                                    {post.author?.is_verified ? <span className="accent"> ✓</span> : null}
                                </div>
                                <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>
                                    {isPlainRepost ? `↻ reposted · @${authorHandle}` : `@${authorHandle}`}
                                </div>
                            </div>
                        </Link>
                    ) : (
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text)' }}>{authorName}</div>
                    )}
                </div>
            </section>

            {/* HERO IMAGE (own media — absent on a plain repost) */}
            {post.hero_image_url ? (
                <section style={{ borderBottom: '1px solid var(--line)' }}>
                    <div className="container container-narrow" style={{ padding: '24px 0 0' }}>
                        <div
                            className="corner-wrap"
                            style={{
                                position: 'relative',
                                width: '100%',
                                aspectRatio: '16 / 9',
                                background: `url(${post.hero_image_url}) center/cover no-repeat`,
                                border: '1px solid var(--line)',
                            }}
                        >
                            <span className="corner-bottom-left" />
                            <span className="corner-bottom-right" />
                        </div>
                    </div>
                </section>
            ) : null}

            {/* BODY */}
            <section className="section" style={{ padding: '32px 0 48px' }}>
                <div className="container container-narrow">
                    {isPlainRepost ? null : bodyText ? (
                        <p style={{ color: 'var(--text)', fontSize: 17, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>
                            {linkifyMentions(bodyText)}
                        </p>
                    ) : (
                        <p className="text-dim" style={{ fontSize: 16 }}>No caption.</p>
                    )}

                    {/* EMBEDDED ORIGINAL (plain + quote reposts) */}
                    {isRepost ? (
                        <div style={{ marginTop: isPlainRepost ? 0 : 24 }}>
                            <OriginalCard original={original} />
                        </div>
                    ) : null}

                    {/* MEDIA GRID (own media) */}
                    {media.length > 0 ? (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 12,
                                marginTop: 24,
                            }}
                        >
                            {media.map((url, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '4 / 3',
                                        background: `url(${url}) center/cover no-repeat`,
                                        border: '1px solid var(--line)',
                                    }}
                                />
                            ))}
                        </div>
                    ) : null}

                    {/* TAGGED PRODUCTS (§3.3) */}
                    <ProductTagsSheet tags={productTags} />

                    {/* TAGS */}
                    {post.tags && post.tags.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 24 }}>
                            {post.tags.slice(0, 10).map((t) => (
                                <span
                                    key={t}
                                    style={{
                                        padding: '4px 10px',
                                        border: '1px solid var(--line-mid)',
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 10,
                                        letterSpacing: 'var(--track-wider)',
                                        color: 'var(--text-2)',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {t}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    {/* ENGAGEMENT (read-only) */}
                    <div className="mono-row" style={{ fontSize: 11, marginTop: 28 }}>
                        <span><span className="accent">♥</span> {post.like_count ?? 0}</span>
                        <span className="sep" />
                        <span><span className="accent">✎</span> {post.comment_count ?? 0}</span>
                        <span className="sep" />
                        <span><span className="accent">↻</span> {post.repost_count ?? 0}</span>
                    </div>
                </div>
            </section>

            {/* LINKED EVENT */}
            {eventLive ? (
                <section className="section" style={{ padding: '0 0 56px' }}>
                    <div className="container container-narrow">
                        <div className="eyebrow eyebrow-gold mb-4">／ LINKED MEET</div>
                        <Link href={`/event/${ev!.id}`} style={{ textDecoration: 'none' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 16,
                                    padding: '20px 24px',
                                    background: 'var(--bg-2)',
                                    border: '1px solid var(--line)',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div className="mono-row" style={{ fontSize: 10 }}>
                                        <span className="accent">{ev!.code ?? 'MEET'}</span>
                                        {ev!.cancelled_at ? (
                                            <>
                                                <span className="sep" />
                                                <span style={{ color: '#ff8f8f' }}>CANCELLED</span>
                                            </>
                                        ) : null}
                                    </div>
                                    <h3 style={{ fontSize: 17, margin: '6px 0 0', color: 'var(--text)', letterSpacing: 0.8 }}>
                                        {(ev!.title ?? 'Untitled meet').toUpperCase()}
                                    </h3>
                                    {ev!.location_name ? (
                                        <div className="text-dim" style={{ fontSize: 13, marginTop: 4 }}>{ev!.location_name}</div>
                                    ) : null}
                                </div>
                                <span className="accent" style={{ fontSize: 18 }}>→</span>
                            </div>
                        </Link>
                    </div>
                </section>
            ) : null}
        </>
    );
}

/** Embedded card for the post a repost points at. Renders an "unavailable"
 *  shell for deleted/hidden originals (never cascades). */
function OriginalCard({ original }: { original: OriginalPost | typeof UNAVAILABLE | null }) {
    if (!original || original === UNAVAILABLE) {
        return (
            <div
                style={{
                    padding: '18px 20px',
                    border: '1px dashed var(--line-mid)',
                    background: 'var(--bg-2)',
                    color: 'var(--text-2)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    letterSpacing: 'var(--track-wider)',
                }}
            >
                ↻ ORIGINAL POST UNAVAILABLE
            </div>
        );
    }

    const handle = original.author?.handle ?? '';
    const name = original.author?.display_name || handle || 'Member';
    const thumb = original.hero_image_url || (original.media_urls ?? []).filter(Boolean)[0] || null;

    return (
        <Link href={`/post/${original.id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div
                style={{
                    display: 'flex',
                    gap: 14,
                    padding: 16,
                    border: '1px solid var(--line-mid)',
                    background: 'var(--bg-2)',
                    alignItems: 'flex-start',
                }}
            >
                {thumb ? (
                    <div
                        style={{
                            width: 84,
                            height: 84,
                            flexShrink: 0,
                            background: `url(${thumb}) center/cover no-repeat`,
                            border: '1px solid var(--line)',
                        }}
                    />
                ) : null}
                <div style={{ minWidth: 0 }}>
                    <div className="mono-row" style={{ fontSize: 10, marginBottom: 6 }}>
                        <span className="accent">{name.toUpperCase()}</span>
                        {handle ? (
                            <>
                                <span className="sep" />
                                <span>@{handle}</span>
                            </>
                        ) : null}
                    </div>
                    <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {original.body ? linkifyMentions(truncate(original.body, 280)) : <span className="text-dim">No caption.</span>}
                    </div>
                </div>
            </div>
        </Link>
    );
}

/** IG-style "View products" disclosure for tagged store products. Uses a native
 *  <details> element so it needs no client JS. Paused products link to the PDP
 *  but flag COMING SOON; missing/deleted products render a quiet shell. */
function ProductTagsSheet({ tags }: { tags: ProductTag[] }) {
    if (!tags || tags.length === 0) return null;
    const resolvable = tags.filter((t) => t.product);

    return (
        <details
            style={{
                marginTop: 24,
                border: '1px solid var(--line-mid)',
                background: 'var(--bg-2)',
            }}
        >
            <summary
                style={{
                    listStyle: 'none',
                    cursor: 'pointer',
                    padding: '12px 16px',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    letterSpacing: 'var(--track-wider)',
                    color: 'var(--gold)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                <span>◫ VIEW PRODUCTS ({tags.length})</span>
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--line-mid)' }}>
                {tags.map((t) => {
                    const p = t.product;
                    if (!p) {
                        return (
                            <div
                                key={t.id}
                                style={{
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--line)',
                                    color: 'var(--text-2)',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 11,
                                    letterSpacing: 'var(--track-wider)',
                                }}
                            >
                                PRODUCT UNAVAILABLE
                            </div>
                        );
                    }
                    return (
                        <Link
                            key={t.id}
                            href={`/store/p/${p.handle}`}
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--line)',
                                textDecoration: 'none',
                            }}
                        >
                            <div
                                style={{
                                    width: 48,
                                    height: 48,
                                    flexShrink: 0,
                                    background: p.thumbnail
                                        ? `url(${p.thumbnail}) center/cover no-repeat`
                                        : 'var(--bg-3)',
                                    border: '1px solid var(--line)',
                                }}
                            />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text)', fontSize: 14, letterSpacing: 0.3 }}>{p.title}</div>
                                <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>
                                    {p.paused ? 'COMING SOON' : formatMoney(p.price, p.currency)}
                                </div>
                            </div>
                            <span className="accent" style={{ fontSize: 16 }}>→</span>
                        </Link>
                    );
                })}
            </div>
            {resolvable.length === 0 ? (
                <div
                    style={{
                        padding: '10px 16px',
                        color: 'var(--text-2)',
                        fontSize: 11,
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    NONE OF THESE PRODUCTS ARE AVAILABLE RIGHT NOW.
                </div>
            ) : null}
        </details>
    );
}
