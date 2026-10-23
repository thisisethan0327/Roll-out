/** Generic platform-admin console skeleton, shown inside the persistent
 *  Glide admin shell while a console section's data resolves. */
import { Skeleton, SkeletonRows } from '@/components/feedback';
import { adminStyles as a } from '@/components/glide-admin/parts';

export default function AdminConsoleLoading() {
    return (
        <div className={a.stack} role="status" aria-label="Loading">
            <div className={a.head}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Skeleton width={240} height={34} radius={10} />
                    <Skeleton width={320} height={14} radius={7} />
                </div>
            </div>
            <div className={`${a.card} ${a.cardPad}`}>
                <SkeletonRows rows={6} cols={4} />
            </div>
        </div>
    );
}
