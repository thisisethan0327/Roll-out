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
import { Check, ChevronRight, MessagesSquare, ShieldAlert, TriangleAlert, UserRound } from 'lucide-react';
import { AdminHead, DefList, SectionHead, Stat, adminStyles as a, sentence } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

export const metadata = { title: 'User · Detail' };
export const dynamic = 'force-dynamic';

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
                <AdminHead title="User not found" back={{ href: '/admin/users', label: 'All users' }} />
                <div className="admin-empty">No member has that id.</div>
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
            <AdminHead
                back={{ href: '/admin/users', label: 'All users' }}
                title={`@${p.handle}`}
                sub={`${p.display_name ?? ''} · ${p.kind === 'shop_page' ? 'Shop page' : 'Member'}`}
                actions={
                    <>
                        {p.kind === 'user' && (
                            <Link href={`/admin/users/${p.id}/messages`} className="admin-action-btn muted">
                                <MessagesSquare {...ic} /> Messages
                            </Link>
                        )}
                        <Link href={`/u/${p.handle}`} className="admin-action-btn muted">
                            <UserRound {...ic} /> Public profile
                        </Link>
                    </>
                }
            />

            <div className={a.chipRow}>
                <span className={`admin-pill ${p.kind === 'shop_page' ? 'gold' : ''}`}>
                    {p.kind === 'shop_page' ? 'Shop' : 'User'}
                </span>
                {p.is_verified && <span className="admin-pill gold"><Check {...ic} /> Verified</span>}
                {hostStatus === 'verified' && <span className="admin-pill neon">Verified host</span>}
                {hostStatus === 'pending' && <span className="admin-pill gold">Host pending</span>}
                {data.isPlatformAdmin && <span className="admin-pill warn">God mode</span>}
                {data.isMeetCoordinator && <span className="admin-pill neon">Meet coordinator</span>}
                {p.deleted_at && <span className="admin-pill warn">Deleted</span>}
                {p.deactivated_at && <span className="admin-pill warn">Deactivated</span>}
                {banned && <span className="admin-pill warn">Banned</span>}
                {authLocked && <span className="admin-pill warn">Auth locked</span>}
                {auth && !auth.emailConfirmedAt && <span className="admin-pill">Email unconfirmed</span>}
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
                upcomingPaidRsvps={upcomingRsvps.filter((r) => !!r.payment_ref).length}
            />

            {banned && (
                <div className="admin-login-error" role="status">
                    <ShieldAlert size={18} strokeWidth={2} aria-hidden="true" className={a.dangerIc} />
                    <span>
                        Banned {describeBanEnd(p.banned_until)}
                        {latestBan?.actor_profile_id
                            ? ` · by @${actorHandles.get(latestBan.actor_profile_id) ?? 'unknown'}`
                            : ''}
                        {latestBan?.reason ? ` · ${latestBan.reason}` : ''}
                    </span>
                </div>
            )}

            {p.kind === 'user' && (upcomingRsvps.length > 0 || upcomingHosted.length > 0) && (
                <div className={`${a.card} ${a.cardPad} ${a.stack}`}>
                    <p className={a.small} style={{ margin: 0, color: 'var(--ink)' }}>
                        <b>Upcoming commitments.</b> A permanent ban cancels and refunds upcoming paid tickets (unless an
                        admin withheld the refund) and releases free RSVPs. A temporary ban keeps them and the member can
                        request a refund. Hosted events are never touched: handle them with the event tools. Refund state is
                        under Ticket refunds below.
                    </p>
                    {upcomingHosted.length > 0 && (
                        <div className={a.small}>
                            <b className={a.k}>Hosting ({upcomingHosted.length}):</b>{' '}
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
                        <div className={a.small}>
                            <b className={a.k}>RSVPed ({upcomingRsvps.length}):</b>{' '}
                            {upcomingRsvps.map((r, i) => {
                                const ev = eventById.get(r.event_id);
                                return (
                                    <span key={r.event_id}>
                                        {i > 0 ? ' · ' : ''}
                                        <Link href={`/admin/events/${r.event_id}`} className="text-link">
                                            {ev?.title ?? r.event_id}
                                        </Link>{' '}
                                        ({stamp(ev?.start_at).slice(0, 10)}
                                        {r.payment_ref ? ', paid' : ''})
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="admin-stat-grid">
                <Stat label="Posts" value={n(counts?.posts)} />
                <Stat label="Vehicles" value={n(counts?.vehicles)} />
                <Stat label="Plates" value={n(counts?.plates)} />
                <Stat label="Coins" value={n(counts?.coins)} />
                <Stat label="Followers" value={n(counts?.followers)} />
                <Stat label="Following" value={n(counts?.following)} />
                <Stat label="RSVPs" value={n(counts?.rsvps)} />
                <Stat label="Hosted" value={n(counts?.hosted)} />
            </div>

            <SectionHead title="Account" sub="Auth and sign-in." />
            <DefList
                label="Account"
                rows={[
                    { k: 'Email', v: auth?.email ?? '—' },
                    { k: 'Email confirmed', v: auth ? (auth.emailConfirmedAt ? stamp(auth.emailConfirmedAt) : 'No') : '—' },
                    { k: 'Account created', v: stampRel(auth?.createdAt ?? p.created_at) },
                    { k: 'Last sign-in', v: stampRel(auth?.lastSignInAt) },
                    {
                        k: 'Sign-in provider',
                        v: (
                            <>
                                {auth?.provider ?? '—'}
                                {auth && auth.providers.length > 1 ? ` (${auth.providers.join(', ')})` : ''}
                            </>
                        ),
                    },
                    { k: 'App tag', v: auth?.appTag ?? '—' },
                    { k: 'Auth locked until', v: auth?.bannedUntil ? stamp(auth.bannedUntil) : '—' },
                    {
                        k: 'Rollout ban',
                        v: !banReady ? 'Needs migration 091' : banned ? `Banned ${describeBanEnd(p.banned_until)}` : '—',
                    },
                    {
                        k: 'IDs',
                        v: (
                            <span className={a.mono}>
                                profile {p.id}
                                {p.auth_user_id ? ` · auth ${p.auth_user_id}` : ''}
                            </span>
                        ),
                    },
                ]}
            />

            <SectionHead title="Profile" sub="Public fields." />
            <DefList
                label="Profile"
                rows={[
                    {
                        k: 'Avatar',
                        v: p.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={p.avatar_url}
                                alt=""
                                width={64}
                                height={64}
                                style={{ objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                            />
                        ) : (
                            '—'
                        ),
                    },
                    { k: 'Bio', v: <span style={{ whiteSpace: 'pre-wrap' }}>{p.bio || '—'}</span> },
                    { k: 'Location', v: p.location || '—' },
                    { k: 'Sector', v: p.sector_code || '—' },
                    {
                        k: 'Level',
                        v: (
                            <>
                                {p.level != null ? `L${p.level}` : '—'}
                                {p.xp_total != null ? ` · ${p.xp_total} XP` : ''}
                            </>
                        ),
                    },
                    {
                        k: 'Host status',
                        v: (
                            <>
                                {sentence(hostStatus)}
                                {p.host_appointed_by_shop_id ? (
                                    <>
                                        {' '}
                                        · nominated by{' '}
                                        <Link href={`/admin/shops/${p.host_appointed_by_shop_id}`} className="text-link">
                                            shop #{p.host_appointed_by_shop_id}
                                        </Link>
                                    </>
                                ) : null}
                            </>
                        ),
                    },
                    ...(p.kind === 'shop_page' && p.shop_id != null
                        ? [
                              {
                                  k: 'Shop',
                                  v: (
                                      <Link href={`/admin/shops/${p.shop_id}`} className="text-link">
                                          shop #{p.shop_id}
                                      </Link>
                                  ),
                              },
                          ]
                        : []),
                ]}
            />

            <SectionHead title="Shops" sub={`${memberships.length} memberships.`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Shop</th>
                            <th>Role</th>
                            <th>Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memberships.length === 0 ? (
                            <tr>
                                <td colSpan={3}>
                                    <div className="admin-empty">Not on any shop&rsquo;s staff.</div>
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
                                        <span className="admin-pill">{sentence(m.role)}</span>
                                    </td>
                                    <td className={a.time}>{stamp(m.created_at)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="Events hosted" sub={`${hosted.length} shown.`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>When</th>
                            <th>Flags</th>
                        </tr>
                    </thead>
                    <tbody>
                        {hosted.length === 0 ? (
                            <tr>
                                <td colSpan={3}>
                                    <div className="admin-empty">No events hosted.</div>
                                </td>
                            </tr>
                        ) : (
                            hosted.map((e) => (
                                <tr key={e.id}>
                                    <td>
                                        <Link href={`/admin/events/${e.id}`} className="text-link">
                                            {e.title}
                                        </Link>
                                        {e.code ? <div className="admin-handle">{e.code}</div> : null}
                                    </td>
                                    <td className={a.time}>{stamp(e.start_at)}</td>
                                    <td>
                                        <div className={a.chipRow}>
                                            {e.cancelled_at && <span className="admin-pill warn">Cancelled</span>}
                                            {e.visibility === 'private' && <span className="admin-pill warn">Private</span>}
                                            {e.visibility === 'followers' && <span className="admin-pill">Followers</span>}
                                            {e.shop_id != null && <span className="admin-pill gold">Shop event</span>}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="RSVPs" sub={`${rsvps.length} shown, most recent first.`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Status</th>
                            <th>Hold</th>
                            <th>Seats</th>
                            <th>Paid</th>
                            <th>RSVPed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rsvps.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">No RSVPs.</div>
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
                                                    Cancelled
                                                </span>
                                            ) : null}
                                        </td>
                                        <td>
                                            <span className={RSVP_PILL[r.status] ?? 'admin-pill'}>{sentence(r.status)}</span>
                                        </td>
                                        <td>{r.hold_state ? sentence(r.hold_state) : '—'}</td>
                                        <td>{r.seats ?? '—'}</td>
                                        <td>
                                            {r.payment_ref ? (
                                                <a
                                                    href={`${MEDUSA_URL}/app/orders/${r.payment_ref}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-link"
                                                >
                                                    Order …{String(r.payment_ref).slice(-6)}
                                                </a>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className={a.time}>{stamp(r.rsvped_at)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="Tickets" sub={`${tickets.length} shown, bought or held by this member.`} />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Seat</th>
                            <th>Role</th>
                            <th>Attendee</th>
                            <th>Status</th>
                            <th>Checked in</th>
                            <th>Created</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickets.length === 0 ? (
                            <tr>
                                <td colSpan={8}>
                                    <div className="admin-empty">No tickets.</div>
                                </td>
                            </tr>
                        ) : (
                            tickets.map((t) => {
                                const ev = eventById.get(t.event_id);
                                const roles = [
                                    t.purchaser_profile_id === p.id ? 'Buyer' : null,
                                    t.attendee_profile_id === p.id ? 'Attendee' : null,
                                ].filter(Boolean);
                                return (
                                    <tr key={t.id}>
                                        <td>
                                            <Link href={`/admin/events/${t.event_id}`} className="text-link">
                                                {ev?.title ?? t.event_id}
                                            </Link>
                                            {ev?.cancelled_at ? (
                                                <span className="admin-pill warn" style={{ marginLeft: 6 }}>
                                                    Cancelled
                                                </span>
                                            ) : null}
                                        </td>
                                        <td>{t.seat ?? '—'}</td>
                                        <td>{roles.join(' + ') || '—'}</td>
                                        <td>{t.attendee_name || '—'}</td>
                                        <td>
                                            <span className="admin-pill">{sentence(t.status) || '—'}</span>
                                        </td>
                                        <td className={a.time}>{t.checked_in_at ? stamp(t.checked_in_at) : '—'}</td>
                                        <td className={a.time}>{stamp(t.created_at)}</td>
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
                title="Ban history"
                sub={banReady ? `${bans.length} entries. Rollout only.` : 'Needs migration 091.'}
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>When</th>
                            <th>Action</th>
                            <th>Until</th>
                            <th>By</th>
                            <th>Reason</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bans.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">
                                        {banReady ? 'No bans on record.' : 'Needs migration 091.'}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            bans.map((b) => (
                                <tr key={b.id}>
                                    <td className={a.time}>{stamp(b.created_at)}</td>
                                    <td>
                                        <span className={b.action === 'ban' ? 'admin-pill warn' : 'admin-pill neon'}>
                                            {sentence(b.action)}
                                        </span>
                                    </td>
                                    <td className={a.time}>
                                        {b.action === 'ban'
                                            ? describeBanEnd(b.banned_until) === 'permanently'
                                                ? 'Permanent'
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
                        title="Appeal"
                        sub={
                            appealsReady
                                ? `${appeals.length} on record. One per ban, decided within ${APPEAL_BUSINESS_DAYS} business days.`
                                : 'Needs migration 093.'
                        }
                    />
                    {!appealsReady ? (
                        <div className="admin-empty">Needs migration 093.</div>
                    ) : (
                        <div className={a.stack}>
                            {appeals.map((ap) => {
                                const open = ap.status === 'submitted' || ap.status === 'in_review';
                                const due = addBusinessDays(new Date(ap.created_at), APPEAL_BUSINESS_DAYS);
                                return (
                                    <div key={ap.id} className={`${a.card} ${a.cardPad} ${a.stack}`}>
                                        <div className={a.chipRow}>
                                            <span
                                                className={
                                                    ap.status === 'overturned'
                                                        ? 'admin-pill neon'
                                                        : ap.status === 'upheld'
                                                          ? 'admin-pill'
                                                          : 'admin-pill warn'
                                                }
                                            >
                                                {sentence(ap.status)}
                                            </span>
                                            {open && due.getTime() < Date.now() && <span className="admin-pill warn">Overdue</span>}
                                            <span className={a.meta}>
                                                <span>Submitted {stamp(ap.created_at)} UTC</span>
                                                {open && <span>Due {stamp(due.toISOString()).slice(0, 10)}</span>}
                                            </span>
                                        </div>
                                        <div className={a.quote}>{ap.body}</div>
                                        <div className={a.small}>
                                            {ap.contact_email ? `Contact ${ap.contact_email} · ` : ''}
                                            {ap.reviewer_profile_id ? `Reviewer @${actorHandles.get(ap.reviewer_profile_id) ?? '—'} · ` : ''}
                                            {ap.decided_at
                                                ? `Decided ${stamp(ap.decided_at)} UTC by @${actorHandles.get(ap.decided_by) ?? '—'}${ap.same_admin_override ? ' (same-admin override)' : ''}`
                                                : 'Not decided'}
                                            {ap.decision_note ? ` · Note: ${ap.decision_note}` : ''}
                                            {ap.decision_public_note ? ` · Shown to member: ${ap.decision_public_note}` : ''}
                                        </div>
                                        {open && (
                                            <div>
                                                <Link href="/admin/appeals" className="admin-action-btn">
                                                    Decide in the appeals queue <ChevronRight {...ic} />
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
                        title="Ticket refunds"
                        sub={`${refundRows.length} rows in the ban refund ledger.${dryRunMode ? ' Dry run mode is on: nothing is sent to payments.' : ''}`}
                    />
                    {dryRunMode && (
                        <div className="admin-login-error">
                            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
                            BAN_REFUND_DRY_RUN=1: runs only mark rows skipped. No money moves.
                        </div>
                    )}
                    <BanRefundControls
                        banId={latestBanId}
                        runnableCount={banned ? runnableForLatest : 0}
                        banned={banned}
                        handle={p.handle}
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

            <SectionHead
                title="Verification requests"
                sub={`${verifs.length} total.`}
                action={
                    <Link href="/admin/verifications" className="admin-action-btn">
                        Open verification queue <ChevronRight {...ic} />
                    </Link>
                }
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Kind</th>
                            <th>State</th>
                            <th>Why</th>
                            <th>Review note</th>
                            <th>Created</th>
                            <th>Decided</th>
                        </tr>
                    </thead>
                    <tbody>
                        {verifs.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">No verification requests.</div>
                                </td>
                            </tr>
                        ) : (
                            verifs.map((v) => {
                                const why = (v.payload as Record<string, unknown> | null)?.why;
                                return (
                                    <tr key={v.id}>
                                        <td>
                                            <span className="admin-pill">{sentence(v.kind)}</span>
                                            {v.shop_id != null ? (
                                                <div className="admin-handle">
                                                    <Link href={`/admin/shops/${v.shop_id}`} className="text-link">
                                                        shop #{v.shop_id}
                                                    </Link>
                                                </div>
                                            ) : null}
                                        </td>
                                        <td>
                                            <span className={STATE_PILL[v.state] ?? 'admin-pill'}>{sentence(v.state)}</span>
                                        </td>
                                        <td style={{ maxWidth: 280 }}>
                                            {why ? <span>“{String(why)}”</span> : <span className={a.small}>No reason given</span>}
                                        </td>
                                        <td style={{ maxWidth: 280 }}>{v.review_note || '—'}</td>
                                        <td className={a.time}>{stamp(v.created_at)}</td>
                                        <td className={a.time}>{stamp(v.decided_at)}</td>
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
                        title="Admin activity"
                        sub={`${audit.about.rows.length} shown: actions taken on this member by Rollout admins.`}
                    />
                    <AdminAuditTable result={audit.about} />
                    {audit.by.rows.length > 0 && (
                        <>
                            <SectionHead
                                title="Actions by this member as admin"
                                sub={`${audit.by.rows.length} shown, most recent first.`}
                            />
                            <AdminAuditTable result={audit.by} showActor={false} />
                        </>
                    )}
                </>
            )}
        </>
    );
}
