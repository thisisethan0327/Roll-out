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
import { formatDateOnly } from '@/lib/event-time';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchProductsByIds, formatMoney, type MedusaProduct } from '@/lib/medusa';
import { BadgeCheck, ChevronRight, Flag, Hash, Heart, MessageCircle, PackageX, Repeat2, ShoppingBag } from 'lucide-react';
import { Card, Chip, IconRoundel, Row } from '@/components/glide/primitives';
import { Avatar, CardHead } from '@/components/glide-discover/ui';
import { placeName } from '@/lib/glide-format';

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
    const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle();
    if (error) console.error('[post/[id]] loadPost failed:', error.message);

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
    const { data, error } = await supabase
        .from('posts')
        .select(
            `id, body, hero_image_url, media_urls, visibility, deleted_at, created_at,
             author:profiles!posts_author_id_fkey(handle, display_name, avatar_url, is_verified)`,
        )
        .eq('id', repostOf)
        .maybeSingle();
    if (error) console.error('[post/[id]] loadOriginal failed:', error.message);

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
    const { data, error } = await supabase
        .from('post_product_tags')
        .select('medusa_product_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(5);
    if (error) console.error('[post/[id]] loadProductTags failed:', error.message);

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

/** The post kinds as members read them. */
const POST_TYPE_LABEL: Record<string, string> = { BUILD: 'Build', MEET: 'Meet', EDU: 'Guide', TRADE: 'For sale', POST: 'Post' };
function postTypeLabel(t: string | null | undefined): string {
    if (!t) return 'Post';
    return POST_TYPE_LABEL[t.toUpperCase()] ?? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return formatDateOnly(iso);
    } catch {
        return '';
    }
}

/** Split a body into text + @mention links (→ /u/<handle>). Renames break the
 *  link at render (handle-based), same as the app / IG. Hashtags (#) are left
 *  untouched. */
