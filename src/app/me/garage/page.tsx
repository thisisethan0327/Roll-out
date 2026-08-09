/**
 * /me/garage — read view of the member's rollout.vehicles plus their public
 * posts. Editing lives in the mobile app; this surface links out. Scoped to the
 * caller's profile id via the service-role admin client (explicit owner filter).
 */
import Link from 'next/link';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyGarage, loadMyPosts } from '@/lib/me-data';
import { fmtDay, EmptyRow, Panel, StatusPill } from '../ui';

export const dynamic = 'force-dynamic';

export default async function GaragePage() {
    const profile = await requireConsumer('/me/garage');
    const [vehicles, posts] = await Promise.all([
        loadMyGarage(profile.profileId),
        loadMyPosts(profile.profileId),
    ]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">GARAGE</div>
                    <div className="admin-page-sub text-dim">
                        Your builds and posts. Editing lives in the Rollout app.
                    </div>
                </div>
            </div>

            <Panel title="VEHICLES">
                {vehicles.length === 0 ? (
                    <EmptyRow text="NO VEHICLES YET — ADD ONE IN THE APP" />
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: 12,
                        }}
                    >
                        {vehicles.map((v) => (
                            <div
                                key={v.id}
                                style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', overflow: 'hidden' }}
                            >
                                <div
                                    style={{
                                        aspectRatio: '16/10',
                                        background: v.hero_image_url
                                            ? `center/cover url(${v.hero_image_url})`
                                            : 'var(--bg-1)',
                                        display: 'flex',
                                        alignItems: 'flex-end',
                                        borderBottom: '1px solid var(--line)',
                                    }}
                                >
                                    {v.garage_number && (
                                        <span
                                            style={{
                                                margin: 8,
                                                fontFamily: 'var(--font-mono, monospace)',
                                                fontSize: 10,
                                                color: 'var(--gold)',
                                                background: 'rgba(0,0,0,0.6)',
                                                padding: '2px 6px',
                                            }}
                                        >
                                            #{v.garage_number}
                                        </span>
                                    )}
                                </div>
                                <div style={{ padding: 12 }}>
                                    <div style={{ color: 'var(--text)', fontSize: 14 }}>
                                        {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                                    </div>
                                    <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                        {[v.trim, v.color].filter(Boolean).join(' · ') || '—'}
                                    </div>
                                    {(v.engine || v.hp) && (
                                        <div className="text-dim" style={{ fontSize: 11, marginTop: 4 }}>
                                            {v.engine ?? ''}
                                            {v.engine && v.hp ? ' · ' : ''}
                                            {v.hp ? `${v.hp} hp` : ''}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                        {v.build_stage && <StatusPill status={v.build_stage} />}
                                        {v.visibility && v.visibility !== 'public' && (
                                            <span className="admin-pill">{String(v.visibility).toUpperCase()}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            <Panel title="MY POSTS" href={`/u/${profile.handle}`} hrefLabel="PUBLIC PROFILE">
                {posts.length === 0 ? (
                    <EmptyRow text="NO POSTS YET" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {posts.map((p) => (
                            <div
                                key={p.id}
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    border: '1px solid var(--line)',
                                    background: 'var(--bg-2)',
                                    padding: 10,
                                }}
                            >
                                {p.hero_image_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={p.hero_image_url}
                                        alt=""
                                        style={{
                                            width: 56,
                                            height: 56,
                                            objectFit: 'cover',
                                            border: '1px solid var(--line)',
                                            flexShrink: 0,
                                        }}
                                    />
                                )}
                                <div style={{ minWidth: 0 }}>
                                    <div className="text-dim" style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', fontFamily: 'var(--font-display)' }}>
                                        {String(p.type ?? 'POST').toUpperCase()} · {fmtDay(p.created_at)}
                                    </div>
                                    {p.body && (
                                        <div
                                            style={{
                                                fontSize: 13,
                                                color: 'var(--text)',
                                                marginTop: 3,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {p.body}
                                        </div>
                                    )}
                                    <div className="text-dim" style={{ fontSize: 11, marginTop: 4 }}>
                                        ♥ {p.like_count ?? 0} · 💬 {p.comment_count ?? 0}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    );
}
