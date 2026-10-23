import Link from 'next/link';
import type { Metadata } from 'next';
import {
    ArrowRight,
    CalendarDays,
    Car,
    Clock,
    Flag,
    Map as MapIcon,
    MessageCircle,
    Smartphone,
    ShieldCheck,
    ShoppingBag,
    Store,
    Users,
} from 'lucide-react';
import { AnnouncementBar } from '@/components/AnnouncementBar';
import { AccountDeletedNotice } from '@/components/AccountDeletedNotice';
import { getSiteAnnouncements } from '@/lib/announcements';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ROLLOUT_ORIGIN } from '@/lib/tenant-hosts';
import { APP_ID, UNITY_ORG, UNITY_ORG_ID, WEBSITE_ID, jsonLdHtml } from '@/lib/structured-data';
import { resolveCover } from '@/lib/event-covers';
import { eventDateParts, eventTypeLabel, placeName } from '@/lib/glide-format';
import { IOS_BETA_URL } from '@/lib/app-links';
import { Card, Chip, GlideButton, IconRoundel, SecButton } from '@/components/glide/primitives';

// The root layout no longer carries a site-wide canonical; the home page
// declares its own.
export const metadata: Metadata = {
    alternates: { canonical: '/' },
};

/**
 * Who runs this site and what it is, for search engines and answer engines:
 * the website, the company that operates it (UNITY USA, whose own node lives
 * on unityusa.co — referenced by @id, never redefined with other facts), and
 * the app. operatingSystem is iOS only because that is the only build there
 * is (a public TestFlight beta — lib/app-links.ts); applicationCategory is the
 * primary category in the App Store submission package (docs/
 * APP_STORE_SUBMISSION_2026-09-25.md). No rating: the app has no store
 * ratings yet, and a made-up one is a manual-action risk.
 */
const HOME_LD = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'WebSite',
            '@id': WEBSITE_ID,
            url: ROLLOUT_ORIGIN,
            name: 'Rollout',
            description: 'A private network for the cars you build.',
            inLanguage: 'en-US',
            publisher: { '@id': UNITY_ORG_ID },
        },
        UNITY_ORG,
        {
            '@type': 'MobileApplication',
            '@id': APP_ID,
            name: 'Rollout',
            url: ROLLOUT_ORIGIN,
            description: 'A private network for the cars you build. Shops, meets and builds.',
            operatingSystem: 'iOS',
            applicationCategory: 'LifestyleApplication',
            publisher: { '@id': UNITY_ORG_ID },
        },
    ],
};

export const revalidate = 60; // 60s so a posted announcement reaches the home page quickly (counts are cheap head queries)

/**
 * REAL platform counts, read with the admin client; a failed read shows a
 * dash rather than a made-up number.
 */
async function platformCounts(): Promise<{ meets: string; shops: string; members: string }> {
    const dash = { meets: '—', shops: '—', members: '—' };
    try {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();
        const [meets, shops, members] = await Promise.all([
            supabase.from('event_cards').select('id', { count: 'exact', head: true }).eq('visibility', 'public').gte('start_at', nowIso),
            supabase.from('shops').select('id', { count: 'exact', head: true }),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('kind', 'user'),
        ]);
        const n = (c: number | null) => (c == null ? '—' : String(c));
        return { meets: n(meets.count), shops: n(shops.count), members: n(members.count) };
    } catch {
        return dash;
    }
}

type Upcoming = {
    id: string;
    title: string | null;
    type: string | null;
    start_at: string | null;
    time_zone: string | null;
    location_name: string | null;
    hero_image_url: string | null;
    attending_count: number | null;
    capacity: number | null;
};

/**
 * The next public meets, soonest first (the same event_cards read the old
 * "Next run" band used). The first one is the hero's chip; up to six fill
 * "Coming up". Empty on any failure: the sections then simply don't render.
 */
async function upcomingMeets(): Promise<Upcoming[]> {
    try {
        const { data } = await getSupabaseAdmin()
            .from('event_cards')
            .select('id, title, type, start_at, time_zone, location_name, hero_image_url, attending_count, capacity')
            .eq('visibility', 'public')
            .gte('start_at', new Date().toISOString())
            .order('start_at', { ascending: true })
            .limit(6);
        return (data ?? []) as Upcoming[];
    } catch {
        return [];
    }
}

