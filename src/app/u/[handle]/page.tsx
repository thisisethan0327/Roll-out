import type { Metadata } from 'next';
import Image from 'next/image';
import { FollowButton } from './FollowButton';
import { getConsumerProfile } from '@/lib/consumer';
import { formatEventStamp } from '@/lib/event-time';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSellingShops } from '@/lib/store-shops';
import { fetchCatalogByHandles, type MedusaProduct } from '@/lib/medusa';

import { ROLLOUT_ORIGIN } from '@/lib/tenant-hosts';
import { UNITY_ORG, WEBSITE_ID, jsonLdHtml, postalAddress } from '@/lib/structured-data';
import { isSeedProfile } from '@/lib/seed-content';
import { isTestShop } from '@/lib/test-shops';
import { selectWithBan } from '@/lib/ban-server';
import { isBannedUntil } from '@/lib/ban';
import {
    ArrowRight,
    BadgeCheck,
    CalendarDays,
    CalendarPlus,
    Car,
    ChevronRight,
    Compass,
    ExternalLink,
    Globe,
    Heart,
    Images,
    Info,
    MapPin,
    MessageCircle,
    Reply,
    ShieldCheck,
    ShoppingBag,
    Star,
    UserX,
    Wrench,
} from 'lucide-react';
import { Card, Chip, DateRoundel, GlideButton, IconRoundel, Row, SecButton } from '@/components/glide/primitives';
import { Avatar, CardHead, ProductTile, StarRow } from '@/components/glide-discover/ui';
import { ShopDiorama } from '@/components/glide-discover/ShopDiorama';
import { dioramaFor } from '@/components/glide-discover/dioramas';
import { eventDateParts, placeName } from '@/lib/glide-format';

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
    /** Rollout ban (migration 091); absent before it is applied. */
    banned_until?: string | null;
};

type Shop = {
    id: string;
    slug: string | null;
    name: string | null;
    /** The business's own website (038) — the profile's sameAs. */
    website_url: string | null;
    /** exact | area | off (042): only 'exact' publishes a street address. */
    location_precision: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    from_name: string | null;
    email_logo_url: string | null;
    address_line: string | null;
    city: string | null;
    state_region: string | null;
    postal: string | null;
    lat: number | null;
    lng: number | null;
    show_on_map: boolean | null;
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
    hero_image_url: string | null;
    like_count: number | null;
    comment_count: number | null;
    created_at: string | null;
};

type EventCard = {
    id: string;
    code: string | null;
    title: string | null;
    start_at: string | null;
    time_zone: string | null;
    location_name: string | null;
    type: string | null;
    hero_image_url: string | null;
};

type Vehicle = {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    hero_image_url: string | null;
    garage_number: number | null;
};

type ReviewCard = {
    id: string;
    rating: number;
    body: string | null;
    verified_purchase: boolean | null;
    owner_reply: string | null;
    owner_reply_at: string | null;
    created_at: string | null;
    reviewer_name: string | null;
    reviewer_is_verified: boolean | null;
};

type ReviewStats = {
    rating_count: number | null;
    rating_avg: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function stripAt(h: string): string {
    return h.startsWith('@') ? h.slice(1) : h;
}

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function reviewAge(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (d < 1) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7) return `${d} days ago`;
    if (d < 30) return `${Math.floor(d / 7)} wk ago`;
    return `${Math.floor(d / 30)} mo ago`;
}

/** "BUILD" → "Build", "EDU" → "Guide"; the post kinds as members read them. */
const POST_TYPE_LABEL: Record<string, string> = { BUILD: 'Build', MEET: 'Meet', EDU: 'Guide', TRADE: 'For sale', POST: 'Post' };
function postTypeLabel(t: string | null | undefined): string {
    if (!t) return 'Post';
    return POST_TYPE_LABEL[t.toUpperCase()] ?? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function formatEventDate(iso: string | null | undefined, tz?: string | null): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return formatEventStamp(d, tz);
    } catch {
        return '';
    }
}

