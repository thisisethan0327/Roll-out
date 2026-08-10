/** Skeleton for /meets/map — the page server-fetches map pins before the
 *  Leaflet client component (and CDN) even begin loading. */
import { Skeleton } from '@/components/feedback';

export default function MeetsMapLoading() {
    return (
        <div>
            <div
                className="container"
                style={{ padding: '18px 0', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}
            >
                <Skeleton width={180} height={20} />
                <Skeleton width={120} height={20} />
            </div>
            <div style={{ position: 'relative', width: '100%', height: '68vh', minHeight: 420, background: 'var(--bg-2)' }}>
                <div className="rl-map-loading">
                    <div className="rl-map-inner">
                        <div className="rl-map-grid" />
                        <span className="rl-skel-eyebrow">
                            LOADING MAP
                            <span className="rl-dots" aria-hidden="true"><i /><i /><i /></span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
