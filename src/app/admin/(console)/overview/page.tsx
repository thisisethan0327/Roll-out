import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Overview' };

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

    return {
        counts: Object.fromEntries(counts.map((c) => [c.table, c.count])),
        pendingAppts: pendingAppts ?? 0,
        openReports: openReports ?? 0,
        shopPages: shopPages ?? 0,
        verifiedShops: verifiedShops ?? 0,
    };
}

export default async function OverviewPage() {
    const s = await getStats();
    const usersCount = (s.counts.profiles ?? 0) - s.shopPages;
    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">OVERVIEW</div>
                    <div className="admin-page-sub">PLATFORM SNAPSHOT · LIVE COUNTS</div>
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
                    <div className="admin-page-title" style={{ fontSize: 14 }}>NEEDS ATTENTION</div>
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
