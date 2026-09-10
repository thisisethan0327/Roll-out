import Link from 'next/link';
import { HeroLoop } from '@/components/HeroLoop';
import { NextRunBand } from './NextRunBand';
import { HomeMotion } from '@/components/motion/HomeMotion';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AppStoreBadges } from '@/components/AppStoreBadges';
import Image, { getImageProps } from 'next/image';

/**
 * The stat band shows REAL platform counts (it was hardcoded 14 / 0042 with a
 * "PNW 06" sector cell). Read with the admin client, revalidated every five
 * minutes; a failed read shows a dash rather than a made-up number.
 */
export const revalidate = 300;

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
        const pad = (n: number | null) => (n == null ? '—' : String(n).padStart(2, '0'));
        return { meets: pad(meets.count), shops: pad(shops.count), members: pad(members.count) };
    } catch {
        return dash;
    }
}

export default async function HomePage() {
    const counts = await platformCounts();
    // The hero pair as plain <img> props so a <picture> can art-direct them:
    // 21:9 on desktop, 9:16 on phones, exactly one plate requested per width.
    const { props: desktopPlate } = getImageProps({
        alt: 'Wet rooftop at night, city lights below, a car under gold rim light',
        src: '/images/polish/hero-night-21x9.webp',
        fill: true,
        priority: true,
        sizes: '100vw',
    });
    const { props: portraitPlate } = getImageProps({ alt: '', src: '/images/polish/hero-night-9x16.webp', fill: true, sizes: '100vw' });
    return (
        <>
            {/* ── HERO ─────────────────────────────────────────────────────── */}
            {/* on-dark: a night photo at 0.55 brightness is dark in BOTH themes.
                Measured on production (run R12, RG): in light the wordmark was
                rgb(20,22,26) over rgb(10,17,23) — the tagline and spec strip
                the same. The gradient's bottom stop is frozen to #000 as well,
                because it used to end in var(--bg-0): dark ink fixed at the top
                would have become light ink on a white fade at the bottom. Dark
                mode is unchanged by construction (--bg-0 was #000 there). */}
            <HomeMotion>
            <section className="on-dark" data-hero style={{ position: 'relative', overflow: 'hidden' }}>
                <div data-hero-img style={{ position: 'absolute', inset: 0, zIndex: 0, transformOrigin: '50% 40%' }}>
                    {/* Polish plate A (Ethan's pick): wet rooftop at night, city bokeh
                        below, gold rim light, the car on the right third and a
                        near-black left third for the wordmark — so the old 0.55
                        brightness filter goes and the scrim only guards the copy. */}
                    <picture>
                        <source media="(max-width: 900px)" srcSet={portraitPlate.srcSet} sizes={portraitPlate.sizes} />
                        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
                        <img
                            {...desktopPlate}
                            fetchPriority="high"
                            style={{ ...desktopPlate.style, objectFit: 'cover', objectPosition: '62% 50%' }}
                        />
                    </picture>
                    <HeroLoop />
                    <div className="home-hero-scrim" />
                </div>

                <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 96, paddingBottom: 120, minHeight: '88vh' }}>
                    {/* Corner stamps */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 80 }}>
                        <div className="mono-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                            <span className="accent">SECTOR 06</span>
                            <span style={{ fontSize: 9 }}>47.6280°N · 122.3321°W</span>
                        </div>
                        <div className="mono-row" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span className="accent">NIGHT_RUN ／ 0042</span>
                            <span style={{ fontSize: 9 }}>BUILD 2026.09</span>
                        </div>
                    </div>

                    {/* Pulse + eyebrow */}
                    <div className="mono-row" style={{ marginBottom: 18 }}>
                        <span style={{ width: 8, height: 8, background: 'var(--gold)', display: 'inline-block', animation: 'pulse 1.6s ease-in-out infinite' }} />
                        <span className="accent">NOW BOARDING</span>
                    </div>

                    <h1 data-hero-word style={{ marginBottom: 12 }}>ROLLOUT</h1>
                    <div className="text-jp" style={{ fontSize: 14, letterSpacing: 3, marginBottom: 28 }}>
                        ロールアウト
                    </div>

                    <div className="hairline" style={{ width: 60, background: 'var(--gold)', marginBottom: 28 }} />

                    <p data-hero-copy style={{ fontSize: 'clamp(16px, 2vw, 19px)', maxWidth: 580, color: 'var(--text-2)', lineHeight: 1.5 }}>
                        A private network for the cars you actually build.{' '}
                        <span className="text-gold">Shops · Meets · Builds.</span>
                    </p>

                    {/* Spec strip */}
                    <div data-hero-copy className="mono-row" style={{ marginTop: 40, flexWrap: 'wrap', gap: 20 }}>
                        <span><span className="accent">◉</span> RSVP CONVOY RUNS</span>
                        <span className="sep" />
                        <span><span className="accent">◐</span> TRACK BUILD LOGS</span>
                        <span className="sep" />
                        <span><span className="accent">✎</span> DIRECT LINE TO SHOPS</span>
                    </div>

                    {/* CTAs */}
                    <div id="download" data-hero-copy style={{ display: 'flex', gap: 12, marginTop: 56, flexWrap: 'wrap' }}>
                        <Link className="btn btn-lg" href="/meets">
                            Find a meet
                        </Link>
                        <Link className="btn btn-lg btn-ghost" href="/signup">
                            Create your account
                        </Link>
                        <AppStoreBadges />
                    </div>
                    <p className="text-muted" style={{ fontSize: 11, marginTop: 14, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)' }}>
                        WORKS IN YOUR BROWSER · NOTHING TO INSTALL
                    </p>
                </div>
            </section>

            {/* ── FEATURES ─────────────────────────────────────────────────── */}
            <section className="section" id="features">
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ FEATURES</div>
                    <h2 style={{ marginBottom: 14 }}>BUILT FOR THE PEOPLE WHO BUILD</h2>
                    <p className="text-dim" style={{ maxWidth: 680, fontSize: 17, lineHeight: 1.55, marginBottom: 56 }}>
                        Stop chasing convoy details in three different DMs. Stop losing build photos in a camera roll.
                        Rollout puts your garage, your shops, and the people who get it in one place.
                    </p>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: 16,
                        }}
                    >
                        <FeatureCard plate="rsvps" glyph="◉" title="Convoy RSVPs" body="Know who's actually rolling. Live spot count, capacity gates, lat-long meet points." />
                        <FeatureCard plate="buildlog" glyph="◐" title="Build log" body="Track mods, miles, milestones. Up to 5 photos per build. Tagged feed for parts you ran." />
                        <FeatureCard plate="shopline" glyph="✎" title="Shop direct line" body="Talk to the shop that wrapped your car, not their public DMs. Quotes, status, follow-ups." />
                        <FeatureCard plate="garage" glyph="◈" title="Garage that belongs to you" body="Your photos, your specs, your history. Delete anytime — fully." />
                        <FeatureCard plate="nearyou" glyph="✦" title="Host your own meets" body="Verified hosts set the capacity, run the waitlist, sell packages and invite by email." />
                        <FeatureCard plate="private" glyph="∿" title="The store" body="Film, parts and merch from the shops on Rollout. One checkout, shipped by the shop that sells it." />
                    </div>
                </div>
            </section>

            {/* ── SHOWCASE STAT BAND ───────────────────────────────────────── */}
            <section style={{ padding: '64px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                <div className="container">
                    <div className="stat-band" style={{ border: 'none' }}>
                        <div className="stat-cell">
                            <div className="lbl">Live meets</div>
                            <div className="val accent" data-count={counts.meets} data-pad="2">{counts.meets}</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Shops listed</div>
                            <div className="val" data-count={counts.shops} data-pad="2">{counts.shops}</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Members</div>
                            <div className="val" data-count={counts.members} data-pad="2">{counts.members}</div>
                        </div>
                    </div>
                </div>
            </section>
            </HomeMotion>

            {/* ── NEXT RUN — the map band (UI polish §6) ─────────────────── */}
            <NextRunBand />

            {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
            <section className="section">
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ HOW IT WORKS</div>
                    <h2 style={{ marginBottom: 56 }}>THREE STEPS TO LAUNCH</h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        <StepCard num="01" illo="how-1" title="Download Rollout" body="Free for users, forever. iOS first — Android beta this quarter." />
                        <StepCard num="02" illo="how-2" title="Add your build" body="Year, make, model. Up to 5 photos. Auto-compressed so your data plan doesn't suffer." />
                        <StepCard num="03" illo="how-3" title="Join your sector" body="RSVP a meet near you, follow your shops, post when something rolls out of the garage." />
                    </div>
                </div>
            </section>

            {/* ── CTA ───────────────────────────────────────────────────────── */}
            <section className="section" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line)' }}>
                <div className="container" style={{ maxWidth: 760, textAlign: 'center' }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ JOIN THE RUN</div>
                    <h2 style={{ marginBottom: 16 }}>YOUR GARAGE.<br />YOUR PEOPLE.<br />YOUR PLATFORM.</h2>
                    <p className="text-dim" style={{ maxWidth: 540, margin: '0 auto 32px', fontSize: 16 }}>
                        Free for drivers. Create your account in your browser, RSVP to a meet this weekend, or list your shop and take bookings online.
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link className="btn btn-lg" href="/signup">
                            Create your account
                        </Link>
                        <Link className="btn btn-lg btn-ghost" href="/shop/apply">
                            List your shop
                        </Link>
                    </div>
                </div>
            </section>

            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
        </>
    );
}

function FeatureCard({ plate, glyph, title, body }: { plate: string; glyph: string; title: string; body: string }) {
    return (
        <div className="feature-card corner-wrap rv">
            <span className="corner-bottom-left" />
            <span className="corner-bottom-right" />
            <div className="feature-plate">
                <Image src={`/images/polish/feat-${plate}-4x3.webp`} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 380px" style={{ objectFit: 'cover' }} />
            </div>
            <div className="icon">{glyph}</div>
            <h3>{title}</h3>
            <p>{body}</p>
        </div>
    );
}

function StepCard({ num, illo, title, body }: { num: string; illo: string; title: string; body: string }) {
    return (
        <div className="feature-card corner-wrap rv" style={{ minHeight: 200 }}>
            <span className="corner-bottom-left" />
            <span className="corner-bottom-right" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="step-illo" src={`/illo/${illo}.svg`} alt="" width={120} height={90} loading="lazy" />
            <div className="eyebrow eyebrow-gold" style={{ marginBottom: 14 }}>STEP {num}</div>
            <h3 style={{ marginBottom: 10 }}>{title}</h3>
            <p>{body}</p>
        </div>
    );
}
