/**
 * /post/[id] — minimal read-only post page.
 *
 * Exists to kill the dead /post/[id] links from /u/[handle] (which listed posts
 * that had nowhere to land on the web). Renders public, non-deleted posts only;
 * everything else 404s. Shows the body, media, author (linked to their profile)
 * and any linked event. Read-only — engagement lives in the app.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
    created_at: string | null;
    linked_event_id: string | null;
    author: {
        handle: string | null;
        display_name: string | null;
        avatar_url: string | null;
        is_verified: boolean | null;
    } | null;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadPost(id: string): Promise<PostRow | null> {
    if (!UUID_RE.test(id)) return null;
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from('posts')
        .select(
            `id, type, body, hero_image_url, media_urls, tags, visibility, deleted_at,
             like_count, comment_count, created_at, linked_event_id,
             author:profiles!posts_author_id_fkey(handle, display_name, avatar_url, is_verified),
             linked_event:events!posts_linked_event_id_fkey(id, title, code, start_at, location_name, visibility, cancelled_at)`,
        )
        .eq('id', id)
        .maybeSingle();

    const post = data as PostRow | null;
    if (!post || post.deleted_at || post.visibility !== 'public') return null;
    return post;
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

    return (
        <>
            {/* HEADER */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
                <div className="container container-narrow" style={{ padding: '40px 0 28px' }}>
                    <div className="mono-row" style={{ fontSize: 10, marginBottom: 14 }}>
                        <span className="accent">{(post.type ?? 'POST').toUpperCase()}</span>
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
                                <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>@{authorHandle}</div>
                            </div>
                        </Link>
                    ) : (
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text)' }}>{authorName}</div>
                    )}
                </div>
            </section>

            {/* HERO IMAGE */}
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
                    {post.body ? (
                        <p style={{ color: 'var(--text)', fontSize: 17, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>
                            {post.body}
                        </p>
                    ) : (
                        <p className="text-dim" style={{ fontSize: 16 }}>No caption.</p>
                    )}

                    {/* MEDIA GRID */}
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
