'use client';
/**
 * Client-only loader for RouteMap.tsx. `next/dynamic({ ssr: false })` may
 * only be called from a Client Component — invoking it directly in page.tsx
 * (a Server Component) throws. This thin wrapper is the boundary: page.tsx
 * renders <RouteMapLoader> like any other component, and everything
 * MapLibre/DOM-related stays client-only from here down, matching rule 3
 * (map = client component behind next/dynamic ssr:false).
 */
import dynamic from 'next/dynamic';
import type { RoutePoint } from '@/lib/route-plan';

const RouteMap = dynamic(() => import('./RouteMap'), {
    ssr: false,
    loading: () => (
        <div className="rl-map-loading">
            <div className="rl-map-inner">
                <div className="rl-map-grid" />
                <span className="rl-skel-eyebrow">
                    LOADING MAP
                    <span className="rl-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                    </span>
                </span>
            </div>
        </div>
    ),
});

export default function RouteMapLoader({
    points,
    polyline,
}: {
    points: RoutePoint[];
    polyline: [number, number][];
}) {
    return <RouteMap points={points} polyline={polyline} />;
}
