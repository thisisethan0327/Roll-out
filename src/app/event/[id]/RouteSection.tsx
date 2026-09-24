/**
 * Cover Story B — "feature story" route spread: drawn map beside a stop
 * itinerary list. Wraps the existing RouteMapLoader (client, MapLibre behind
 * next/dynamic ssr:false) unchanged — this only restyles the surrounding grid
 * and stop rows. Only rendered by the page when route_plan has stops.
 */
import type { RoutePoint, RoutePlanStop } from '@/lib/route-plan';
import RouteMapLoader from './RouteMapLoader';
import styles from './cover-story.module.css';

export function RouteSection({
    routeStops,
    routePoints,
    polyline,
    startLabel,
    startName,
    destinationName,
    hasDestination,
    googleMapsUrl,
}: {
    routeStops: RoutePlanStop[];
    routePoints: RoutePoint[];
    polyline: [number, number][];
    startLabel: string;
    startName: string;
    destinationName: string | null;
    hasDestination: boolean;
    googleMapsUrl: string | null;
}) {
    return (
        <>
            <p className="text-dim" style={{ fontSize: 14, margin: '0 0 18px' }}>
                {routeStops.length} planned stop{routeStops.length === 1 ? '' : 's'} from meet to
                {destinationName ? ' destination' : ' finish'}.
            </p>

            <div className={styles.routeGrid}>
                <div className={`${styles.routeStage} corner-wrap`}>
                    <span className="corner-bottom-left" />
                    <span className="corner-bottom-right" />
                    <RouteMapLoader points={routePoints} polyline={polyline} />
                </div>

                <ul className={styles.routeList}>
                    <li className={styles.routeStopItem}>
                        <span className={styles.routeStopNum}>·</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{startName || 'Start'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>MEET · {startLabel}</div>
                        </div>
                    </li>
                    {routeStops.map((s, i) => (
                        <li className={styles.routeStopItem} key={`${s.seq}-${i}`}>
                            <span className={styles.routeStopNum}>{String(i + 1).padStart(2, '0')}</span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{s.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                                    {s.etaLocal ?? `STOP ${i + 1}`}
                                    {s.dwellMin != null ? ` · ${s.dwellMin} min` : ''}
                                </div>
                            </div>
                        </li>
                    ))}
                    {hasDestination ? (
                        <li className={styles.routeStopItem}>
                            <span className={styles.routeStopNum}>🏁</span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{destinationName ?? 'Destination'}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>FINISH</div>
                            </div>
                        </li>
                    ) : null}
                </ul>
            </div>

            {googleMapsUrl ? (
                <div style={{ marginTop: 16 }}>
                    <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: 'var(--track-wider)', textDecoration: 'none', borderBottom: '1px solid var(--line-mid)', paddingBottom: 2, color: 'var(--text-2)' }}
                    >
                        OPEN IN GOOGLE MAPS ›
                    </a>
                </div>
            ) : null}
        </>
    );
}
