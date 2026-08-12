import { getSystemHealth, type HealthStatus } from '@/lib/system-health';

/**
 * LAUNCHER + HEALTH ROW (Console Phase C3) — one card per system in the
 * ecosystem, each a deep link with a live health dot. Server-rendered under
 * PULSE on /admin/overview. `getSystemHealth` pings every origin (3s timeout),
 * folds in Coolify container status when the token is set, caches ~2 min, and
 * never throws — a failed check just paints the dot amber/red.
 */
const DOT_LABEL: Record<HealthStatus, string> = {
    ok: 'ONLINE',
    degraded: 'DEGRADED',
    down: 'UNREACHABLE',
    unknown: 'UNKNOWN',
};

export default async function LauncherSection() {
    const { systems, coolifyChecked } = await getSystemHealth();

    return (
        <>
            <div
                className="admin-page-head"
                style={{ marginTop: 12, borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}
            >
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        LAUNCHER
                    </div>
                    <div className="admin-page-sub">
                        SYSTEMS · HEALTH PINGED SERVER-SIDE · CACHED 2 MIN
                        {coolifyChecked ? ' · COOLIFY LINKED' : ' · COOLIFY OFFLINE'}
                    </div>
                </div>
            </div>

            <div className="launcher-grid">
                {systems.map((s) => (
                    <a
                        key={s.key}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="launcher-card"
                    >
                        <div className="launcher-top">
                            <span className={`launcher-dot ${s.status}`} title={DOT_LABEL[s.status]} />
                            <span className="launcher-label">{s.label}</span>
                            <span className="launcher-open">↗</span>
                        </div>
                        <div className="launcher-host">{s.host}</div>
                        <div className={`launcher-status ${s.status}`}>
                            {DOT_LABEL[s.status]}
                            {s.coolify && <span className="launcher-coolify"> · {s.coolify}</span>}
                        </div>
                        {s.note && <div className="launcher-note">{s.note}</div>}
                    </a>
                ))}
            </div>
        </>
    );
}
