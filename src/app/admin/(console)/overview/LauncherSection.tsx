import { getSystemHealth, type HealthStatus } from '@/lib/system-health';
import { ArrowUpRight, CircleAlert, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { SectionHead, adminStyles as a } from '@/components/glide-admin/parts';
import { InfoTip } from '@/components/glide/InfoTip';

/**
 * LAUNCHER + HEALTH ROW (Console Phase C3) — one card per system in the
 * ecosystem, each a deep link with a live health dot. Server-rendered under
 * PULSE on /admin/overview. `getSystemHealth` pings every origin (3s timeout),
 * folds in Coolify container status when the token is set, caches ~2 min, and
 * never throws — a failed check just paints the dot amber/red.
 */
const DOT_LABEL: Record<HealthStatus, string> = {
    ok: 'Online',
    degraded: 'Degraded',
    down: 'Unreachable',
    unknown: 'Unknown',
};

const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
const DOT_ICON: Record<HealthStatus, React.ReactNode> = {
    ok: <CircleCheck {...ic} />,
    degraded: <CircleAlert {...ic} />,
    down: <CircleX {...ic} />,
    unknown: <CircleDashed {...ic} />,
};

/** The system labels are uppercase constants in lib/system-health; show them as names. */
function systemName(label: string): string {
    return label
        .split(' ')
        .map((w) =>
            /^(EMWRAPS|CMS)$/.test(w) ? w : w === 'NEFERSTOCK' ? 'NeferStock' : w.charAt(0) + w.slice(1).toLowerCase(),
        )
        .join(' ');
}

export default async function LauncherSection() {
    const { systems, coolifyChecked } = await getSystemHealth();

    return (
        <>
            <SectionHead
                title={
                    <>
                        Launcher <InfoTip label="About health checks" text="Health is pinged server-side and cached for 2 minutes." />
                    </>
                }
                sub={coolifyChecked ? 'Coolify linked' : 'Coolify offline'}
            />

            <div className={a.launch}>
                {systems.map((s) => (
                    <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" className={a.launchCard}>
                        <span className={a.launchTop}>
                            <span>{systemName(s.label)}</span>
                            <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
                        </span>
                        <span className={a.launchHost}>{s.host}</span>
                        <span className={a.launchStatus}>
                            {DOT_ICON[s.status]}
                            {DOT_LABEL[s.status]}
                            {s.coolify && <span className={a.launchHost}> · {s.coolify}</span>}
                        </span>
                        {s.note && <span className={a.small}>{s.note}</span>}
                    </a>
                ))}
            </div>
        </>
    );
}
