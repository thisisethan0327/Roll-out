/**
 * /admin/users/[id] — platform-admin detail view of ONE member (id =
 * rollout.profiles.id): account, profile, activity, shops, events, RSVPs and
 * verification history. Read-only apart from the shared account actions and the
 * Rollout ban controls (profiles.banned_until + rollout.user_bans, migration 091;
 * every ban read here tolerates 091 not being applied yet).
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
import { TicketRefundButton } from '@/app/admin/(event)/events/[id]/RowActions';
import { BanRefundControls } from './BanRefundControls';
import { APPEAL_BUSINESS_DAYS, addBusinessDays } from '@/lib/ban';
import { REFUNDING_STALE_MS } from '@/lib/ban-refunds';
import { isBanSchemaMissing, isBannedUntil, describeBanEnd } from '@/lib/ban';
import { loadAuditForProfile } from '@/lib/admin-audit';
import { AdminAuditTable } from '@/components/AdminAuditTable';

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

    // Tickets this member bought or holds (migration 080). Fails soft before 080.
    let tickets: any[] = [];
    const tkRes = await admin
        .from('event_tickets')
        .select('id, event_id, order_id, seat, status, attendee_name, purchaser_profile_id, attendee_profile_id, checked_in_at, created_at')
        .or(`purchaser_profile_id.eq.${id},attendee_profile_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(100);
    if (tkRes.error) {
        if (tkRes.error.code !== 'PGRST205' && tkRes.error.code !== '42P01') {
            console.error('[admin/users/[id]] tickets load failed:', tkRes.error.message);
        }
    } else {
        tickets = (tkRes.data as any[]) ?? [];
        const missing = [...new Set(tickets.map((t) => t.event_id as string))].filter((e) => !eventById.has(e));
        if (missing.length) {
            const { data: evs } = await admin
                .from('events')
                .select('id, code, title, start_at, cancelled_at')
                .in('id', missing);
            for (const e of (evs as any[]) ?? []) eventById.set(e.id, e);
        }
    }

    // Rollout ban history (migration 091). A missing table = 091 not applied.
    let bans: any[] = [];
    let banHistoryReady = true;
    const banRes = await admin
        .from('user_bans')
        .select('id, action, banned_until, reason, public_note, actor_profile_id, created_at')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(100);
    if (banRes.error) {
        banHistoryReady = false;
        if (!isBanSchemaMissing(banRes.error)) {
            console.error('[admin/users/[id]] ban history load failed:', banRes.error.message);
        }
    } else {
        bans = (banRes.data as any[]) ?? [];
    }
    // Part 2 (migration 093): appeals and the refund ledger. Both fail soft.
    let appeals: any[] = [];
    let appealsReady = true;
    const apRes = await admin
        .from('user_ban_appeals')
        .select(
            'id, ban_id, body, contact_email, status, reviewer_profile_id, decided_by, decided_at, decision_note, decision_public_note, same_admin_override, created_at',
        )
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
    if (apRes.error) {
        appealsReady = false;
        if (!isBanSchemaMissing(apRes.error)) {
            console.error('[admin/users/[id]] appeals load failed:', apRes.error.message);
        }
    } else {
        appeals = (apRes.data as any[]) ?? [];
    }
    let refundRows: any[] = [];
    let refundsReady = true;
    const brRes = await admin
        .from('ban_refunds')
        .select(
            'id, ban_id, kind, order_id, ticket_id, event_id, amount_cents, status, refund_ref, error, attempts, last_attempt_at, requested_at, note, created_at',
        )
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(200);
    if (brRes.error) {
        refundsReady = false;
        if (!isBanSchemaMissing(brRes.error)) {
            console.error('[admin/users/[id]] ban refunds load failed:', brRes.error.message);
        }
    } else {
        refundRows = (brRes.data as any[]) ?? [];
        const missingEv = [...new Set(refundRows.map((r) => r.event_id as string | null).filter((e): e is string => !!e))].filter(
            (e) => !eventById.has(e),
        );
        if (missingEv.length) {
            const { data: evs } = await admin
                .from('events')
                .select('id, code, title, start_at, cancelled_at')
                .in('id', missingEv);
            for (const e of (evs as any[]) ?? []) eventById.set(e.id, e);
        }
    }
    const actorHandles = new Map<string, string>();
    const actorIds = [
        ...new Set(
            [
                ...bans.map((b) => b.actor_profile_id),
                ...appeals.map((a) => a.reviewer_profile_id),
                ...appeals.map((a) => a.decided_by),
            ].filter(Boolean),
        ),
    ] as string[];
    if (actorIds.length) {
        const { data: actors } = await admin.from('profiles').select('id, handle').in('id', actorIds);
        for (const a of (actors as any[]) ?? []) actorHandles.set(a.id, a.handle);
    }
    // select('*') returns banned_until whenever the column exists (null included).
    const banColumnPresent = Object.prototype.hasOwnProperty.call(profile, 'banned_until');

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
        tickets,
        eventById,
        bans,
        actorHandles,
        appeals,
        appealsReady,
        refundRows,
        refundsReady,
        banReady: banColumnPresent && banHistoryReady,
    };
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { profile: me } = await requirePlatformAdmin();
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const [data, audit] = await Promise.all([loadAll(id), loadAuditForProfile(id)]);
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

    const { profile: p, facts, memberships, hosted, verifs, rsvps, tickets, eventById } = data;
    const auth = facts?.auth ?? null;
    const counts = facts?.counts;
    const n = (v: number | null | undefined) => (v == null ? '—' : String(v));
    // Two different locks: `banned` is the ROLLOUT ban (profiles.banned_until);
    // `authLocked` is Supabase auth's own banned_until (blocks sign-in on every app).
    const banned = isBannedUntil(p.banned_until);
    const authLocked = !!auth?.bannedUntil && new Date(auth.bannedUntil).getTime() > Date.now();
    const { bans, actorHandles, banReady, appeals, appealsReady, refundRows, refundsReady } = data;
    const dryRunMode = process.env.BAN_REFUND_DRY_RUN === '1';
    const latestBan = bans.find((b) => b.action === 'ban') ?? null;
    const latestBanId: string | null = latestBan?.id ?? null;
    const runnableForLatest = refundRows.filter(
        (r) => r.ban_id === latestBanId && (r.status === 'pending' || r.status === 'skipped'),
    ).length;
    const nowMs = Date.now();
    const upcomingRsvps = rsvps.filter((r) => {
        const ev = eventById.get(r.event_id);
        return (
            (r.status === 'going' || r.status === 'waitlist') &&
            ev &&
            !ev.cancelled_at &&
            ev.start_at &&
            new Date(ev.start_at).getTime() > nowMs
        );
    });
    const upcomingHosted = hosted.filter((e) => !e.cancelled_at && e.start_at && new Date(e.start_at).getTime() > nowMs);
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
                    {p.kind === 'user' && (
                        <Link
                            href={`/admin/users/${p.id}/messages`}
                            className="admin-action-btn muted"
                            style={{ textDecoration: 'none' }}
                        >
                            MESSAGES ›
                        </Link>
                    )}
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
                {authLocked && <span className="admin-pill warn">AUTH LOCKED</span>}
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
                isBanned={banned}
                banReady={banReady}
            />

            {banned && (
                <div className="admin-login-error" style={{ marginTop: 12 }}>
                    BANNED {describeBanEnd(p.banned_until).toUpperCase()}
                    {latestBan?.actor_profile_id
                        ? ` · by @${actorHandles.get(latestBan.actor_profile_id) ?? 'unknown'}`
                        : ''}
                    {latestBan?.reason ? ` · ${latestBan.reason}` : ''}
                </div>
            )}

            {p.kind === 'user' && (upcomingRsvps.length > 0 || upcomingHosted.length > 0) && (
                <div style={{ border: '1px solid var(--line)', padding: '12px 16px', marginTop: 12, fontSize: 13 }}>
                    <div className="admin-page-sub" style={{ marginBottom: 8 }}>
                        UPCOMING COMMITMENTS · PERMANENT BAN: PAID TICKETS ARE CANCELLED AND REFUNDED · TEMPORARY BAN: KEPT
                    </div>
                    <div style={{ color: 'var(--text-2)', marginBottom: 8 }}>
                        A permanent ban cancels and refunds upcoming paid tickets (unless an admin withheld the refund) and
                        releases free RSVPs. A temporary ban keeps them and the member can request a refund. Hosted events
                        are never touched: handle them with the event tools. Refund state is under TICKET REFUNDS below.
                    </div>
                    {upcomingHosted.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                            <b>HOSTING ({upcomingHosted.length}):</b>{' '}
                            {upcomingHosted.map((e, i) => (
                                <span key={e.id}>
                                    {i > 0 ? ' · ' : ''}
                                    <Link href={`/admin/events/${e.id}`} className="text-link">
                                        {e.title}
                                    </Link>{' '}
                                    ({stamp(e.start_at).slice(0, 10)})
                                </span>
                            ))}
                        </div>
                    )}
                    {upcomingRsvps.length > 0 && (
                        <div>
                            <b>RSVPED ({upcomingRsvps.length}):</b>{' '}
                            {upcomingRsvps.map((r, i) => {
                                const ev = eventById.get(r.event_id);
                                return (
                                    <span key={r.event_id}>
                                        {i > 0 ? ' · ' : ''}
                                        <Link href={`/admin/events/${r.event_id}`} className="text-link">
                                            {ev?.title ?? r.event_id}
                                        </Link>{' '}
                                        ({stamp(ev?.start_at).slice(0, 10)}
                                        {r.payment_ref ? ', PAID' : ''})
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

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
                        <Row label="AUTH LOCKED UNTIL">{auth?.bannedUntil ? stamp(auth.bannedUntil) : '—'}</Row>
                        <Row label="ROLLOUT BAN">
                            {!banReady
                                ? 'Needs migration 091'
                                : banned
                                  ? `Banned ${describeBanEnd(p.banned_until)}`
                                  : '—'}
                        </Row>
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

            <SectionHead title="TICKETS" sub={`${tickets.length} SHOWN · BOUGHT OR HELD BY THIS MEMBER`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>EVENT</th>
                            <th>SEAT</th>
                            <th>ROLE</th>
                            <th>ATTENDEE</th>
                            <th>STATUS</th>
                            <th>CHECKED IN</th>
                            <th>CREATED</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickets.length === 0 ? (
                            <tr>
                                <td colSpan={8}>
                                    <div className="admin-empty">NO TICKETS</div>
                                </td>
                            </tr>
                        ) : (
                            tickets.map((t) => {
                                const ev = eventById.get(t.event_id);
                                const roles = [
                                    t.purchaser_profile_id === p.id ? 'BUYER' : null,
                                    t.attendee_profile_id === p.id ? 'ATTENDEE' : null,
                                ].filter(Boolean);
                                return (
                                    <tr key={t.id}>
                                        <td>
                                            <Link href={`/admin/events/${t.event_id}`} className="text-link">
                                                {ev?.title ?? t.event_id}
                                            </Link>
                                            {ev?.cancelled_at ? (
                                                <span className="admin-pill warn" style={{ marginLeft: 6 }}>
                                                    CANCELLED
                                                </span>
                                            ) : null}
                                        </td>
                                        <td>{t.seat ?? '—'}</td>
                                        <td>{roles.join(' + ') || '—'}</td>
                                        <td>{t.attendee_name || '—'}</td>
                                        <td>
                                            <span className="admin-pill">{String(t.status ?? '').toUpperCase() || '—'}</span>
                                        </td>
                                        <td>{t.checked_in_at ? stamp(t.checked_in_at) : '—'}</td>
                                        <td>{stamp(t.created_at)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {t.status === 'confirmed' && t.order_id && t.purchaser_profile_id === p.id ? (
                                                <TicketRefundButton eventId={t.event_id} ticketId={t.id} />
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead
                title="BAN HISTORY"
                sub={banReady ? `${bans.length} ENTRIES · ROLLOUT ONLY` : 'NEEDS MIGRATION 091'}
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>ACTION</th>
                            <th>UNTIL</th>
                            <th>BY</th>
                            <th>REASON</th>
                            <th>NOTE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bans.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">
                                        {banReady ? 'NO BANS ON RECORD' : 'NEEDS MIGRATION 091'}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            bans.map((b) => (
                                <tr key={b.id}>
                                    <td>{stamp(b.created_at)}</td>
                                    <td>
                                        <span className={b.action === 'ban' ? 'admin-pill warn' : 'admin-pill neon'}>
                                            {String(b.action).toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {b.action === 'ban'
                                            ? describeBanEnd(b.banned_until) === 'permanently'
                                                ? 'PERMANENT'
                                                : stamp(b.banned_until)
                                            : '—'}
                                    </td>
                                    <td>{b.actor_profile_id ? `@${actorHandles.get(b.actor_profile_id) ?? '—'}` : '—'}</td>
                                    <td style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{b.reason || '—'}</td>
                                    <td style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{b.public_note || '—'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* APPEAL (migration 093; hidden when never banned, notes the migration otherwise) */}
            {(appeals.length > 0 || (bans.length > 0 && !appealsReady)) && (
                <>
                    <SectionHead
                        title="APPEAL"
                        sub={
                            appealsReady
                                ? `${appeals.length} ON RECORD · ONE PER BAN · DECIDE WITHIN ${APPEAL_BUSINESS_DAYS} BUSINESS DAYS`
                                : 'NEEDS MIGRATION 093'
                        }
                    />
                    {!appealsReady ? (
                        <div className="admin-empty">NEEDS MIGRATION 093</div>
                    ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                            {appeals.map((a) => {
                                const open = a.status === 'submitted' || a.status === 'in_review';
                                const due = addBusinessDays(new Date(a.created_at), APPEAL_BUSINESS_DAYS);
                                return (
                                    <div key={a.id} className="feature-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
                                        <div className="mono-row" style={{ fontSize: 11 }}>
                                            <span
                                                className={
                                                    a.status === 'overturned'
                                                        ? 'admin-pill neon'
                                                        : a.status === 'upheld'
                                                          ? 'admin-pill'
                                                          : 'admin-pill warn'
                                                }
                                            >
                                                {String(a.status).replace('_', ' ').toUpperCase()}
                                            </span>
                                            {open && due.getTime() < Date.now() && <span className="admin-pill warn">OVERDUE</span>}
                                            <span className="sep" />
                                            <span>SUBMITTED {stamp(a.created_at)} UTC</span>
                                            {open && (
                                                <>
                                                    <span className="sep" />
                                                    <span>DUE {stamp(due.toISOString()).slice(0, 10)}</span>
                                                </>
                                            )}
                                        </div>
                                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14 }}>{a.body}</div>
                                        <div className="admin-page-sub">
                                            {a.contact_email ? `CONTACT ${a.contact_email} · ` : ''}
                                            {a.reviewer_profile_id ? `REVIEWER @${actorHandles.get(a.reviewer_profile_id) ?? '—'} · ` : ''}
                                            {a.decided_at
                                                ? `DECIDED ${stamp(a.decided_at)} UTC BY @${actorHandles.get(a.decided_by) ?? '—'}${a.same_admin_override ? ' (SAME-ADMIN OVERRIDE)' : ''}`
                                                : 'NOT DECIDED'}
                                            {a.decision_note ? ` · NOTE: ${a.decision_note}` : ''}
                                            {a.decision_public_note ? ` · SHOWN TO MEMBER: ${a.decision_public_note}` : ''}
                                        </div>
                                        {open && (
                                            <div>
                                                <Link href="/admin/appeals" className="admin-action-btn" style={{ textDecoration: 'none' }}>
                                                    DECIDE IN THE APPEALS QUEUE ›
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* TICKET REFUNDS (migration 093; hidden before it) */}
            {refundsReady && refundRows.length > 0 && (
                <>
                    <SectionHead
                        title="TICKET REFUNDS"
                        sub={`${refundRows.length} ROWS · BAN REFUND LEDGER${dryRunMode ? ' · DRY RUN MODE ON: NOTHING IS SENT TO PAYMENTS' : ''}`}
                    />
                    {dryRunMode && (
                        <div className="admin-login-error" style={{ marginBottom: 10 }}>
                            BAN_REFUND_DRY_RUN=1: runs only mark rows SKIPPED. No money moves.
                        </div>
                    )}
                    <BanRefundControls
                        banId={latestBanId}
                        runnableCount={banned ? runnableForLatest : 0}
                        banned={banned}
                        staleBeforeIso={new Date(Date.now() - REFUNDING_STALE_MS).toISOString()}
                        rows={refundRows.map((r) => {
                            const ev = r.event_id ? eventById.get(r.event_id) : null;
                            return {
                                id: r.id,
                                banId: r.ban_id,
                                kind: r.kind,
                                orderId: r.order_id,
                                eventId: r.event_id,
                                eventTitle: ev?.title ?? null,
                                amountCents: r.amount_cents,
                                status: r.status,
                                error: r.error,
                                attempts: r.attempts ?? 0,
                                lastAttemptAt: r.last_attempt_at,
                                requestedAt: r.requested_at,
                                note: r.note,
                                createdAt: r.created_at,
                            };
                        })}
                    />
                </>
            )}

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
            {/* ADMIN ACTIVITY (platform admins only; hidden before migration 092) */}
            {!audit.about.missing && (
                <>
                    <SectionHead
                        title="ADMIN ACTIVITY"
                        sub={`${audit.about.rows.length} SHOWN · ACTIONS TAKEN ON THIS MEMBER BY ROLLOUT ADMINS`}
                    />
                    <AdminAuditTable result={audit.about} />
                    {audit.by.rows.length > 0 && (
                        <>
                            <SectionHead
                                title="ACTIONS BY THIS MEMBER AS ADMIN"
                                sub={`${audit.by.rows.length} SHOWN · MOST RECENT FIRST`}
                            />
                            <AdminAuditTable result={audit.by} showActor={false} />
                        </>
                    )}
                </>
            )}
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
