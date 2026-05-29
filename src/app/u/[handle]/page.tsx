import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ── Types (loose; rollout schema not codegen'd) ────────────────────────────
type Profile = {
    id: string;
    handle: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    location: string | null;
    sector_code: string | null;
    kind: 'user' | 'shop_page' | string;
    is_verified: boolean | null;
    shop_id: string | null;
};

type Shop = {
    id: string;
    primary_color: string | null;
    secondary_color: string | null;
    from_name: string | null;
    email_logo_url: string | null;
};

type ProfileCard = {
    followers_count: number | null;
    following_count: number | null;
    posts_count: number | null;
    builds_count: number | null;
};

type FeedPost = {
    id: string;
    type: string | null;
    body: string | null;
    author_handle: string | null;
    like_count: number | null;
    comment_count: number | null;
    created_at: string | null;
};

type EventCard = {
    id: string;
    code: string | null;
    title: string | null;
    start_at: string | null;
    location_name: string | null;
};

type Vehicle = {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    hero_image_url: string | null;
    garage_number: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function stripAt(h: string): string {
    return h.startsWith('@') ? h.slice(1) : h;
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function initials(name: string | null | undefined, handle: string): string {
    const src = (name && name.trim().length ? name : handle).trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatEventDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).toUpperCase();
        const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/Los_Angeles' }).toUpperCase();
        const day = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' });
        let hour = d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/Los_Angeles' });
        hour = hour.replace(/\s/g, '').toUpperCase();
        return `${dow} ${mon} ${day} · ${hour} PT`;
    } catch {
        return '';
    }
}

// ── Data fetch ─────────────────────────────────────────────────────────────
async function loadHandle(rawHandle: string) {
    const handle = stripAt(decodeURIComponent(rawHandle));
    const supabase = getSupabaseAdmin();

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, handle, display_name, bio, avatar_url, banner_url, location, sector_code, kind, is_verified, shop_id')
        .ilike('handle', handle)
        .maybeSingle();

    if (!profile) return null;

    const p = profile as Profile;
    const nowIso = new Date().toISOString();

    const [shopRes, cardRes, postsRes, eventsRes, eventsCountRes, vehiclesRes] = await Promise.all([
        p.shop_id
            ? supabase
                  .from('shops')
                  .select('id, primary_color, secondary_color, from_name, email_logo_url')
                  .eq('id', p.shop_id)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
        supabase
            .from('profile_cards')
            .select('followers_count, following_count, posts_count, builds_count')
            .eq('id', p.id)
            .maybeSingle(),
        supabase
            .from('feed_posts')
            .select('id, type, body, author_handle, like_count, comment_count, created_at')
            .eq('author_id', p.id)
            .order('created_at', { ascending: false })
            .limit(10),
        supabase
            .from('event_cards')
            .select('id, code, title, start_at, location_name')
            .eq('host_id', p.id)
            .gt('start_at', nowIso)
            .order('start_at', { ascending: true })
            .limit(5),
        supabase
            .from('event_cards')
            .select('id', { count: 'exact', head: true })
            .eq('host_id', p.id),
        p.kind === 'user'
            ? supabase
                  .from('vehicles')
                  .select('id, year, make, model, hero_image_url, garage_number')
                  .eq('owner_id', p.id)
                  .eq('visibility', 'public')
                  .order('garage_number', { ascending: true })
                  .limit(6)
            : Promise.resolve({ data: [] }),
    ]);

    return {
        profile: p,
        shop: (shopRes.data ?? null) as Shop | null,
        card: ((cardRes.data ?? {}) as ProfileCard) || {},
        posts: ((postsRes.data ?? []) as FeedPost[]) || [],
        events: ((eventsRes.data ?? []) as EventCard[]) || [],
        eventsCount: (eventsCountRes as any)?.count ?? 0,
        vehicles: ((vehiclesRes.data ?? []) as Vehicle[]) || [],
    };
}

// ── Metadata ───────────────────────────────────────────────────────────────
export async function generateMetadata({
    params,
}: {
    params: Promise<{ handle: string }>;
}): Promise<Metadata> {
    const { handle } = await params;
    const data = await loadHandle(handle);

    if (!data) {
        return { title: 'Profile not found' };
    }

    const { profile } = data;
    const cleanHandle = stripAt(profile.handle);
    const displayName = profile.display_name || cleanHandle;
    const isShop = profile.kind === 'shop_page';

    const title = isShop
        ? `${displayName} on Rollout — bookings & shop drops`
        : `${displayName} (@${cleanHandle}) · Rollout`;

    const desc = profile.bio
        ? truncate(profile.bio, 160)
        : isShop
            ? `Book vehicle wraps, PPF, ceramic coating with ${displayName} via Rollout.`
            : `${displayName} on Rollout — builds, meets, and shop drops.`;

    const images = profile.avatar_url ? [profile.avatar_url] : ['/images/og-rollout.jpg'];

    return {
        title,
        description: desc,
        openGraph: {
            title,
            description: desc,
            images,
            type: 'profile',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: desc,
            images,
        },
    };
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function HandlePage({
    params,
}: {
    params: Promise<{ handle: string }>;
}) {
    const { handle: rawHandle } = await params;
    const data = await loadHandle(rawHandle);

    if (!data) notFound();

    const { profile, shop, card, posts, events, eventsCount, vehicles } = data;
    const cleanHandle = stripAt(profile.handle);
    const displayName = profile.display_name || cleanHandle;
    const isShop = profile.kind === 'shop_page';

    const primary = shop?.primary_color || 'var(--gold)';
    const heroBg = profile.banner_url
        ? `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 100%), url(${profile.banner_url}) center/cover no-repeat`
        : `linear-gradient(135deg, ${primary} 0%, #000000 100%)`;

    return (
        <>
            {/* ── HERO ─────────────────────────────────────────────────── */}
            <section
                style={{
                    position: 'relative',
                    minHeight: 320,
                    background: heroBg,
                    borderBottom: '1px solid var(--line)',
                }}
            >
                <div
                    className="container"
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        paddingTop: 64,
                        paddingBottom: 64,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: 16,
                    }}
                >
                    {/* Avatar */}
                    <div
                        style={{
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            border: '2px solid var(--gold)',
                            background: profile.avatar_url
                                ? `url(${profile.avatar_url}) center/cover no-repeat`
                                : 'var(--bg-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-display)',
                            fontSize: 36,
                            fontWeight: 700,
                            color: 'var(--gold)',
                            overflow: 'hidden',
                        }}
                    >
                        {!profile.avatar_url && initials(displayName, cleanHandle)}
                    </div>

                    {/* Name + verified */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: 2, margin: 0 }}>
                            {displayName.toUpperCase()}
                        </h1>
                        {profile.is_verified ? (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '4px 10px',
                                    borderRadius: 999,
                                    background: 'var(--gold-dim)',
                                    border: '1px solid var(--gold)',
                                    color: 'var(--gold)',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: 'var(--track-wider)',
                                }}
                            >
                                ✓ VERIFIED
                            </span>
                        ) : null}
                    </div>

                    <div className="mono-row" style={{ color: 'var(--text-2)' }}>
                        <span>@{cleanHandle}</span>
                        {profile.sector_code ? (
                            <>
                                <span className="sep" />
                                <span className="accent">{profile.sector_code}</span>
                            </>
                        ) : null}
                        {profile.location ? (
                            <>
                                <span className="sep" />
                                <span>{profile.location}</span>
                            </>
                        ) : null}
                    </div>

                    {profile.bio ? (
                        <p style={{ maxWidth: 560, color: 'var(--text-2)', fontSize: 15, lineHeight: 1.55, marginTop: 4 }}>
                            {truncate(profile.bio, 240)}
                        </p>
                    ) : null}

                    <div className="mono-row" style={{ marginTop: 8 }}>
                        <span className="accent">●</span>
                        <span>{card.followers_count ?? 0} FOLLOWERS</span>
                    </div>
                </div>
            </section>

            {/* ── STICKY STAT BAR ──────────────────────────────────────── */}
            <section style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
                <div className="container" style={{ padding: 0 }}>
                    <div
                        className="stat-band"
                        style={{
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            border: 'none',
                            margin: 0,
                        }}
                    >
                        <div className="stat-cell">
                            <div className="lbl">Posts</div>
                            <div className="val">{card.posts_count ?? 0}</div>
                        </div>
                        {isShop ? (
                            <div className="stat-cell">
                                <div className="lbl">Followers</div>
                                <div className="val accent">{card.followers_count ?? 0}</div>
                            </div>
                        ) : (
                            <div className="stat-cell">
                                <div className="lbl">Builds</div>
                                <div className="val accent">{card.builds_count ?? 0}</div>
                            </div>
                        )}
                        {isShop ? (
                            <div className="stat-cell">
                                <div className="lbl">Following</div>
                                <div className="val">{card.following_count ?? 0}</div>
                            </div>
                        ) : (
                            <div className="stat-cell">
                                <div className="lbl">Followers</div>
                                <div className="val accent">{card.followers_count ?? 0}</div>
                            </div>
                        )}
                        {isShop ? (
                            <div className="stat-cell">
                                <div className="lbl">Events</div>
                                <div className="val">{eventsCount}</div>
                            </div>
                        ) : (
                            <div className="stat-cell">
                                <div className="lbl">Following</div>
                                <div className="val">{card.following_count ?? 0}</div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* ── PRIMARY CTA ──────────────────────────────────────────── */}
            <section className="section" style={{ padding: '56px 0', textAlign: 'center' }}>
                <div className="container">
                    {isShop ? (
                        <>
                            <a
                                className="btn btn-lg"
                                href={`https://rollout.club/sign-in-on-phone?next=/u/${cleanHandle}`}
                            >
                                Book Appointment
                            </a>
                            <p className="text-muted" style={{ fontSize: 11, marginTop: 14, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)' }}>
                                DOWNLOAD THE ROLLOUT APP TO BOOK
                            </p>
                        </>
                    ) : (
                        <>
                            <a className="btn btn-lg" href={`mobile://u/${cleanHandle}`}>
                                View in App
                            </a>
                            <p className="text-muted" style={{ fontSize: 11, marginTop: 14, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)' }}>
                                OPEN IN THE ROLLOUT APP TO FOLLOW + DM
                            </p>
                        </>
                    )}
                </div>
            </section>

            {/* ── RECENT BUILDS (user-only) ────────────────────────────── */}
            {!isShop && vehicles.length > 0 ? (
                <section className="section" style={{ padding: '56px 0', borderTop: '1px solid var(--line)' }}>
                    <div className="container">
                        <div className="eyebrow eyebrow-gold mb-4">／ RECENT BUILDS</div>
                        <h2 style={{ marginBottom: 32 }}>GARAGE</h2>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                                gap: 16,
                            }}
                        >
                            {vehicles.map((v) => (
                                <div key={v.id} className="feature-card corner-wrap" style={{ padding: 0, overflow: 'hidden' }}>
                                    <span className="corner-bottom-left" />
                                    <span className="corner-bottom-right" />
                                    <div
                                        style={{
                                            width: '100%',
                                            aspectRatio: '4 / 3',
                                            background: v.hero_image_url
                                                ? `url(${v.hero_image_url}) center/cover no-repeat`
                                                : 'var(--bg-3)',
                                        }}
                                    />
                                    <div style={{ padding: '18px 20px' }}>
                                        <div className="eyebrow" style={{ marginBottom: 6 }}>
                                            GARAGE #{v.garage_number ?? '—'}
                                        </div>
                                        <h3 style={{ fontSize: 16, letterSpacing: 0.8, margin: 0 }}>
                                            {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown build'}
                                        </h3>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            ) : null}

            {/* ── RECENT POSTS ─────────────────────────────────────────── */}
            <section className="section" style={{ padding: '56px 0', borderTop: '1px solid var(--line)' }}>
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ RECENT POSTS</div>
                    <h2 style={{ marginBottom: 32 }}>FEED</h2>

                    {posts.length === 0 ? (
                        <p className="text-dim">No posts yet.</p>
                    ) : (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: 16,
                            }}
                        >
                            {posts.map((post) => (
                                <Link
                                    key={post.id}
                                    href={`/post/${post.id}`}
                                    style={{ textDecoration: 'none' }}
                                >
                                    <div className="feature-card corner-wrap" style={{ height: '100%' }}>
                                        <span className="corner-bottom-left" />
                                        <span className="corner-bottom-right" />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                            <span
                                                style={{
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    letterSpacing: 'var(--track-wider)',
                                                    padding: '4px 8px',
                                                    border: '1px solid var(--gold)',
                                                    color: 'var(--gold)',
                                                }}
                                            >
                                                {(post.type || 'POST').toUpperCase()}
                                            </span>
                                        </div>
                                        <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
                                            {truncate(post.body, 240) || 'Untitled post'}
                                        </p>
                                        <div className="mono-row" style={{ fontSize: 10 }}>
                                            <span>@{post.author_handle || cleanHandle}</span>
                                            <span className="sep" />
                                            <span><span className="accent">♥</span> {post.like_count ?? 0}</span>
                                            <span className="sep" />
                                            <span><span className="accent">✎</span> {post.comment_count ?? 0}</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* ── UPCOMING EVENTS (shop only) ──────────────────────────── */}
            {isShop ? (
                <section className="section" style={{ padding: '56px 0', borderTop: '1px solid var(--line)' }}>
                    <div className="container">
                        <div className="eyebrow eyebrow-gold mb-4">／ UPCOMING</div>
                        <h2 style={{ marginBottom: 32 }}>EVENTS</h2>

                        {events.length === 0 ? (
                            <p className="text-dim">No upcoming events.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {events.map((ev) => (
                                    <Link
                                        key={ev.id}
                                        href={`/event/${ev.id}`}
                                        style={{ textDecoration: 'none' }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '20px 24px',
                                                background: 'var(--bg-2)',
                                                border: '1px solid var(--line)',
                                                gap: 16,
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                                                <div className="mono-row" style={{ fontSize: 10 }}>
                                                    <span className="accent">{ev.code || 'EVENT'}</span>
                                                    <span className="sep" />
                                                    <span>{formatEventDate(ev.start_at)}</span>
                                                </div>
                                                <h3 style={{ fontSize: 17, margin: 0, color: 'var(--text)', letterSpacing: 0.8 }}>
                                                    {(ev.title || 'Untitled event').toUpperCase()}
                                                </h3>
                                                {ev.location_name ? (
                                                    <span className="text-dim" style={{ fontSize: 13 }}>{ev.location_name}</span>
                                                ) : null}
                                            </div>
                                            <span className="accent" style={{ fontSize: 18 }}>→</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            ) : null}

            {/* ── ABOUT ────────────────────────────────────────────────── */}
            <section className="section" style={{ padding: '56px 0', borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                <div className="container container-narrow">
                    <div className="eyebrow eyebrow-gold mb-4">／ ABOUT</div>
                    <h2 style={{ marginBottom: 24 }}>{displayName.toUpperCase()}</h2>

                    {profile.bio ? (
                        <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                            {profile.bio}
                        </p>
                    ) : (
                        <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                            No bio yet.
                        </p>
                    )}

                    <div className="stat-band" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                        <div className="stat-cell">
                            <div className="lbl">Location</div>
                            <div className="val" style={{ fontSize: 14 }}>{profile.location || '—'}</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Sector</div>
                            <div className="val accent" style={{ fontSize: 14 }}>{profile.sector_code || '—'}</div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