const FEATURES = [
    { icon: Users, title: 'Convoy RSVPs', body: "Know who's actually rolling: live spot count, capacity and the meet point." },
    { icon: Car, title: 'Your garage', body: 'Your photos, your specs, your history. Delete anytime, fully.' },
    { icon: MessageCircle, title: 'A direct line to your shops', body: 'Quotes, status and follow-ups with the shop that did the work.' },
    { icon: Flag, title: 'Host your own meets', body: 'Verified hosts set the capacity, run the waitlist, sell packages and invite by email.' },
    { icon: ShoppingBag, title: 'The store', body: 'Film, parts and merch from shops on Rollout, shipped by the shop that sells it.' },
    { icon: ShieldCheck, title: 'Private events stay private', body: 'Followers-only and invite-only events stay out of search; strangers see a teaser at most.' },
];

export default async function HomePage() {
    const [counts, announcements, upcoming] = await Promise.all([platformCounts(), getSiteAnnouncements(), upcomingMeets()]);
    const next = upcoming[0] ?? null;
    const nextWhen = next ? eventDateParts(next.start_at, next.time_zone) : null;

    return (
        <div className="glide glide-page g-home">
            <div className="g-wrap">
                <AccountDeletedNotice />
                {/* Site announcements: directly under the header, above the hero. */}
                <AnnouncementBar announcements={announcements} variant="card" />

                {/* ── HERO ─────────────────────────────────────────────────── */}
                <section className="g-hero" aria-labelledby="home-title">
                    {/* Day image in light, night image in the dark styles
                        (GLIDE.md, Images). Board imagery, mock-up grade, until
                        the imagery round replaces it. */}
                    <picture className="g-only-light">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/glide/hero-day.webp" alt="White roadster with a light blue, navy and red stripe in a race-day paddock" fetchPriority="high" style={{ objectPosition: '50% 58%' }} />
                    </picture>
                    <picture className="g-only-dark">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/glide/hero-night.webp" alt="Convoy at blue hour on a canyon road, led by a white striped coupe" style={{ objectPosition: '50% 66%' }} />
                    </picture>
                    <div className="g-hero-card g-fp g-edge">
                        <h1 id="home-title">
                            Find your crew.
                            <br />
                            Hit the road.
                        </h1>
                        <p>Meets, runs and the shops you trust. RSVP on the web, ride together with the app.</p>
                    </div>
                    {next && nextWhen ? (
                        <Link href={`/event/${next.id}`} className="g-hero-chip g-fp">
                            <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
                            <span>
                                {next.title ?? 'Next meet'} · {nextWhen.dayLabel}
                            </span>
                        </Link>
                    ) : null}
                </section>

                {/* ── DOORS ────────────────────────────────────────────────── */}
                <div className="g-doors">
                    <Card edge className="g-door">
                        <div className="g-door-im">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/glide/door-meet.webp" alt="" loading="lazy" />
                        </div>
                        <div className="g-door-bd">
                            <h2>Find a meet</h2>
                            <p>Browse meets, runs and shows by type, or open the map. No app needed to RSVP.</p>
                            <div className="g-door-ctl">
                                <GlideButton href="/meets" size="sm">
                                    Browse meets
                                </GlideButton>
                                <Link href="/meets/map" className="g-link">
                                    <MapIcon size={16} strokeWidth={2} aria-hidden="true" />
                                    Open the map
                                </Link>
                            </div>
                        </div>
                    </Card>
                    <Card edge className="g-door">
                        <div className="g-door-im">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/glide/door-host.webp" alt="" loading="lazy" />
                        </div>
                        <div className="g-door-bd">
                            <h2>Host a run</h2>
                            <p>Set the route, the ticket tiers and the spots. Lead the convoy live from your phone.</p>
                            <div className="g-door-ctl">
                                <GlideButton href="/me/events" size="sm">
                                    Start hosting
                                </GlideButton>
                            </div>
                        </div>
                    </Card>
                    <Card edge className="g-door">
                        <div className="g-door-im g-door-im--dio">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="g-only-light" src="/images/glide/door-shop-day.webp" alt="" loading="lazy" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="g-only-dark" src="/images/glide/door-shop-night.webp" alt="" loading="lazy" />
                        </div>
                        <div className="g-door-bd">
                            <h2>List your shop</h2>
                            <p>Get verified, take bookings and sell from your own store page.</p>
                            <div className="g-door-ctl">
                                <GlideButton href="/shop/apply" size="sm">
                                    List your shop
                                </GlideButton>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* ── COMING UP ────────────────────────────────────────────── */}
                {upcoming.length > 0 ? (
                    <section className="g-sec-block" aria-labelledby="home-upcoming">
                        <div className="g-sh">
                            <h2 id="home-upcoming">Coming up</h2>
                            <Link href="/meets" className="g-link">
                                All meets
                            </Link>
                        </div>
                        <ul className="g-list">
                            {upcoming.map((ev) => {
                                const when = eventDateParts(ev.start_at, ev.time_zone);
                                const place = placeName(ev.location_name);
                                const going = ev.attending_count ?? 0;
                                return (
                                    <li key={ev.id}>
                                        <Link href={`/event/${ev.id}`} className="g-li">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={resolveCover(ev.hero_image_url, ev.type, ev.id)} alt="" loading="lazy" />
                                            <span className="g-li-t">
                                                <b>{ev.title ?? 'Car meet'}</b>
                                                <small>
                                                    {[place, eventTypeLabel(ev.type)].filter(Boolean).join(' · ')}
                                                </small>
                                            </span>
                                            <span className="g-chips">
                                                {when ? (
                                                    <Chip icon={<Clock size={14} strokeWidth={2} aria-hidden="true" />}>{when.short}</Chip>
                                                ) : null}
                                                {going > 0 ? (
                                                    <Chip icon={<Users size={14} strokeWidth={2} aria-hidden="true" />}>
                                                        {ev.capacity ? (
                                                            <>
                                                                <span className="g-w">
                                                                    {going}/{ev.capacity}
                                                                </span>
                                                                <span className="g-sr"> going</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="g-w">{going}</span> going
                                                            </>
                                                        )}
                                                    </Chip>
                                                ) : null}
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ) : null}

                {/* ── WHAT'S ON ROLLOUT ────────────────────────────────────── */}
                <section className="g-sec-block" id="features" aria-labelledby="home-features">
                    <div className="g-sh">
                        <div>
                            <h2 id="home-features">Built for the people who build</h2>
                            <p>Your garage, your shops and the people who get it, in one place.</p>
                        </div>
                    </div>
                    <Card className="g-feat" style={{ marginTop: 12 }}>
                        <ul className="g-rows" style={{ display: 'contents' }}>
                            {FEATURES.map((f) => (
                                <li key={f.title} className="g-row">
                                    <IconRoundel>
                                        <f.icon size={21} strokeWidth={1.75} />
                                    </IconRoundel>
                                    <span className="g-row-t">
                                        <b>{f.title}</b>
                                        <small>{f.body}</small>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </section>

                {/* ── JOIN ─────────────────────────────────────────────────── */}
                <section className="g-sec-block" aria-labelledby="home-join">
                    <Card edge className="g-join">
                        <div>
                            <h2 id="home-join">Your garage. Your people.</h2>
                            <p>
                                Free for drivers. Create your account in your browser, RSVP to a meet this weekend, or list your shop and take
                                bookings online.
                            </p>
                            <div className="g-stats" aria-label="On Rollout now">
                                <Chip large icon={<CalendarDays size={15} strokeWidth={2} aria-hidden="true" />}>
                                    <span className="g-w">{counts.meets}</span> upcoming meets
                                </Chip>
                                <Chip large icon={<Store size={15} strokeWidth={2} aria-hidden="true" />}>
                                    <span className="g-w">{counts.shops}</span> shops
                                </Chip>
                                <Chip large icon={<Users size={15} strokeWidth={2} aria-hidden="true" />}>
                                    <span className="g-w">{counts.members}</span> members
                                </Chip>
                            </div>
                        </div>
                        <div className="g-join-act" id="download">
                            <GlideButton href="/signup">Create your account</GlideButton>
                            <div className="g-act-row">
                                <SecButton href="/shop/apply">
                                    <Store size={18} strokeWidth={1.75} aria-hidden="true" />
                                    List your shop
                                </SecButton>
                                <SecButton href={IOS_BETA_URL} external>
                                    <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" />
                                    iOS beta
                                </SecButton>
                            </div>
                            <p className="g-appear-note">
                                Works in your browser. The iOS app is a TestFlight beta; Android is coming.{' '}
                                <Link href="/sign-in-on-phone" className="g-link" style={{ minHeight: 0, fontSize: 12.5 }}>
                                    Sign-in help <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
                                </Link>
                            </p>
                        </div>
                    </Card>
                </section>
            </div>
            {/* Structured data LAST, as on /event and /u: an invisible <script>
                as the segment's first element breaks scroll-to-top. */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(HOME_LD) }} />
        </div>
    );
}
