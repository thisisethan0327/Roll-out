import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
    return (
        <>
            {/* ── HERO ─────────────────────────────────────────────────────── */}
            <section style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                    <Image
                        src="/images/hero-harbor-run.jpg"
                        alt="Night port — Skyline GT-R parked under sodium lights"
                        fill
                        priority
                        style={{ objectFit: 'cover', objectPosition: 'center', filter: 'brightness(0.55) contrast(1.05)' }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 35%, var(--bg-0) 100%), linear-gradient(90deg, rgba(0,0,0,0.5) 0%, transparent 60%)',
                        }}
                    />
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
                            <span style={{ fontSize: 9 }}>BUILD 2026.05 · PNW</span>
                        </div>
                    </div>

                    {/* Pulse + eyebrow */}
                    <div className="mono-row" style={{ marginBottom: 18 }}>
                        <span style={{ width: 8, height: 8, background: 'var(--gold)', display: 'inline-block', animation: 'pulse 1.6s ease-in-out infinite' }} />
                        <span className="accent">NOW BOARDING</span>
                    </div>

                    <h1 style={{ marginBottom: 12 }}>ROLLOUT</h1>
                    <div className="text-jp" style={{ fontSize: 14, letterSpacing: 3, marginBottom: 28 }}>
                        ロールアウト
                    </div>

                    <div className="hairline" style={{ width: 60, background: 'var(--gold)', marginBottom: 28 }} />

                    <p style={{ fontSize: 'clamp(16px, 2vw, 19px)', maxWidth: 580, color: 'var(--text-2)', lineHeight: 1.5 }}>
                        A private network for the cars you actually build.{' '}
                        <span className="text-gold">Shops · Meets · Builds.</span>
                    </p>

                    {/* Spec strip */}
                    <div className="mono-row" style={{ marginTop: 40, flexWrap: 'wrap', gap: 20 }}>
                        <span><span className="accent">◉</span> RSVP CONVOY RUNS</span>
                        <span className="sep" />
                        <span><span className="accent">◐</span> TRACK BUILD LOGS</span>
                        <span className="sep" />
                        <span><span className="accent">✎</span> DIRECT LINE TO SHOPS</span>
                    </div>

                    {/* CTAs */}
                    <div id="download" style={{ display: 'flex', gap: 12, marginTop: 56, flexWrap: 'wrap' }}>
                        <a className="btn btn-lg" href="https://apps.apple.com/" rel="noopener" target="_blank">
                            Download iOS
                        </a>
                        <a className="btn btn-lg btn-ghost" href="https://play.google.com/" rel="noopener" target="_blank">
                            Get Android
                        </a>
                    </div>
                    <p className="text-muted" style={{ fontSize: 11, marginTop: 14, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)' }}>
                        TESTFLIGHT INVITES OPEN · GOOGLE PLAY BETA SOON
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
                        <FeatureCard glyph="◉" title="Convoy RSVPs" body="Know who's actually rolling. Live spot count, capacity gates, lat-long meet points." />
                        <FeatureCard glyph="◐" title="Build log" body="Track mods, miles, milestones. Up to 5 photos per build. Tagged feed for parts you ran." />
                        <FeatureCard glyph="✎" title="Shop direct line" body="Talk to the shop that wrapped your car, not their public DMs. Quotes, status, follow-ups." />
                        <FeatureCard glyph="◈" title="Garage that belongs to you" body="Your photos, your specs, your history. Delete anytime — fully — from inside the app." />
                        <FeatureCard glyph="✦" title="Sector-aware" body="Meets, posts, and shops surfaced for your sector first. Opt out and go global." />
                        <FeatureCard glyph="∿" title="Private by default" body="Posts default to followers-only. Ghost mode hides location. Block + report on every surface." />
                    </div>
                </div>
            </section>

            {/* ── SHOWCASE STAT BAND ───────────────────────────────────────── */}
            <section style={{ padding: '64px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)' }}>
                <div className="container">
                    <div className="stat-band" style={{ border: 'none' }}>
                        <div className="stat-cell">
                            <div className="lbl">Sector</div>
                            <div className="val accent">PNW 06</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Live meets</div>
                            <div className="val">14</div>
                        </div>
                        <div className="stat-cell">
                            <div className="lbl">Build count</div>
                            <div className="val">0042</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
            <section className="section">
                <div className="container">
                    <div className="eyebrow eyebrow-gold mb-4">／ HOW IT WORKS</div>
                    <h2 style={{ marginBottom: 56 }}>THREE STEPS TO LAUNCH</h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        <StepCard num="01" title="Download Rollout" body="Free for users, forever. iOS first — Android beta this quarter." />
                        <StepCard num="02" title="Add your build" body="Year, make, model. Up to 5 photos. Auto-compressed so your data plan doesn't suffer." />
                        <StepCard num="03" title="Join your sector" body="RSVP a meet near you, follow your shops, post when something rolls out of the garage." />
                    </div>
                </div>
            </section>

            {/* ── CTA ───────────────────────────────────────────────────────── */}
            <section className="section" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line)' }}>
                <div className="container" style={{ maxWidth: 760, textAlign: 'center' }}>
                    <div className="eyebrow eyebrow-gold mb-4">／ JOIN THE RUN</div>
                    <h2 style={{ marginBottom: 16 }}>YOUR GARAGE.<br />YOUR PEOPLE.<br />YOUR PLATFORM.</h2>
                    <p className="text-dim" style={{ maxWidth: 540, margin: '0 auto 32px', fontSize: 16 }}>
                        We&apos;re onboarding shops + builders by invite during beta. Drop your email and we&apos;ll send a TestFlight link when your sector opens.
                    </p>
                    <a className="btn btn-lg" href="mailto:beta@rollout.club?subject=TestFlight%20invite%20request">
                        Request TestFlight
                    </a>
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

function FeatureCard({ glyph, title, body }: { glyph: string; title: string; body: string }) {
    return (
        <div className="feature-card corner-wrap">
            <span className="corner-bottom-left" />
            <span className="corner-bottom-right" />
            <div className="icon">{glyph}</div>
            <h3>{title}</h3>
            <p>{body}</p>
        </div>
    );
}

function StepCard({ num, title, body }: { num: string; title: string; body: string }) {
    return (
        <div className="feature-card corner-wrap" style={{ minHeight: 200 }}>
            <span className="corner-bottom-left" />
            <span className="corner-bottom-right" />
            <div className="eyebrow eyebrow-gold" style={{ marginBottom: 14 }}>STEP {num}</div>
            <h3 style={{ marginBottom: 10 }}>{title}</h3>
            <p>{body}</p>
        </div>
    );
}
