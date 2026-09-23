'use client';
/**
 * Client-only loader for RoutePickerMap.tsx — same boundary RouteMapLoader.tsx
 * draws for RouteMap.tsx: `next/dynamic({ ssr: false })` may only be called
 * from a Client Component, and everything MapLibre/DOM-related stays behind
 * this thin wrapper.
 */
import dynamic from 'next/dynamic';

const RoutePickerMap = dynamic(() => import('./RoutePickerMap'), {
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

export default function RoutePickerMapLoader({
    lat,
    lng,
    fallbackLat,
    fallbackLng,
    onPick,
    label,
}: {
    lat: number | null;
    lng: number | null;
    fallbackLat?: number | null;
    fallbackLng?: number | null;
    onPick: (lat: number, lng: number) => void;
    label?: string;
}) {
    return (
        <RoutePickerMap
            lat={lat}
            lng={lng}
            fallbackLat={fallbackLat}
            fallbackLng={fallbackLng}
            onPick={onPick}
            label={label}
        />
    );
}
