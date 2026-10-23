/**
 * /admin/appeals — queue of ban appeals (rollout.user_ban_appeals, migration
 * 093). A banned member gets ONE free appeal per ban from /suspended; a human
 * decides it, ideally not the admin who issued the ban, within 5 business days.
 *
 * Authorization: requirePlatformAdmin() here AND in the console layout and every
 * action. Reads are service-role. Before 093 the table is absent and the page
 * says "Needs migration 093" instead of erroring.
 */
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { APPEAL_BUSINESS_DAYS, addBusinessDays, describeBanEnd, isBanSchemaMissing } from '@/lib/ban';
import { relativeTime } from '@/lib/admin-user-facts';
import { AppealActions } from './AppealActions';
import { AdminHead, Tabs, adminStyles as st, sentence } from '@/components/glide-admin/parts';

export const metadata = { title: 'Appeals' };
export const dynamic = 'force-dynamic';

const TABS = ['submitted', 'in_review', 'upheld', 'overturned', 'all'] as const;
type Tab = (typeof TABS)[number];
const LIMIT = 200;

const STATUS_PILL: Record<string, string> = {
    submitted: 'admin-pill warn',
    in_review: 'admin-pill gold',
    upheld: 'admin-pill',
    overturned: 'admin-pill neon',
};

const dim: React.CSSProperties = { color: 'var(--ink-2)' };

type Prof = { id: string; handle: string; display_name: string | null };

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

function uniq(xs: (string | null | undefined)[]): string[] {
    return [...new Set(xs.filter((x): x is string => !!x))];
}