function linkifyMentions(text: string, links = true): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /@([a-z0-9_.-]+)/gi;
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const handle = m[1];
        // Inside another link (the embedded original) a mention stays text: links cannot nest.
        out.push(
            links ? (
                <Link key={`m${key++}`} href={`/u/${handle}`}>
                    @{handle}
                </Link>
            ) : (
                <span key={`m${key++}`}>@{handle}</span>
            ),
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
    // The root layout's title template appends ' · Rollout'; appending it here too
    // gave the tab "… · Rollout · Rollout". openGraph/twitter do not pass through
    // the template, so they carry the suffix explicitly.
    const title = `${truncate(post.body, 60) || `${post.type ?? 'Post'} by ${author}`}`;
    const socialTitle = `${title} · Rollout`;
    const desc = truncate(post.body, 160) || `A ${(post.type ?? 'post').toLowerCase()} on Rollout.`;
    const images = post.hero_image_url ? [post.hero_image_url] : ['/images/og-rollout.jpg'];
    return {
        title,
        description: desc,
        alternates: { canonical: `/post/${post.id}` },
        openGraph: { title: socialTitle, description: desc, images, type: 'article' },
        twitter: { card: 'summary_large_image', title: socialTitle, description: desc, images },
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
    // The hero is usually media_urls[0] too; show it once.
    const media = (post.media_urls ?? []).filter((u) => u && u !== post.hero_image_url);
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
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <div className="gd-post-wrap">
                    <Card as="article" className="gd-post" aria-label={`${isRepost ? 'Repost' : postTypeLabel(post.type)} by ${authorName}`}>
                        {/* AUTHOR */}
                        <div className="gd-post-au">
                            {authorHandle ? (
                                <Link href={`/u/${authorHandle}`}>
                                    <Avatar src={post.author?.avatar_url} name={authorName} handle={authorHandle} small />
                                    <span style={{ minWidth: 0 }}>
                                        <b>
                                            {authorName}
                                            {post.author?.is_verified ? <BadgeCheck size={16} strokeWidth={2} aria-label="Verified" /> : null}
                                        </b>
                                        <small>
                                            {isPlainRepost ? 'Reposted · ' : ''}@{authorHandle}
                                            {post.created_at ? ` · ${fmtDate(post.created_at)}` : ''}
                                        </small>
                                    </span>
                                </Link>
                            ) : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Avatar name={authorName} small />
                                    <span>
                                        <b>{authorName}</b>
                                        {post.created_at ? <small>{fmtDate(post.created_at)}</small> : null}
                                    </span>
                                </span>
                            )}
                            <Chip icon={isRepost ? <Repeat2 size={14} strokeWidth={2} aria-hidden="true" /> : undefined}>
                                {isRepost ? 'Repost' : postTypeLabel(post.type)}
                            </Chip>
                        </div>

                        {/* HERO IMAGE (own media — absent on a plain repost) */}
                        {post.hero_image_url ? (
                            <div className="gd-post-hero">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={post.hero_image_url} alt={truncate(post.body, 100) || 'Post photo'} />
                            </div>
                        ) : null}

                        {/* BODY */}
                        {isPlainRepost ? null : bodyText ? (
                            <p className="gd-post-body">{linkifyMentions(bodyText)}</p>
                        ) : (
                            <p className="gd-post-empty">No caption.</p>
                        )}

                        {/* EMBEDDED ORIGINAL (plain + quote reposts) */}
                        {isRepost ? <OriginalCard original={original} /> : null}

                        {/* MEDIA GRID (own media) */}
                        {media.length > 0 ? (
                            <div className={media.length === 1 ? 'gd-media is-one' : 'gd-media'}>
                                {media.map((url, i) => (
                                    <div key={i} role="img" aria-label={`Photo ${i + 1} of ${media.length}`} style={{ backgroundImage: `url(${url})` }} />
                                ))}
                            </div>
                        ) : null}

                        {/* TAGGED PRODUCTS (§3.3) */}
                        <ProductTagsSheet tags={productTags} />

                        {/* TAGS */}
                        {post.tags && post.tags.length > 0 ? (
                            <div className="g-chips" aria-label="Tags">
                                {post.tags.slice(0, 10).map((t) => (
                                    <Chip key={t} icon={<Hash size={13} strokeWidth={2} aria-hidden="true" />}>
                                        {t.replace(/^#/, '')}
                                    </Chip>
                                ))}
                            </div>
                        ) : null}

                        {/* ENGAGEMENT (read-only) */}
                        <div className="gd-eng">
                            <span>
                                <Heart size={18} strokeWidth={2} aria-hidden="true" />
                                <span className="g-w">{post.like_count ?? 0}</span>
                                <span className="g-sr">likes</span>
                            </span>
                            <span>
                                <MessageCircle size={18} strokeWidth={2} aria-hidden="true" />
                                <span className="g-w">{post.comment_count ?? 0}</span>
                                <span className="g-sr">comments</span>
                            </span>
                            <span>
                                <Repeat2 size={18} strokeWidth={2} aria-hidden="true" />
                                <span className="g-w">{post.repost_count ?? 0}</span>
                                <span className="g-sr">reposts</span>
                            </span>
                            <p>Like, comment and repost in the Rollout app.</p>
                        </div>
                    </Card>

                    {/* LINKED EVENT */}
                    {eventLive ? (
                        <Card as="section" aria-labelledby="post-meet">
                            <CardHead id="post-meet" title="Linked meet" />
                            <ul className="gd-evrows">
                                <li>
                                    <Link href={`/event/${ev!.id}`} className="gd-evrow">
                                        {/* No date here: this read has no event time zone, and a date in
                                            the wrong zone would be a wrong date. */}
                                        <IconRoundel>
                                            <Flag size={21} strokeWidth={1.75} />
                                        </IconRoundel>
                                        <span className="g-row-t">
                                            <b>{ev!.title ?? 'Untitled meet'}</b>
                                            <small>
                                                {[ev!.cancelled_at ? 'Cancelled' : null, placeName(ev!.location_name), 'Open the meet for the date and RSVP']
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </small>
                                        </span>
                                        <ChevronRight size={18} strokeWidth={2} className="g-row-ch" aria-hidden="true" />
                                    </Link>
                                </li>
                            </ul>
                        </Card>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/** Embedded card for the post a repost points at. Renders an "unavailable"
 *  shell for deleted/hidden originals (never cascades). */
function OriginalCard({ original }: { original: OriginalPost | typeof UNAVAILABLE | null }) {
    if (!original || original === UNAVAILABLE) {
        return (
            <div className="gd-orig gd-orig--gone">
                <Repeat2 size={18} strokeWidth={2} aria-hidden="true" />
                The original post is no longer available.
            </div>
        );
    }

    const handle = original.author?.handle ?? '';
    const name = original.author?.display_name || handle || 'Member';
    const thumb = original.hero_image_url || (original.media_urls ?? []).filter(Boolean)[0] || null;

    return (
        <Link href={`/post/${original.id}`} className="gd-orig">
            {thumb ? <span className="gd-orig-im" style={{ backgroundImage: `url(${thumb})` }} aria-hidden="true" /> : null}
            <span style={{ minWidth: 0 }}>
                <b>
                    {name} {handle ? <span>@{handle}</span> : null}
                </b>
                <p>{original.body ? linkifyMentions(truncate(original.body, 280), false) : 'No caption.'}</p>
            </span>
        </Link>
    );
}

/** "View products" disclosure for tagged store products. A native <details>,
 *  so it needs no client JS. Paused products link to the product page but say
 *  Coming soon; missing or deleted products render a quiet shell. */
function ProductTagsSheet({ tags }: { tags: ProductTag[] }) {
    if (!tags || tags.length === 0) return null;
    const resolvable = tags.filter((t) => t.product);

    return (
        <details className="gd-tags">
            <summary>
                <ShoppingBag size={18} strokeWidth={2} aria-hidden="true" />
                View products ({tags.length})
                <ChevronRight size={18} strokeWidth={2} className="ch" aria-hidden="true" />
            </summary>
            <ul className="g-rows">
                {tags.map((t) => {
                    const p = t.product;
                    if (!p) {
                        return <Row key={t.id} icon={<PackageX size={20} strokeWidth={1.75} aria-hidden="true" />} label="Product unavailable" />;
                    }
                    return (
                        <Row
                            key={t.id}
                            icon={<span className="gd-thumb" style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})` } : undefined} aria-hidden="true" />}
                            label={p.title}
                            sub={p.paused ? 'Coming soon' : formatMoney(p.price, p.currency)}
                            href={`/store/p/${p.handle}`}
                            trailing={<ChevronRight size={18} strokeWidth={2} className="g-row-ch" aria-hidden="true" />}
                        />
                    );
                })}
            </ul>
            {resolvable.length === 0 ? (
                <p style={{ margin: 0, padding: '10px 16px 14px', fontSize: 13.5, color: 'var(--ink-2)' }}>None of these products are available right now.</p>
            ) : null}
        </details>
    );
}