/** A street line reduced to letters and digits ("1900 Airport Way S #103" = "1900 airport way s, #103"). */
function streetKey(line: string | null | undefined): string {
    return (line ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * True when another listed (verified) shop PUBLISHES the same street line (and
 * the same ZIP, when both have one). A shop that never shows its street — on
 * 'area' or 'off' precision, or UNITY USA, whose profile shows only its city
 * (see HandlePage) — does not count: a registry row nobody sees must not
 * take another business's own address out of its markup. A failed read counts
 * as shared: the markup then just falls back to the city.
 */
async function streetSharedWithAnotherShop(shop: Shop): Promise<boolean> {
    const key = streetKey(shop.address_line);
    if (!key) return false;
    const { data, error } = await getSupabaseAdmin()
        .from('shops')
        .select('slug, address_line, postal, location_precision, show_on_map')
        .eq('status', 'verified')
        .neq('id', shop.id)
        .not('address_line', 'is', null)
        .limit(1000);
    if (error) return true;
    const zip = (shop.postal ?? '').trim();
    return (data ?? []).some(
        (s: {
            slug: string | null;
            address_line: string | null;
            postal: string | null;
            location_precision: string | null;
            show_on_map: boolean | null;
        }) =>
            s.slug !== 'unityusa' &&
            (s.location_precision ?? 'exact') === 'exact' &&
            s.show_on_map !== false &&
            streetKey(s.address_line) === key &&
            (!zip || !s.postal?.trim() || s.postal.trim() === zip),
    );
}

// ── Data fetch ─────────────────────────────────────────────────────────────
async function loadHandle(rawHandle: string) {
    const handle = stripAt(decodeURIComponent(rawHandle));
    const supabase = getSupabaseAdmin();

    const { data: profile, error: profileError } = await selectWithBan(
        'id, handle, display_name, bio, avatar_url, banner_url, location, sector_code, kind, is_verified, shop_id',
        (cols) => supabase.from('profiles').select(cols).ilike('handle', handle).maybeSingle(),
    );
    if (profileError) console.error('[u/[handle]] profile load failed:', profileError.message);

    if (!profile) return null;

    const p = profile as unknown as Profile;
    const nowIso = new Date().toISOString();

    const [shopRes, cardRes, postsRes, eventsRes, eventsCountRes, vehiclesRes, reviewsRes, statsRes] = await Promise.all([
        p.shop_id
            ? supabase
                  .from('shops')
                  .select('id, status, slug, name, website_url, location_precision, primary_color, secondary_color, from_name, email_logo_url, address_line, city, state_region, postal, lat, lng, show_on_map')
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
            .select('id, type, body, hero_image_url, author_handle, like_count, comment_count, created_at')
            .eq('author_id', p.id)
            .order('created_at', { ascending: false })
            .limit(10),
        supabase
            .from('event_cards')
            .select('id, code, title, start_at, time_zone, location_name, type, hero_image_url')
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
        p.kind === 'shop_page' && p.shop_id
            ? supabase
                  .from('shop_review_cards')
                  .select('id, rating, body, verified_purchase, owner_reply, owner_reply_at, created_at, reviewer_name, reviewer_is_verified')
                  .eq('shop_id', p.shop_id)
                  .order('created_at', { ascending: false })
                  .limit(10)
            : Promise.resolve({ data: [] }),
        p.kind === 'shop_page' && p.shop_id
            ? supabase
                  .from('shop_review_stats')
                  .select('rating_count, rating_avg')
                  .eq('shop_id', p.shop_id)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    for (const [label, res] of [
        ['shop', shopRes],
        ['profile_cards', cardRes],
        ['feed_posts', postsRes],
        ['event_cards', eventsRes],
        ['vehicles', vehiclesRes],
        ['shop_review_cards', reviewsRes],
        ['shop_review_stats', statsRes],
    ] as const) {
        const err = (res as any)?.error;
        if (err) console.error(`[u/[handle]] ${label} load failed:`, err.message);
    }

    // Storefront: if this shop_page belongs to a selling shop, fetch its Medusa
    // catalog (Rollout sales channel) to render a product grid + link to /store.
    let products: MedusaProduct[] = [];
    let storeSlug: string | null = null;
    if (p.kind === 'shop_page' && p.shop_id != null) {
        try {
            const sellingShops = await getSellingShops();
            const sellShop = sellingShops.find((s) => s.shopId === Number(p.shop_id));
            if (sellShop) {
                storeSlug = sellShop.slug;
                const { products: fetched } = await fetchCatalogByHandles(sellShop.categoryHandles);
                products = fetched.slice(0, 8);
            }
        } catch {
            /* catalog is best-effort — never block the profile */
        }
    }

    // Public invisibility: a shop_page profile whose shop is not verified
    // (pending / suspended / rejected) 404s publicly — owners manage it from the
    // dashboard, not this page.
    if (p.kind === 'shop_page') {
        const shopStatus = (shopRes.data as { status?: string } | null)?.status ?? null;
        if (shopStatus !== 'verified') return null;
    }

    return {
        profile: p,
        shop: (shopRes.data ?? null) as Shop | null,
        card: ((cardRes.data ?? {}) as ProfileCard) || {},
        posts: ((postsRes.data ?? []) as FeedPost[]) || [],
        events: ((eventsRes.data ?? []) as EventCard[]) || [],
        eventsCount: (eventsCountRes as any)?.count ?? 0,
        vehicles: ((vehiclesRes.data ?? []) as Vehicle[]) || [],
        reviews: ((reviewsRes.data ?? []) as ReviewCard[]) || [],
        reviewStats: (statsRes.data ?? null) as ReviewStats | null,
        products,
        storeSlug,
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

    // A suspended member's page says nothing about them to search engines or
    // link previews (the owner and admins still get the full page below).
    if (isBannedUntil(profile.banned_until)) {
        return { title: 'Account suspended', robots: { index: false, follow: false } };
    }

    // The root layout's template appends ' · Rollout'; social titles carry it themselves.
    const title = isShop
        ? `${displayName} on Rollout — bookings & shop drops`
        : `${displayName} (@${cleanHandle})`;
    const socialTitle = isShop ? title : `${title} · Rollout`;

    const desc = profile.bio
        ? truncate(profile.bio, 160)
        : isShop
            ? `Book vehicle wraps, PPF, ceramic coating with ${displayName} via Rollout.`
            : `${displayName} on Rollout — builds, meets, and shop drops.`;

    const images = profile.avatar_url ? [profile.avatar_url] : ['/images/og-rollout.jpg'];

    return {
        title,
        description: desc,
        // The stored handle, so /u/NeferStock and /u/@neferstock name one URL.
        alternates: { canonical: `/u/${cleanHandle}` },
        // E2E harness shops are verified (so they render) but are not
        // businesses; preview seed personas (lib/seed-content) are not members.
        ...((isShop && isTestShop(data.shop)) || isSeedProfile(profile.id) ? { robots: { index: false, follow: false } } : {}),
        openGraph: {
            title: socialTitle,
            description: desc,
            images,
            type: 'profile',
        },
        twitter: {
            card: 'summary_large_image',
            title: socialTitle,
            description: desc,
            images,
        },
    };
}

/** What anyone but the owner and admins sees for a suspended member. */
function SuspendedProfileStub({ handle }: { handle: string }) {
    return (
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <Card edge className="gd-stub">
                    <IconRoundel>
                        <UserX size={21} strokeWidth={1.75} />
                    </IconRoundel>
                    <h1>@{handle}</h1>
                    <p>This account is suspended.</p>
                    <div className="gd-acts">
                        <GlideButton href="/" size="sm">
                            Back to home
                        </GlideButton>
                        <SecButton href="/meets">Find a meet</SecButton>
                    </div>
                </Card>
            </div>
        </div>
    );
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

    const { profile, shop, card, posts, events, eventsCount, vehicles, reviews, reviewStats, products, storeSlug } = data;

    // Who is looking: anonymous, the page's own member, or another member (and
    // whether they already follow this profile) — for the web Follow button.
    const me = await getConsumerProfile();
    const viewer: 'anon' | 'self' | 'other' = !me ? 'anon' : me.profileId === profile.id ? 'self' : 'other';

    // Rollout ban: everyone but the member themself and platform admins sees a
    // stub instead of the profile (decided server-side from the DB row).
    if (isBannedUntil(profile.banned_until) && viewer !== 'self') {
        let viewerIsAdmin = false;
        if (me) {
            const { data: padmin } = await getSupabaseAdmin()
                .from('platform_admins')
                .select('profile_id')
                .eq('profile_id', me.profileId)
                .maybeSingle();
            viewerIsAdmin = !!padmin;
        }
        if (!viewerIsAdmin) return <SuspendedProfileStub handle={stripAt(profile.handle)} />;
    }
    let initialFollowing = false;
    if (viewer === 'other' && me) {
        const { data: f } = await getSupabaseAdmin()
            .from('follows')
            .select('follower_id')
            .eq('follower_id', me.profileId)
            .eq('followee_id', profile.id)
            .maybeSingle();
        initialFollowing = !!f;
    }
    const cleanHandle = stripAt(profile.handle);
    const displayName = profile.display_name || cleanHandle;
    const isShop = profile.kind === 'shop_page';
    const ratingCount = reviewStats?.rating_count ?? 0;
    const ratingAvg = Number(reviewStats?.rating_avg ?? 0);

    // Shop pages: a ProfilePage whose mainEntity is the business itself — a
    // LocalBusiness only when the shop publishes a street address (address
    // line, precision 'exact', on the map) that is ITS OWN, otherwise an
    // Organization with just its city. sameAs is the business's OWN website
    // from the registry, so search engines tie this listing to the company
    // rather than treating rollout.club as its home. No aggregateRating/review:
    // a few first-party ratings here would contradict the businesses' own
    // Google profiles (owner decision 2026-10-01). No markup at all for E2E
    // harness shops.
    //
    // Two companies on Rollout must never read as one (owner decision
    // 2026-10-01):
    //  · UNITY USA operates Rollout and already has one node, the home page's
    //    @id https://unityusa.co/#organization. Its own profile points at that
    //    node instead of minting a second UNITY USA with different facts.
    //  · A street address another listed shop also publishes is left out of
    //    the markup (city only), so two businesses are never published as one
    //    LocalBusiness location.
    //  · UNITY USA's public location is "Seattle, WA" and nothing finer (owner
    //    decision 2026-10-01), so its profile has no FIND US street line or
    //    pin whatever its registry row holds. Any shop on 'area' precision
    //    shows only its city and state there — the precision control promises
    //    "no street".
    const website = shop?.website_url && /^https?:\/\//i.test(shop.website_url.trim()) ? shop.website_url.trim() : null;
    const isOperator = shop?.slug === 'unityusa';
    const findUsLine = (
        (shop?.location_precision ?? 'exact') === 'exact'
            ? [shop?.address_line, shop?.city, shop?.state_region, shop?.postal]
            : [shop?.city, shop?.state_region]
    )
        .filter(Boolean)
        .join(', ');
    const ownsStreet =
        isShop &&
        !!shop?.address_line?.trim() &&
        (shop.location_precision ?? 'exact') === 'exact' &&
        shop.show_on_map !== false &&
        !(await streetSharedWithAnotherShop(shop));
    const locality = shop?.city
        ? { locality: shop.city, region: shop.state_region }
        : profile.location
          ? (() => {
                // "Seattle · WA" / "Seattle, WA" → locality + region
                const [loc, region] = profile.location.split(/\s*[·,]\s*/).map((x: string) => x.trim());
                return { locality: loc, region: region ?? null };
            })()
          : null;
    const shopLd =
        isShop && !isTestShop(shop)
            ? {
                  '@context': 'https://schema.org',
                  '@type': 'ProfilePage',
                  url: `${ROLLOUT_ORIGIN}/u/${cleanHandle}`,
                  name: `${displayName} on Rollout`,
                  isPartOf: { '@id': WEBSITE_ID },
                  mainEntity: isOperator
                      ? UNITY_ORG
                      : {
                            '@type': ownsStreet ? 'LocalBusiness' : 'Organization',
                            name: displayName,
                            alternateName: `@${cleanHandle}`,
                            ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
                            ...(profile.bio ? { description: profile.bio } : {}),
                            ...(website ? { sameAs: [website] } : {}),
                            ...(ownsStreet && shop
                                ? {
                                      address: postalAddress({
                                          street: shop.address_line,
                                          locality: shop.city,
                                          region: shop.state_region,
                                          postal: shop.postal,
                                      }),
                                  }
                                : locality
                                  ? { address: postalAddress(locality) }
                                  : {}),
                        },
              }
            : null;

    // No banner → one of three default plates (garage / detailing / workshop),
    // chosen by profile id so it is stable.
    const defaultBanner = ['garage', 'detailing', 'workshop'][
        Array.from(String(profile.id ?? cleanHandle)).reduce((a, c) => a + c.charCodeAt(0), 0) % 3
    ];
    const bannerSrc = profile.banner_url || `/images/polish/banner-${defaultBanner}-21x9.webp`;
    const postsN = card.posts_count ?? 0;
    const followersN = card.followers_count ?? 0;
    const followingN = card.following_count ?? 0;
    const buildsN = card.builds_count ?? 0;
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    const stats = (
        <span className="gd-stats">
            <span className="gd-stat">
                <span className="g-w">{postsN}</span> {plural(postsN, 'post', 'posts')}
            </span>
            {isShop ? (
                <span className="gd-stat">
                    <span className="g-w">{eventsCount}</span> {plural(eventsCount, 'event', 'events')}
                </span>
            ) : (
                <span className="gd-stat">
                    <span className="g-w">{buildsN}</span> {plural(buildsN, 'build', 'builds')}
                </span>
            )}
            {/* For another member the Follow control carries the live follower count. */}
            {isShop || viewer !== 'other' ? (
                <span className="gd-stat">
                    <span className="g-w">{followersN}</span> {plural(followersN, 'follower', 'followers')}
                </span>
            ) : null}
            <span className="gd-stat">
                <span className="g-w">{followingN}</span> following
            </span>
        </span>
    );

    const postsCard = (
        <Card as="section" aria-labelledby="prof-posts">
            <CardHead id="prof-posts" title="Posts" sub={posts.length > 0 ? 'Most recent first' : undefined} />
            {posts.length === 0 ? (
                <div className="gd-card-body">
                    <p>No posts yet.</p>
                </div>
            ) : (
                <ul className="gd-posts">
                    {posts.map((post) => (
                        <li key={post.id}>
                            <Link href={`/post/${post.id}`} className={post.hero_image_url ? 'gd-pt' : 'gd-pt gd-pt--text'}>
                                {post.hero_image_url ? (
                                    <span className="gd-pt-im">
                                        {/* unoptimized: the bucket host is not in next.config remotePatterns */}
                                        <Image
                                            src={post.hero_image_url}
                                            alt={truncate(post.body, 80) || 'Post image'}
                                            fill
                                            unoptimized
                                            loading="lazy"
                                            sizes="(max-width: 600px) 100vw, 320px"
                                            style={{ objectFit: 'cover' }}
                                        />
                                        {post.type ? <Chip>{postTypeLabel(post.type)}</Chip> : null}
                                    </span>
                                ) : post.type ? (
                                    <Chip>{postTypeLabel(post.type)}</Chip>
                                ) : null}
                                <p>{truncate(post.body, 140) || 'Untitled post'}</p>
                                <span className="g-chips">
                                    <Chip icon={<Heart size={14} strokeWidth={2} aria-hidden="true" />}>
                                        <span className="g-w">{post.like_count ?? 0}</span>
                                        <span className="g-sr"> likes</span>
                                    </Chip>
                                    <Chip icon={<MessageCircle size={14} strokeWidth={2} aria-hidden="true" />}>
                                        <span className="g-w">{post.comment_count ?? 0}</span>
                                        <span className="g-sr"> comments</span>
                                    </Chip>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );

    const aboutCard = (
        <Card as="section" aria-labelledby="prof-about">
            <CardHead id="prof-about" title="About" />
            <div className="gd-card-body" style={{ paddingBottom: 6 }}>
                <p>{profile.bio || 'No bio yet.'}</p>
            </div>
            <ul className="g-rows gd-rows-top">
                <Row icon={<MapPin size={20} strokeWidth={1.75} aria-hidden="true" />} label="Location" value={profile.location || 'Not set'} />
                {profile.sector_code ? <Row icon={<Compass size={20} strokeWidth={1.75} aria-hidden="true" />} label="Sector" value={profile.sector_code} /> : null}
                {website && isShop ? (
                    <Row
                        icon={<Globe size={20} strokeWidth={1.75} aria-hidden="true" />}
                        label="Website"
                        sub={website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                        href={website}
                        external
                        trailing={<ExternalLink size={16} strokeWidth={2} className="g-row-ch" aria-hidden="true" />}
                    />
                ) : null}
            </ul>
            {isShop ? <div className="gd-about-stats">{stats}</div> : null}
        </Card>
    );

    // ── Member page (board G4, member profile) ───────────────────────────
    if (!isShop) {
        return (
            <div className="glide glide-page gd-page">
                <div className="g-wrap">
                    <section className="gd-hero" aria-labelledby="prof-name">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bannerSrc} alt="" fetchPriority="high" />
                        <div className="gd-id g-fp g-edge">
                            <div className="gd-id-top">
                                <Avatar src={profile.avatar_url} name={displayName} handle={cleanHandle} />
                                <div style={{ minWidth: 0 }}>
                                    <h1 id="prof-name">
                                        {displayName}
                                        {profile.is_verified ? <BadgeCheck size={24} strokeWidth={2} aria-label="Verified" /> : null}
                                    </h1>
                                    <p className="gd-id-sub">{['@' + cleanHandle, profile.location].filter(Boolean).join(' · ')}</p>
                                </div>
                            </div>
                            {profile.bio ? <p className="gd-id-bio">{truncate(profile.bio, 240)}</p> : null}
                            <div className="gd-id-acts">
                                {viewer !== 'self' ? (
                                    <FollowButton
                                        targetProfileId={profile.id}
                                        handle={cleanHandle}
                                        viewer={viewer}
                                        initialFollowing={initialFollowing}
                                        initialCount={followersN}
                                    />
                                ) : null}
                                {stats}
                            </div>
                        </div>
                    </section>

                    <div className="gd-prof">
                        <div className="gd-prof-main">
                            {vehicles.length > 0 ? (
                                <Card as="section" aria-labelledby="prof-garage">
                                    <CardHead id="prof-garage" title="Garage" sub={`${vehicles.length} ${plural(vehicles.length, 'car', 'cars')}`} />
                                    <ul className="gd-cars">
                                        {vehicles.map((v) => (
                                            <li key={v.id} className="gd-car">
                                                <span className="gd-car-im">
                                                    {v.hero_image_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={v.hero_image_url} alt="" loading="lazy" />
                                                    ) : (
                                                        <Car size={30} strokeWidth={1.5} aria-hidden="true" />
                                                    )}
                                                </span>
                                                {v.garage_number != null ? (
                                                    <Chip>
                                                        Bay <span className="g-w">{v.garage_number}</span>
                                                    </Chip>
                                                ) : null}
                                                <b>{[v.make, v.model].filter(Boolean).join(' ') || 'Unknown build'}</b>
                                                {v.year ? <small>{v.year}</small> : null}
                                            </li>
                                        ))}
                                    </ul>
                                </Card>
                            ) : null}
                            {postsCard}
                        </div>
                        <aside className="gd-prof-side">{aboutCard}</aside>
                    </div>
                </div>
            </div>
        );
    }

    // ── Shop page (board G5, web shop page) ──────────────────────────────
    const dio = dioramaFor(shop?.slug);
    const showFindUs = !isOperator && shop?.lat != null && shop?.lng != null && shop?.show_on_map !== false;
    const directions = showFindUs ? `https://www.google.com/maps?q=${shop!.lat},${shop!.lng}` : null;
    const exact = (shop?.location_precision ?? 'exact') === 'exact' && !isOperator;
    const cityState = [shop?.city, shop?.state_region].filter(Boolean).join(', ');
    const placeLine =
        (shop?.location_precision ?? 'exact') === 'area'
            ? ['Online', cityState ? `based in ${cityState}` : null].filter(Boolean).join(' · ')
            : cityState || profile.location || '';
    const streetLine = exact ? shop?.address_line : null;
    const cityLine = [shop?.city, shop?.state_region, exact ? shop?.postal : null].filter(Boolean).join(', ');
    const bookHref = `/book/${cleanHandle}`;
    const storeHref = storeSlug ? `/store?shop=${storeSlug}` : '/store';

    const shopHeader = (
        <>
            <h1 id="shop-name">
                {displayName}
                {profile.is_verified ? <BadgeCheck size={24} strokeWidth={2} aria-label="Verified shop" /> : null}
            </h1>
            <p>{['@' + cleanHandle, placeLine].filter(Boolean).join(' · ')}</p>
            <span className="g-chips">
                {ratingCount > 0 ? (
                    <Chip icon={<Star size={14} strokeWidth={2} fill="currentColor" className="gd-star" aria-hidden="true" />}>
                        <span className="g-w">{ratingAvg.toFixed(1)}</span> · {ratingCount} {plural(ratingCount, 'review', 'reviews')}
                    </Chip>
                ) : (
                    <Chip>No reviews yet</Chip>
                )}
                {profile.is_verified ? (
                    <Chip tint icon={<ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />}>
                        Verified shop
                    </Chip>
                ) : null}
            </span>
        </>
    );
    const shopDetails = (
        <ul className="g-rows">
            {streetLine || cityLine ? (
                <Row
                    icon={<MapPin size={20} strokeWidth={1.75} aria-hidden="true" />}
                    label={streetLine || cityLine}
                    sub={streetLine ? cityLine : undefined}
                    href={directions ?? undefined}
                    external
                    value={directions ? <span style={{ color: 'var(--link)', fontWeight: 600, fontSize: 14 }}>Directions</span> : undefined}
                />
            ) : null}
            <Row
                icon={<CalendarPlus size={20} strokeWidth={1.75} aria-hidden="true" />}
                label="Book online"
                sub="Request a time. The shop confirms."
                href={bookHref}
                trailing={<ChevronRight size={18} strokeWidth={2} className="g-row-ch" aria-hidden="true" />}
            />
            {products.length > 0 ? (
                <Row
                    icon={<ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" />}
                    label="Store"
                    sub="Products from this shop"
                    href={storeHref}
                    trailing={<ChevronRight size={18} strokeWidth={2} className="g-row-ch" aria-hidden="true" />}
                />
            ) : null}
        </ul>
    );

    return (
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <div className="gd-sp">
                    <div className="gd-sp-main">
                        <div className="gd-sp-hero">
                            {dio ? (
                                <ShopDiorama
                                    dio={dio}
                                    labelledBy="shop-name"
                                    header={shopHeader}
                                    details={shopDetails}
                                    panes={{
                                        book: {
                                            title: 'Book a time',
                                            sub: 'Pick a service and a time. The shop confirms.',
                                            icon: <CalendarPlus size={18} strokeWidth={1.9} />,
                                            body: (
                                                <GlideButton href={bookHref} size="sm" block>
                                                    Book online
                                                </GlideButton>
                                            ),
                                        },
                                        ...(products.length > 0
                                            ? {
                                                  store: {
                                                      title: 'Store',
                                                      sub: 'Products from this shop.',
                                                      icon: <ShoppingBag size={18} strokeWidth={1.9} />,
                                                      body: (
                                                          <ul className="gd-prods gd-prods--two">
                                                              {products.slice(0, 2).map((p) => (
                                                                  <li key={p.id}>
                                                                      <ProductTile product={p} />
                                                                  </li>
                                                              ))}
                                                          </ul>
                                                      ),
                                                  },
                                              }
                                            : {}),
                                        ...(profile.bio
                                            ? {
                                                  about: {
                                                      title: 'About the shop',
                                                      icon: <Info size={18} strokeWidth={1.9} />,
                                                      body: <p>{truncate(profile.bio, 260)}</p>,
                                                  },
                                              }
                                            : {}),
                                        ...(posts.length > 0
                                            ? {
                                                  posts: {
                                                      title: 'Recent posts',
                                                      icon: <Images size={18} strokeWidth={1.9} />,
                                                      body: (
                                                          <ul className="g-rows gd-pane-rows">
                                                              {posts.slice(0, 2).map((post) => (
                                                                  <Row
                                                                      key={post.id}
                                                                      label={truncate(post.body, 60) || 'Untitled post'}
                                                                      sub={postTypeLabel(post.type)}
                                                                      href={`/post/${post.id}`}
                                                                      trailing={<ChevronRight size={18} strokeWidth={2} className="g-row-ch" aria-hidden="true" />}
                                                                  />
                                                              ))}
                                                          </ul>
                                                      ),
                                                  },
                                              }
                                            : {}),
                                    }}
                                />
                            ) : (
                                <section className="gd-sp-photohero" aria-labelledby="shop-name">
                                    <div className="gd-sp-photo">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={bannerSrc} alt="" fetchPriority="high" />
                                    </div>
                                    <div className="gd-sp-card g-fp g-edge">
                                        <div className="gd-sp-hd gd-sp-hd--logo">
                                            <Avatar src={profile.avatar_url} name={displayName} handle={cleanHandle} />
                                            <div style={{ minWidth: 0 }}>{shopHeader}</div>
                                        </div>
                                        {shopDetails}
                                    </div>
                                </section>
                            )}
                        </div>

                        <div className="gd-sp-rest">
                            {products.length > 0 ? (
                                <Card as="section" aria-labelledby="shop-store">
                                    <CardHead
                                        id="shop-store"
                                        title="Store"
                                        action={
                                            <Link href={storeHref} className="g-link">
                                                All products
                                                <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                                            </Link>
                                        }
                                    />
                                    <ul className="gd-prods">
                                        {products.map((p) => (
                                            <li key={p.id}>
                                                <ProductTile product={p} />
                                            </li>
                                        ))}
                                    </ul>
                                </Card>
                            ) : null}

                            <Card as="section" aria-labelledby="shop-reviews">
                                <CardHead id="shop-reviews" title="Reviews" />
                                {ratingCount > 0 ? (
                                    <div className="gd-rev-sum">
                                        <span className="big">{ratingAvg.toFixed(1)}</span>
                                        <span>
                                            <StarRow rating={ratingAvg} size={17} />
                                            <small>
                                                {ratingCount} {plural(ratingCount, 'review', 'reviews')} on Rollout
                                            </small>
                                        </span>
                                    </div>
                                ) : null}
                                {reviews.length === 0 ? (
                                    <div className="gd-card-body">
                                        <p>No reviews yet. Book an appointment and be the first.</p>
                                    </div>
                                ) : (
                                    <ul className="gd-revs">
                                        {reviews.map((rev) => (
                                            <li key={rev.id}>
                                                <div className="gd-rev-h">
                                                    <StarRow rating={rev.rating} size={15} />
                                                    <b>{rev.reviewer_name || 'Someone'}</b>
                                                    {rev.verified_purchase ? (
                                                        <Chip tint icon={<BadgeCheck size={13} strokeWidth={2} aria-hidden="true" />}>
                                                            Verified visit
                                                        </Chip>
                                                    ) : null}
                                                    <time dateTime={rev.created_at ?? undefined}>{reviewAge(rev.created_at)}</time>
                                                </div>
                                                {rev.body ? <p>{rev.body}</p> : null}
                                                {rev.owner_reply ? (
                                                    <div className="gd-reply">
                                                        <b>
                                                            <Reply size={14} strokeWidth={2} aria-hidden="true" />
                                                            Reply from {displayName}
                                                        </b>
                                                        <p>{rev.owner_reply}</p>
                                                    </div>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Card>

                            <Card as="section" aria-labelledby="shop-events">
                                <CardHead id="shop-events" title="Upcoming events" />
                                {events.length === 0 ? (
                                    <div className="gd-card-body">
                                        <p>No upcoming events.</p>
                                    </div>
                                ) : (
                                    <ul className="gd-evrows">
                                        {events.map((ev) => {
                                            const when = eventDateParts(ev.start_at, ev.time_zone);
                                            return (
                                                <li key={ev.id}>
                                                    <Link href={`/event/${ev.id}`} className="gd-evrow">
                                                        {when ? <DateRoundel top={when.dow} day={when.day} rings={false} /> : null}
                                                        <span className="g-row-t">
                                                            <b>{ev.title || 'Untitled event'}</b>
                                                            <small>
                                                                {[when ? `${when.dayLabel} · ${when.clock}` : formatEventDate(ev.start_at, ev.time_zone), placeName(ev.location_name)]
                                                                    .filter(Boolean)
                                                                    .join(' · ')}
                                                            </small>
                                                        </span>
                                                        <ChevronRight size={18} strokeWidth={2} className="g-row-ch" aria-hidden="true" />
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </Card>

                            {postsCard}

                            {showFindUs ? (
                                <Card as="section" aria-labelledby="shop-findus">
                                    <CardHead
                                        id="shop-findus"
                                        title="Find us"
                                        sub={findUsLine || undefined}
                                        action={
                                            <a className="g-link" href={directions!} target="_blank" rel="noopener noreferrer">
                                                Directions
                                                <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                                            </a>
                                        }
                                    />
                                    <div className="gd-findus" style={{ marginBottom: 14 }}>
                                        <iframe
                                            src={`https://www.openstreetmap.org/export/embed.html?bbox=${shop!.lng! - 0.006},${shop!.lat! - 0.006},${shop!.lng! + 0.006},${shop!.lat! + 0.006}&layer=mapnik&marker=${shop!.lat},${shop!.lng}`}
                                            title="Shop location map"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                </Card>
                            ) : null}
                        </div>
                    </div>

                    <aside className="gd-sp-side">
                        <Card edge className="gd-book" aria-labelledby="shop-book">
                            <h2 id="shop-book">Book an appointment</h2>
                            <p>Tell {displayName} what you need and when suits you. They confirm a time from their console.</p>
                            <ul className="g-rows">
                                <Row icon={<Wrench size={20} strokeWidth={1.75} aria-hidden="true" />} label="Pick a service" sub="Wrap, PPF, tint, ceramic, parts or something else" />
                                <Row icon={<CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />} label="Suggest a day and time" sub="The shop confirms the slot" />
                                <Row icon={<Car size={20} strokeWidth={1.75} aria-hidden="true" />} label="Add a car and notes" sub="From your garage" />
                            </ul>
                            <div className="gd-book-act">
                                <GlideButton href={bookHref} block>
                                    Book online
                                </GlideButton>
                                <p className="gd-book-note">
                                    {viewer === 'anon' ? 'Sign in with your email to send the request. No app needed.' : 'Your request shows under Account, Appointments.'}
                                </p>
                            </div>
                        </Card>
                        {aboutCard}
                    </aside>
                </div>
            </div>
            {/* Structured data LAST: Next picks the segment's FIRST element to decide
                whether to scroll to the top on navigation, and an invisible <script>
                always reads as "already in view", so the page kept the previous scroll. */}
            {shopLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(shopLd) }} /> : null}
        </div>
    );
}
