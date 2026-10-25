import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { DismissButton } from './DismissButton';
import PulseSection from './PulseSection';
import LauncherSection from './LauncherSection';
import { ChevronRight, CircleAlert } from 'lucide-react';
import { AdminHead, SectionHead, Stat, adminStyles as a, sentence } from '@/components/glide-admin/parts';

export const metadata = { title: 'Overview' };

type ActionItem = {
    id: string;
    app: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    created_at: string;
};

// App → console group. Unknown apps fall under NEFERSTOCK (the commerce domain).
const APP_GROUPS: { key: string; label: string; apps: string[] }[] = [
    { key: 'rollout', label: 'ROLLOUT', apps: ['rollout'] },
    { key: 'emwraps', label: 'EMWRAPS', apps: ['emwraps'] },
    { key: 'neferstock', label: 'NEFERSTOCK', apps: ['neferstock', 'divine', 'medusa'] },
];

function groupByApp(items: ActionItem[]): { label: string; items: ActionItem[] }[] {
    const known = new Set(APP_GROUPS.flatMap((g) => g.apps));
    return APP_GROUPS.map((g) => ({
        label: g.label,
        items: items.filter((it) =>
            g.key === 'neferstock' ? g.apps.includes(it.app) || !known.has(it.app) : g.apps.includes(it.app),
        ),
    })).filter((g) => g.items.length > 0);
}

async function getStats() {
    const admin = getSupabaseAdmin();
    const tables = [
        'profiles',
        'shops',
        'vehicles',
        'posts',
        'events',
        'appointment_requests',
        'content_reports',
        'platform_admins',
        'meet_coordinators',
    ];
    const counts = await Promise.all(
        tables.map(async (t) => {
            const { count } = await admin
                .from(t)
                .select('*', { count: 'exact', head: true });
            return { table: t, count: count ?? 0 };
        }),
    );
    // Open appointments + pending reports get their own headline numbers.
    const { count: pendingAppts } = await admin
        .from('appointment_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    const { count: openReports } = await admin
        .from('content_reports')
        .select('*', { count: 'exact', head: true })
        // report_status is pending|reviewing|actioned|dismissed — 'open' never matched.
        .in('status', ['pending', 'reviewing']);
    const { count: shopPages } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('kind', 'shop_page');
    const { count: verifiedShops } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('kind', 'shop_page')
        .eq('is_verified', true);

    // Persistent action items (the "needs attention" spine).
    const { data: actionItems, error: actionItemsError } = await admin
        .from('action_items')
        .select('id, app, kind, title, body, href, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
    if (actionItemsError)
        console.error('[admin/overview] action_items load failed:', actionItemsError.message);

    // Derived live signal — pending verification requests (not stored as items).
    const { count: pendingVerifications } = await admin
        .from('verification_requests')
        .select('*', { count: 'exact', head: true })
        .eq('state', 'pending');

    return {
        counts: Object.fromEntries(counts.map((c) => [c.table, c.count])),
        pendingAppts: pendingAppts ?? 0,
        openReports: openReports ?? 0,
        shopPages: shopPages ?? 0,
        verifiedShops: verifiedShops ?? 0,
        actionItems: (actionItems ?? []) as ActionItem[],
        pendingVerifications: pendingVerifications ?? 0,
    };
}

// Group keys are uppercase app keys; shown as the products' own names.
const APP_NAME: Record<string, string> = { ROLLOUT: 'Rollout', EMWRAPS: 'EMWRAPS', NEFERSTOCK: 'NeferStock' };

function timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

export default async function OverviewPage() {
    const s = await getStats();
    const usersCount = (s.counts.profiles ?? 0) - s.shopPages;
    const attentionCount = s.actionItems.length + (s.pendingVerifications > 0 ? 1 : 0);

    return (
        <>
            <AdminHead title="Overview" />

            {/* ── NEEDS ATTENTION — persistent action items + derived signals ── */}
            <SectionHead
                title={
                    <>
                        Needs attention
                        {attentionCount > 0 && <span className="admin-pill warn">{attentionCount}</span>}
                    </>
                }
            />

            {s.pendingVerifications > 0 && (
                <Link href="/admin/verifications" className={a.derived}>
                    <span className={a.num}>{s.pendingVerifications}</span>
                    <span>
                        {s.pendingVerifications === 1 ? 'Verification pending' : 'Verifications pending'}: review now
                    </span>
                    <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
            )}

            {s.actionItems.length === 0 && s.pendingVerifications === 0 ? (
                <div className="admin-empty">All clear. Nothing needs attention.</div>
            ) : (
                groupByApp(s.actionItems).map((group) => (
                    <section key={group.label} aria-label={group.label} className={a.stack}>
                        <div className={a.group}>{APP_NAME[group.label] ?? group.label}</div>
                        <ul className={`${a.card} ${a.att}`}>
                            {group.items.map((item) => (
                                <li key={item.id}>
                                    <div className={a.attBody}>
                                        <span className="g-ic g-ic--sm" aria-hidden="true">
                                            <CircleAlert size={18} strokeWidth={2} />
                                        </span>
                                        <div style={{ minWidth: 0 }}>
                                            <b>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</b>
                                            {item.body && <p>{item.body}</p>}
                                            <small>
                                                {sentence(item.kind)} · {timeAgo(item.created_at)}
                                            </small>
                                        </div>
                                    </div>
                                    <div className={a.attActs}>
                                        {item.href && (
                                            <Link href={item.href} className="admin-action-btn">
                                                Open <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                                            </Link>
                                        )}
                                        <DismissButton id={item.id} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))
            )}

            {/* ── PULSE — cross-ecosystem KPIs (Console Phase C2) ── */}
            <PulseSection />

            {/* ── LAUNCHER + HEALTH ROW (Console Phase C3) ── */}
            <LauncherSection />

            <SectionHead title="Platform snapshot" />
            <div className="admin-stat-grid">
                <Stat label="Users" value={usersCount} />
                <Stat label="Shop pages" value={s.shopPages} />
                <Stat label="Verified shops" value={s.verifiedShops} />
                <Stat label="Garages" value={s.counts.vehicles} />
                <Stat label="Posts" value={s.counts.posts} />
                <Stat label="Events" value={s.counts.events} />
            </div>

            <SectionHead title="Queues" />
            <div className="admin-stat-grid">
                <Stat label="Pending appointments" value={s.pendingAppts} />
                <Link href="/admin/reports" className={a.statLink}>
                    <Stat
                        label={
                            <>
                                Open content reports <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
                            </>
                        }
                        value={s.openReports}
                    />
                </Link>
            </div>

            <SectionHead title="Roles" />
            <div className="admin-stat-grid">
                <Stat label="Platform admins" value={s.counts.platform_admins} />
                <Stat label="Meet coordinators" value={s.counts.meet_coordinators} />
            </div>
        </>
    );
}
