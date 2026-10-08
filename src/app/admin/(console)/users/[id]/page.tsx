/**
 * /admin/users/[id] — platform-admin detail view of ONE member (id =
 * rollout.profiles.id): account, profile, activity, shops, events, RSVPs and
 * verification history. Read-only apart from the shared account actions.
 *
 * Authorization: requirePlatformAdmin() (the console layout checks too).
 * Service-role reads only.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { UUID_RE, loadUserFacts, relativeTime } from '@/lib/admin-user-facts';
import { MEDUSA_URL } from '@/lib/medusa';
import { UserActions } from './UserActions';

export const metadata = { title: 'User · Detail' };
export const dynamic = 'force-dynamic';

const LABEL_STYLE: React.CSSProperties = {
    padding: '10px 0',
    fontFamily: 'var(--font-display, monospace)',
    fontSize: 10,
    letterSpacing: '2px',
    color: 'var(--text-3, #8a8a9a)',
    width: 150,
    verticalAlign: 'top',
};

const STATE_PILL: Record<string, string> = {
    pending: 'admin-pill gold',
    approved: 'admin-pill neon',
    verified: 'admin-pill neon',
    rejected: 'admin-pill warn',
};

const RSVP_PILL: Record<string, string> = {
    going: 'admin-pill neon',
    maybe: 'admin-pill gold',
    waitlist: 'admin-pill',
    declined: 'admin-pill warn',
};

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

function stampRel(iso: string | null | undefined): string {
    return iso ? `${stamp(iso)} · ${relativeTime(iso)}` : '—';
}

async function loadAll(id: string) {
    const admin = getSupabaseAdmin();

    // select('*'): columns added by later migrations (host_status,
    // deactivated_at, deleted_at, xp_total, level…) are shown when present.
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) console.error('[admin/users/[id]] profile load failed:', error.message);
    if (!profile) return null;

    const rsvpBase = 'event_id, status, rsvped_at';
    const rsvpQuery = (cols: string) =>
        admin.from('event_rsvps').select(cols).eq('profile_id', id).order('rsvped_at', { ascending: false }).limit(100);

    const [facts, padmin, coord, memberships, hosted, verifs, rsvpRes] = await Promise.all([
        loadUserFacts([id]),
        admin.from('platform_admins').select('profile_id').eq('profile_id', id).maybeSingle(),
        admin.from('meet_coordinators').select('profile_id').eq('profile_id', id).maybeSingle(),
        admin
            .from('shop_memberships')
            .select('shop_id, role, created_at, shop:shops(id, slug, name)')
            .eq('profile_id', id)
            .order('created_at', { ascending: true }),
        admin
            .from('events')
            .select('id, code, title, start_at, cancelled_at, visibility, shop_id')
            .eq('host_id', id)
            .order('start_at', { ascending: false })
            .limit(100),
        admin
            .from('verification_requests')
            .select('id, kind, state, shop_id, created_at, decided_at, review_note, payload')
            .eq('profile_id', id)
            .order('created_at', { ascending: false }),
        rsvpQuery(`${rsvpBase}, hold_state, seats, payment_ref`),
    ]);

    let rsvpRows = rsvpRes;
    if (rsvpRes.error && rsvpRes.error.code === '42703') {
        // Pre-080/085 schema: no hold_state/seats/payment_ref.
        rsvpRows = await rsvpQuery(rsvpBase);
    }
    if (rsvpRows.error) console.error('[admin/users/[id]] rsvps load failed:', rsvpRows.error.message);
    const rsvps = ((rsvpRows.data as any[]) ?? []) as any[];

    const rsvpEventIds = [...new Set(rsvps.map((r) => r.event_id))];
    const eventById = new Map<string, any>();
    if (rsvpEventIds.length) {
        const { data: evs } = await admin
            .from('events')
            .select('id, code, title, start_at, cancelled_at')
            .in('id', rsvpEventIds);
        for (const e of (evs as any[]) ?? []) eventById.set(e.id, e);
    }

    if (memberships.error) console.error('[admin/users/[id]] memberships load failed:', memberships.error.message);
    if (hosted.error) console.error('[admin/users/[id]] hosted load failed:', hosted.error.message);
    if (verifs.error) console.error('[admin/users/[id]] verifications load failed:', verifs.error.message);

    return {
        profile: profile as any,
        facts: facts.get(id) ?? null,
        isPlatformAdmin: !!padmin.data,
        isMeetCoordinator: !!coord.data,
        memberships: ((memberships.data as any[]) ?? []) as any[],
        hosted: ((hosted.data as any[]) ?? []) as any[],
        verifs: ((verifs.data as any[]) ?? []) as any[],
        rsvps,
        eventById,
    };
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { profile: me } = await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const data = await loadAll(id);
    if (!data) {
        return (
            <>
                <div className="admin-empty">USER NOT FOUND</div>
                <Link href="/admin/users" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                    ‹ ALL USERS
                </Link>
            </>
        );
    }

    const { profile: p, facts, memberships, hosted, verifs, rsvps, eventById } = data;
    const auth = facts?.auth ?? null;
    const counts = facts?.counts;
    const n = (v: number | null | undefined) => (v == null ? '—' : String(v));
    const banned = !!auth?.bannedUntil && new Date(auth.bannedUntil).getTime() > Date.now();
    const hostStatus: string = p.host_status ?? 'none';

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">@{p.handle}</div>
                    <div className="admin-page-sub">
                        {String(p.display_name ?? '').toUpperCase()} · {p.kind === 'shop_page' ? 'SHOP PAGE' : 'USER'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link href="/admin/users" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                        ‹ ALL USERS
                    </Link>
                    <Link href={`/u/${p.handle}`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>
                        PUBLIC PROFILE ›
                    </Link>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 14px 0' }}>
                <span className={`admin-pill ${p.kind === 'shop_page' ? 'gold' : ''}`}>
                    {p.kind === 'shop_page' ? 'SHOP' : 'USER'}
                </span>
                {p.is_verified && <span className="admin-pill gold">✓ VERIFIED</span>}
                {hostStatus === 'verified' && <span className="admin-pill neon">VERIFIED HOST</span>}
                {hostStatus === 'pending' && <span className="admin-pill gold">HOST PENDING</span>}
                {data.isPlatformAdmin && <span className="admin-pill warn">GOD</span>}
                {data.isMeetCoordinator && <span className="admin-pill neon">MEET COORD</span>}
                {p.deleted_at && <span className="admin-pill warn">DELETED</span>}
                {p.deactivated_at && <span className="admin-pill warn">DEACTIVATED</span>}
                {banned && <span className="admin-pill warn">BANNED</span>}
                {auth && !auth.emailConfirmedAt && <span className="admin-pill">EMAIL UNCONFIRMED</span>}
            </div>

            <UserActions
                profileId={p.id}
                handle={p.handle}
                kind={p.kind}
                isVerified={!!p.is_verified}
                isPlatformAdmin={data.isPlatformAdmin}
                isMeetCoordinator={data.isMeetCoordinator}
                adminProfileId={me.profileId}
            />

            <div className="admin-stat-grid" style={{ marginTop: 20 }}>
                <Stat label="POSTS" value={n(counts?.posts)} />
                <Stat label="VEHICLES" value={n(counts?.vehicles)} />
                <Stat label="PLATES" value={n(counts?.plates)} />
                <Stat label="COINS" value={n(counts?.coins)} />
                <Stat label="FOLLOWERS" value={n(counts?.followers)} />
                <Stat label="FOLLOWING" value={n(counts?.following)} />
                <Stat label="RSVPS" value={n(counts?.rsvps)} />
                <Stat label="HOSTED" value={n(counts?.hosted)} />
            </div>

            <SectionHead title="ACCOUNT" sub="AUTH · SIGN-IN" />
            <div style={{ border: '1px solid var(--line)', padding: '4px 16px' }}>
                <table style={{ width: '100%' }}>
                    <tbody>
                        <Row label="EMAIL">{auth?.email ?? '—'}</Row>
                        <Row label="EMAIL CONFIRMED">{auth ? (auth.emailConfirmedAt ? stamp(auth.emailConfirmedAt) : 'NO') : '—'}</Row>
                        <Row label="ACCOUNT CREATED">{stampRel(auth?.createdAt ?? p.created_at)}</Row>
                        <Row label="LAST SIGN-IN">{stampRel(auth?.lastSignInAt)}</Row>
                        <Row label="SIGN-IN PROVIDER">
                            {auth?.provider ?? '—'}
                            {auth && auth.providers.length > 1 ? ` (${auth.providers.join(', ')})` : ''}
                        </Row>
                        <Row label="APP TAG">{auth?.appTag ?? '—'}</Row>
                        <Row label="BANNED UNTIL">{auth?.bannedUntil ? stamp(auth.bannedUntil) : '—'}</Row>
                        <Row label="IDS">
                            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all' }}>
                                profile {p.id}
                                {p.auth_user_id ? ` · auth ${p.auth_user_id}` : ''}
                            </span>
                        </Row>
                    </tbody>
                </table>
            </div>

            <SectionHead title="PROFILE" sub="PUBLIC FIELDS" />
            <div style={{ border: '1px solid var(--line)', padding: '4px 16px' }}>
                <table style={{ width: '100%' }}>
                    <tbody>
                        <Row label="AVATAR">
                            {p.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={p.avatar_url}
                                    alt=""
                                    width={64}
                                    height={64}
                                    style={{ objectFit: 'cover', border: '1px solid var(--line)' }}
                                />
                            ) : (
                                '—'
                            )}
                        </Row>
                        <Row label="BIO">
                            <span style={{ whiteSpace: 'pre-wrap' }}>{p.bio || '—'}</span>
                        </Row>
                        <Row label="LOCATION">{p.location || '—'}</Row>
                        <Row label="SECTOR">{p.sector_code || '—'}</Row>
                        <Row label="LEVEL">
                            {p.level != null ? `L${p.level}` : '—'}
                            {p.xp_total != null ? ` · ${p.xp_total} XP` : ''}
                        </Row>
                        <Row label="HOST STATUS">
                            {hostStatus.toUpperCase()}
                            {p.host_appointed_by_shop_id ? (
                                <>
                                    {' '}
                                    · nominated by{' '}
                                    <Link href={`/admin/shops/${p.host_appointed_by_shop_id}`} className="text-link">
                                        shop #{p.host_appointed_by_shop_id}
                                    </Link>
                                </>
                            ) : null}
                        </Row>
                        {p.kind === 'shop_page' && p.shop_id != null ? (
                            <Row label="SHOP">
                                <Link href={`/admin/shops/${p.shop_id}`} className="text-link">
                                    shop #{p.shop_id}
                                </Link>
                            </Row>
                        ) : null}
                    </tbody>
                </table>
            </div>

            <SectionHead title="SHOPS" sub={`${memberships.length} MEMBERSHIPS`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>SHOP</th>
                            <th>ROLE</th>
                            <th>JOINED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memberships.length === 0 ? (
                            <tr>
                                <td colSpan={3}>
                                    <div className="admin-empty">NOT ON ANY SHOP&rsquo;S STAFF</div>
                                </td>
                            </tr>
                        ) : (
                            memberships.map((m) => (
                                <tr key={m.shop_id}>
                                    <td>
                                        <Link href={`/admin/shops/${m.shop_id}`} className="text-link">
                                            {m.shop?.name ?? `Shop #${m.shop_id}`}
                                        </Link>
                                        {m.shop?.slug ? <div className="admin-handle">@{m.shop.slug}</div> : null}
                                    </td>
                                    <td>
                                        <span className="admin-pill">{String(m.role).toUpperCase()}</span>
                                    </td>
                                    <td>{stamp(m.created_at)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="EVENTS HOSTED" sub={`${hosted.length} SHOWN`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>EVENT</th>
                            <th>WHEN</th>
                            <th>FLAGS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {hosted.length === 0 ? (
                            <tr>
                                <td colSpan={3}>
                                    <div className="admin-empty">NO EVENTS HOSTED</div>
                                </td>
                            </tr>
                        ) : (
                            hosted.map((e) => (
                                <tr key={e.id}>
                                    <td>
                                        <Link href={`/admin/events/${e.id}`} className="text-link" style={{ fontWeight: 700 }}>
                                            {e.title}
                                        </Link>
                                        {e.code ? <div className="admin-handle">{e.code}</div> : null}
                                    </td>
                                    <td>{stamp(e.start_at)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {e.cancelled_at && <span className="admin-pill warn">CANCELLED</span>}
                                            {e.visibility === 'private' && <span className="admin-pill warn">PRIVATE</span>}
                                            {e.visibility === 'followers' && <span className="admin-pill">FOLLOWERS</span>}
                                            {e.shop_id != null && <span className="admin-pill gold">SHOP EVENT</span>}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="RSVPS" sub={`${rsvps.length} SHOWN · MOST RECENT FIRST`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>EVENT</th>
                            <th>STATUS</th>
                            <th>HOLD</th>
                            <th>SEATS</th>
                            <th>PAID</th>
                            <th>RSVPED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rsvps.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">NO RSVPS</div>
                                </td>
                            </tr>
                        ) : (
                            rsvps.map((r) => {
                                const ev = eventById.get(r.event_id);
                                return (
                                    <tr key={r.event_id}>
                                        <td>
                                            <Link href={`/admin/events/${r.event_id}`} className="text-link">
                                                {ev?.title ?? r.event_id}
                                            </Link>
                                            {ev?.cancelled_at ? (
                                                <span className="admin-pill warn" style={{ marginLeft: 6 }}>
                                                    CANCELLED
                                                </span>
                                            ) : null}
                                        </td>
                                        <td>
                                            <span className={RSVP_PILL[r.status] ?? 'admin-pill'}>
                                                {String(r.status).toUpperCase()}
                                            </span>
                                        </td>
                                        <td>{r.hold_state ? String(r.hold_state).toUpperCase() : '—'}</td>
                                        <td>{r.seats ?? '—'}</td>
                                        <td>
                                            {r.payment_ref ? (
                                                <a
                                                    href={`${MEDUSA_URL}/app/orders/${r.payment_ref}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-link"
                                                >
                                                    ORDER …{String(r.payment_ref).slice(-6)}
                                                </a>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td>{stamp(r.rsvped_at)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="VERIFICATION REQUESTS" sub={`${verifs.length} TOTAL`} />
            <div style={{ marginBottom: 8 }}>
                <Link href="/admin/verifications" className="admin-action-btn" style={{ textDecoration: 'none' }}>
                    OPEN VERIFICATION QUEUE ›
                </Link>
            </div>
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>KIND</th>
                            <th>STATE</th>
                            <th>WHY</th>
                            <th>REVIEW NOTE</th>
                            <th>CREATED</th>
                            <th>DECIDED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {verifs.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">NO VERIFICATION REQUESTS</div>
                                </td>
                            </tr>
                        ) : (
                            verifs.map((v) => {
                                const why = (v.payload as Record<string, unknown> | null)?.why;
                                return (
                                    <tr key={v.id}>
                                        <td>
                                            <span className="admin-pill">{String(v.kind).toUpperCase()}</span>
                                            {v.shop_id != null ? (
                                                <div className="admin-handle">
                                                    <Link href={`/admin/shops/${v.shop_id}`} className="text-link">
                                                        shop #{v.shop_id}
                                                    </Link>
                                                </div>
                                            ) : null}
                                        </td>
                                        <td>
                                            <span className={STATE_PILL[v.state] ?? 'admin-pill'}>
                                                {String(v.state).toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ maxWidth: 280 }}>
                                            {why ? (
                                                <span style={{ fontStyle: 'italic' }}>“{String(why)}”</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-3)' }}>No reason given</span>
                                            )}
                                        </td>
                                        <td style={{ maxWidth: 280 }}>{v.review_note || '—'}</td>
                                        <td>{stamp(v.created_at)}</td>
                                        <td>{stamp(v.decided_at)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
    return (
        <div className="admin-page-head" style={{ marginTop: 28, borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}>
            <div>
                <div className="admin-page-title" style={{ fontSize: 14 }}>
                    {title}
                </div>
                {sub ? <div className="admin-page-sub">{sub}</div> : null}
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className="admin-stat-num">{value}</div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <tr>
            <td style={LABEL_STYLE}>{label}</td>
            <td style={{ padding: '10px 0', fontSize: 14 }}>{children}</td>
        </tr>
    );
}
