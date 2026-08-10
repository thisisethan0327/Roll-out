/** Generic platform-admin console skeleton, shown inside the persistent
 *  AdminSidebar shell while a console section's data resolves. */
import { Skeleton, SkeletonHeading, SkeletonRows } from '@/components/feedback';

export default function AdminConsoleLoading() {
    return (
        <div className="admin-content" style={{ padding: 24 }}>
            <SkeletonHeading label="LOADING" />
            <div className="admin-page-head" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton width={200} height={22} />
                    <Skeleton width={260} height={12} />
                </div>
            </div>
            <div style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
                <SkeletonRows rows={6} cols={4} />
            </div>
        </div>
    );
}
