/** Skeleton for /me/appointments. */
import { Skeleton, SkeletonRows } from '@/components/feedback';

export default function MyAppointmentsLoading() {
    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">APPOINTMENTS</div>
                    <div className="admin-page-sub text-dim">
                        <Skeleton width={220} height={12} />
                    </div>
                </div>
            </div>
            <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}>
                <SkeletonRows rows={5} cols={3} />
            </section>
        </div>
    );
}