async function load(tab: Tab) {
    const admin = getSupabaseAdmin();
    let q = admin
        .from('user_ban_appeals')
        .select(
            'id, ban_id, profile_id, body, contact_email, status, reviewer_profile_id, decided_by, decided_at, decision_note, decision_public_note, same_admin_override, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(LIMIT);
    if (tab !== 'all') q = q.eq('status', tab);
    const { data, error } = await q;
    if (error) {
        if (isBanSchemaMissing(error)) return { missing: true as const };
        console.error('[admin/appeals] load failed:', error.message);
        return { missing: false as const, failed: true as const };
    }
    const appeals = (data as any[]) ?? [];

    const banIds = uniq(appeals.map((a) => a.ban_id));
    const { data: banRows } = banIds.length
        ? await admin
              .from('user_bans')
              .select('id, banned_until, reason, public_note, actor_profile_id, created_at')
              .in('id', banIds)
        : { data: [] as any[] };
    const bans = new Map<string, any>(((banRows as any[]) ?? []).map((b) => [b.id, b]));

    const profileIds = uniq([
        ...appeals.map((a) => a.profile_id),
        ...appeals.map((a) => a.reviewer_profile_id),
        ...appeals.map((a) => a.decided_by),
        ...[...bans.values()].map((b) => b.actor_profile_id),
    ]);
    const { data: profs } = profileIds.length
        ? await admin.from('profiles').select('id, handle, display_name').in('id', profileIds)
        : { data: [] as Prof[] };
    const byId = new Map<string, Prof>(((profs as Prof[]) ?? []).map((p) => [p.id, p]));

    return { missing: false as const, failed: false as const, appeals, bans, byId };
}

async function loadCounts(): Promise<Record<Tab, number> | null> {
    const admin = getSupabaseAdmin();
    const statuses = ['submitted', 'in_review', 'upheld', 'overturned'] as const;
    const out: number[] = [];
    for (const s of statuses) {
        const { count, error } = await admin
            .from('user_ban_appeals')
            .select('*', { count: 'exact', head: true })
            .eq('status', s);
        if (error) return null;
        out.push(count ?? 0);
    }
    return {
        submitted: out[0],
        in_review: out[1],
        upheld: out[2],
        overturned: out[3],
        all: out.reduce((a, b) => a + b, 0),
    };
}

function UserLink({ p }: { p: Prof | null | undefined }) {
    if (!p) return <span style={dim}>unknown</span>;
    return (
        <Link href={`/admin/users/${p.id}`} className="text-link">
            @{p.handle}
        </Link>
    );
}

export default async function AppealsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
    const { profile: me } = await requirePlatformAdmin();
    const { status } = await searchParams;
    const tab: Tab = (TABS as readonly string[]).includes(status ?? '') ? (status as Tab) : 'submitted';

    const [result, counts] = await Promise.all([load(tab), loadCounts()]);

    if (result.missing) {
        return (
            <>
                <AdminHead title="Appeals" sub="Needs migration 093." />
                <div className="admin-empty">The appeals table arrives with migration 093.</div>
            </>
        );
    }
    if (result.failed) {
        return (
            <>
                <AdminHead title="Appeals" />
                <div className="admin-empty">Could not load appeals.</div>
            </>
        );
    }

    const { appeals, bans, byId } = result;
    const now = Date.now();

    return (
        <>
            <AdminHead
                title="Appeals"
                sub={`Ban appeals: one per ban, decided within ${APPEAL_BUSINESS_DAYS} business days. ${appeals.length} shown${appeals.length >= LIMIT ? ` (newest ${LIMIT})` : ''}.`}
            />

            <Tabs
                label="Filter by status"
                items={TABS.map((t) => ({
                    href: t === 'submitted' ? '/admin/appeals' : `/admin/appeals?status=${t}`,
                    label: sentence(t),
                    count: counts ? counts[t] : null,
                    current: t === tab,
                }))}
            />
            {appeals.length === 0 ? (
                <div className="admin-empty">
                    {tab === 'submitted'
                        ? 'No new appeals. All clear.'
                        : `No ${tab === 'all' ? '' : `${tab.replace('_', ' ')} `}appeals.`}
                </div>
            ) : (
                <div className={st.stack}>
                    {appeals.map((a: any) => {
                        const ban = bans.get(a.ban_id);
                        const member = byId.get(a.profile_id) ?? null;
                        const issuer = ban?.actor_profile_id ? (byId.get(ban.actor_profile_id) ?? null) : null;
                        const reviewer = a.reviewer_profile_id ? (byId.get(a.reviewer_profile_id) ?? null) : null;
                        const decider = a.decided_by ? (byId.get(a.decided_by) ?? null) : null;
                        const open = a.status === 'submitted' || a.status === 'in_review';
                        const due = addBusinessDays(new Date(a.created_at), APPEAL_BUSINESS_DAYS);
                        const overdue = open && due.getTime() < now;
                        return (
                            <article key={a.id} className={`${st.card} ${st.cardPad} ${st.stack}`} aria-label="Ban appeal">
                                <div className={st.chipRow}>
                                    <span className={STATUS_PILL[a.status] ?? 'admin-pill'}>{sentence(a.status)}</span>
                                    {overdue && <span className="admin-pill warn">Overdue</span>}
                                    <span className={st.meta}>
                                        <span>{relativeTime(a.created_at)}</span>
                                        <span>Submitted {stamp(a.created_at)} UTC</span>
                                        {open && <span>Due {stamp(due.toISOString()).slice(0, 10)}</span>}
                                    </span>
                                </div>

                                <div className={st.facts}>
                                    <div>
                                        <span style={dim}>Member </span>
                                        <UserLink p={member} />
                                        {member?.display_name ? <span style={dim}> · {member.display_name}</span> : null}
                                    </div>
                                    {ban && (
                                        <div>
                                            <span style={dim}>Ban </span>
                                            {describeBanEnd(ban.banned_until) === 'permanently'
                                                ? 'Permanent'
                                                : `Until ${stamp(ban.banned_until)}`}
                                            <span style={dim}> · issued {stamp(ban.created_at)} by </span>
                                            <UserLink p={issuer} />
                                        </div>
                                    )}
                                    {ban?.reason ? (
                                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                            <span style={dim}>Internal reason </span>
                                            {ban.reason}
                                        </div>
                                    ) : null}
                                    {ban?.public_note ? (
                                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                            <span style={dim}>Note shown to member </span>
                                            {ban.public_note}
                                        </div>
                                    ) : null}
                                    {a.contact_email ? (
                                        <div>
                                            <span style={dim}>Contact </span>
                                            {a.contact_email}
                                        </div>
                                    ) : null}
                                </div>

                                <div className={st.quote}>{a.body}</div>

                                {(reviewer || a.decided_at) && (
                                    <div className={st.small}>
                                        {reviewer ? (
                                            <>
                                                Reviewer <UserLink p={reviewer} />
                                            </>
                                        ) : null}
                                        {a.decided_at ? (
                                            <>
                                                {reviewer ? ' · ' : ''}
                                                Decided {stamp(a.decided_at)} UTC
                                                {decider ? (
                                                    <>
                                                        {' '}
                                                        by <UserLink p={decider} />
                                                    </>
                                                ) : null}
                                                {a.same_admin_override ? ' · same-admin override' : ''}
                                            </>
                                        ) : null}
                                        {a.decision_note ? ` · Note: ${a.decision_note}` : ''}
                                        {a.decision_public_note ? ` · Shown to member: ${a.decision_public_note}` : ''}
                                    </div>
                                )}

                                <AppealActions
                                    appealId={a.id}
                                    status={a.status}
                                    issuedByMe={!!ban?.actor_profile_id && ban.actor_profile_id === me.profileId}
                                />
                            </article>
                        );
                    })}
                </div>
            )}
        </>
    );
}
