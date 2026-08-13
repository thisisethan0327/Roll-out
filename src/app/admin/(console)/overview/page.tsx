import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { DismissButton } from './DismissButton';
import PulseSection from './PulseSection';
import LauncherSection from './LauncherSection';

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
        .eq('status', 'open');
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
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">OVERVIEW</div>
                    <div className="admin-page-sub">PLATFORM SNAPSHOT · LIVE COUNTS</div>
                </div>
            </div>

            {/* ── NEEDS ATTENTION — persistent action items + derived signals ── */}
            <div className="admin-page-head" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        NEEDS ATTENTION
                        {attentionCount > 0 && (
                            <span className="admin-pill warn" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                                {attentionCount}
                            </span>
                        )}
                    </div>
                    <div className="admin-page-sub">OPEN ACTION ITEMS · RESOLVE OR DISMISS</div>
                </div>
            </div>

            {s.pendingVerifications > 0 && (
                <Link href="/admin/verifications" className="admin-attention-derived">
                    <span className="admin-pill gold">{s.pendingVerifications}</span>
                    <span>
                        {s.pendingVerifications === 1
                            ? 'verification pending'
                            : 'verifications pending'}{' '}
                        — review now ›
                    </span>
                </Link>
            )}

            {s.actionItems.length === 0 && s.pendingVerifications === 0 ? (
                <div className="admin-empty" style={{ marginBottom: 28 }}>
                    ALL CLEAR — NOTHING NEEDS ATTENTION
                </div>
            ) : (
                groupByApp(s.actionItems).map((group) => (
                    <div key={group.label} style={{ marginBottom: 8 }}>
                        <div
                            className="admin-sidebar-section"
                            style={{ padding: '4px 0', marginTop: 4 }}
                        >
                            {group.label}
                        </div>
                        <div className="admin-attention-list">
                            {group.items.map((item) => (
                                <div key={item.id} className="admin-attention-item">
                                    <div className="admin-attention-body">
                                        <div className="admin-attention-title">
                                            {item.href ? (
                                                <Link href={item.href} className="text-link">
                                                    {item.title}
                                                </Link>
                                            ) : (
                                                item.title
                                            )}
                                        </div>
                                        {item.body && (
                                            <div className="admin-attention-desc">{item.body}</div>
                                        )}
                                        <div className="admin-attention-meta">
                                            {item.kind.toUpperCase().replace(/_/g, ' ')} · {timeAgo(item.created_at)}
                                        </div>
                                    </div>
                                    <div className="admin-attention-actions">
                                        {item.href && (
                                            <Link href={item.href} className="admin-action-btn">
                                                OPEN ›
                                            </Link>
                                        )}
                                        <DismissButton id={item.id} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {/* ── PULSE — cross-ecosystem KPIs (Console Phase C2) ── */}
            <PulseSection />

            {/* ── LAUNCHER + HEALTH ROW (Console Phase C3) ── */}
            <LauncherSection />

            <div className="admin-page-head" style={{ marginTop: 12, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>PLATFORM SNAPSHOT</div>
                </div>
            </div>
            <div className="admin-stat-grid">
                <Stat label="USERS"                value={usersCount} />
                <Stat label="SHOP PAGES"           value={s.shopPages} />
                <Stat label="VERIFIED SHOPS"       value={s.verifiedShops} accent="gold" />
                <Stat label="GARAGES"              value={s.counts.vehicles} />
                <Stat label="POSTS"                value={s.counts.posts} />
                <Stat label="EVENTS"               value={s.counts.events} />
            </div>

            <div className="admin-page-head" style={{ marginTop: 12, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>QUEUES</div>
                </div>
            </div>
            <div className="admin-stat-grid">
                <Stat label="PENDING APPOINTMENTS" value={s.pendingAppts} accent="gold" />
                <Stat label="OPEN CONTENT REPORTS" value={s.openReports} accent={s.openReports > 0 ? 'warn' : undefined} />
            </div>

            <div className="admin-page-head" style={{ marginTop: 12, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>ROLES</div>
                </div>
            </div>
            <div className="admin-stat-grid">
                <Stat label="PLATFORM ADMINS"   value={s.counts.platform_admins} />
                <Stat label="MEET COORDINATORS" value={s.counts.meet_coordinators} />
            </div>
        </>
    );
}

function Stat({
    label,
    value,
    accent,
}: {
    label: string;
    value: number | string;
    accent?: 'gold' | 'warn';
}) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className={`admin-stat-num ${accent ?? ''}`}>{value}</div>
        </div>
    );
}
