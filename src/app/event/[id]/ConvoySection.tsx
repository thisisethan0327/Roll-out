/**
 * Cover Story B — "WHO'S GOING" attendee preview. Not in the Cover Story B
 * mockup's section inventory; kept working exactly as before, restyled to
 * fit, placed right after the ticket card (people check who else is in after
 * reserving their own spot).
 */
import Link from 'next/link';
import styles from './cover-story.module.css';

type Attendee = {
    profile_id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
};

function initials(name: string, handle: string): string {
    const src = (name?.trim() || handle || '·').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ConvoySection({
    attendees,
    attendingCount,
    remaining,
}: {
    attendees: Attendee[];
    attendingCount: number;
    remaining: number;
}) {
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <span className="mono-row" style={{ fontSize: 11 }}>
                    <span className="accent">●</span>
                    <span>{attendingCount} CONFIRMED</span>
                </span>
            </div>

            {attendees.length === 0 ? (
                <p className="text-dim">{attendingCount} attending.</p>
            ) : (
                <div className={styles.convoyGrid}>
                    {attendees.map((a) => (
                        <Link
                            key={a.profile_id}
                            href={`/u/${a.handle}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', textDecoration: 'none' }}
                        >
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: a.avatar_url ? `url(${a.avatar_url}) center/cover no-repeat` : 'var(--bg-3)',
                                    border: '1px solid var(--gold)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: 'var(--font-display)',
                                    fontWeight: 700,
                                    fontSize: 11,
                                    color: 'var(--gold)',
                                    flexShrink: 0,
                                }}
                            >
                                {!a.avatar_url && initials(a.display_name, a.handle)}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    @{a.handle}
                                </div>
                                <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: 'var(--track-wider)', marginTop: 2 }}>
                                    GOING
                                </div>
                            </div>
                        </Link>
                    ))}
                    {remaining > 0 ? (
                        <div
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', border: '1px dashed var(--line-mid)', background: 'transparent', color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)' }}
                        >
                            +{remaining} MORE
                        </div>
                    ) : null}
                </div>
            )}
        </>
    );
}
