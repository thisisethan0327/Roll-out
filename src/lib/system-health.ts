/**
 * SYSTEM HEALTH — launcher + health row for the god console (Console Phase C3).
 *
 * One card per system in the ecosystem, each with a deep link and a health dot.
 * Server-only; rendered on /admin/overview (already gated by requirePlatformAdmin).
 *
 * Two independent signals, combined into one dot:
 *   1. HTTP REACHABILITY — a GET with a 3s timeout. 2xx/3xx and auth-gated
 *      401/403 count as UP (a login redirect is not an outage); other 4xx/5xx
 *      are DEGRADED; a network error / timeout is DOWN.
 *   2. COOLIFY RUNNING STATUS — when COOLIFY_API_TOKEN is present we read
 *      /applications once and match each target to its Coolify app by fqdn. A
 *      non-running container downgrades the dot even if a cached CDN still 200s;
 *      the Coolify container/health status is shown as a note.
 *
 * Every check is best-effort and independently caught: a failure renders an
 * amber/red dot with a note, NEVER a broken page. Cached in-memory ~2 min so
 * god-mode refreshes don't hammer seven origins + Coolify each load.
 */
import 'server-only';

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export type SystemTarget = {
    key: string;
    label: string;
    /** Where the card's OPEN link points (may be a deep sub-path). */
    url: string;
    /** Host shown as the card eyebrow. */
    host: string;
    /** URL actually pinged for reachability (usually the origin root). */
    healthUrl: string;
    /** Substrings matched against a Coolify app's fqdn list. */
    coolifyHosts: string[];
};

export type SystemHealth = {
    key: string;
    label: string;
    url: string;
    host: string;
    status: HealthStatus;
    httpStatus: number | null;
    /** Coolify container status string, e.g. "running:healthy" (when known). */
    coolify: string | null;
    note: string | null;
};

export type HealthSnapshot = {
    systems: SystemHealth[];
    coolifyChecked: boolean;
    at: number;
};

const TARGETS: SystemTarget[] = [
    {
        key: 'tickets',
        label: 'EMWRAPS TICKETS',
        url: 'https://app.emwraps.net',
        host: 'app.emwraps.net',
        healthUrl: 'https://app.emwraps.net',
        coolifyHosts: ['app.emwraps.net'],
    },
    {
        key: 'website',
        label: 'EMWRAPS WEBSITE',
        url: 'https://emwraps.net',
        host: 'emwraps.net',
        healthUrl: 'https://emwraps.net',
        coolifyHosts: ['emwraps.net', 'www.emwraps.net'],
    },
    {
        key: 'cms',
        label: 'PAYLOAD CMS',
        url: 'https://cms.emwraps.net/admin',
        host: 'cms.emwraps.net/admin',
        healthUrl: 'https://cms.emwraps.net/admin',
        coolifyHosts: ['cms.emwraps.net'],
    },
    {
        key: 'rollout',
        label: 'ROLLOUT',
        url: 'https://rollout.club',
        host: 'rollout.club',
        healthUrl: 'https://rollout.club',
        coolifyHosts: ['rollout.club'],
    },
    {
        key: 'store',
        label: 'NEFERSTOCK STORE',
        url: 'https://neferstock.com',
        host: 'neferstock.com',
        healthUrl: 'https://neferstock.com',
        coolifyHosts: ['neferstock.com', 'www.neferstock.com'],
    },
    {
        key: 'medusa',
        label: 'MEDUSA ADMIN',
        url: 'https://api.neferstock.com/app',
        host: 'api.neferstock.com/app',
        healthUrl: 'https://api.neferstock.com/health',
        coolifyHosts: ['api.neferstock.com'],
    },
    {
        key: 'coolify',
        label: 'COOLIFY PANEL',
        url: 'https://coolify.neferstock.com',
        host: 'coolify.neferstock.com',
        healthUrl: 'https://coolify.neferstock.com/api/health',
        coolifyHosts: [],
    },
];

const TIMEOUT_MS = 3000;
const TTL_MS = 2 * 60 * 1000;

let cache: HealthSnapshot | null = null;

/** Classify a raw HTTP status into a health level. null = fetch threw. */
function classify(status: number | null): HealthStatus {
    if (status == null) return 'down';
    if (status >= 200 && status < 400) return 'ok';
    if (status === 401 || status === 403) return 'ok'; // reachable, auth-gated
    return 'degraded'; // other 4xx/5xx: server answered but not happily
}

/** GET with a hard 3s timeout; returns the status code or null on error. */
async function pingStatus(url: string): Promise<number | null> {
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'user-agent': 'rollout-console-health/1.0', accept: '*/*' },
        });
        return res.status;
    } catch {
        return null;
    }
}

/**
 * Fetch Coolify apps and index the container status by each of their fqdn hosts.
 * Returns an empty map (and coolifyChecked=false) when the token is unset or
 * Coolify is unreachable — health then rests on HTTP alone.
 */
async function getCoolifyStatusByHost(): Promise<{ map: Map<string, string>; checked: boolean }> {
    const map = new Map<string, string>();
    const token = process.env.COOLIFY_API_TOKEN;
    const base = process.env.COOLIFY_API_BASE ?? 'https://coolify.neferstock.com/api/v1';
    if (!token) return { map, checked: false };
    try {
        const res = await fetch(`${base}/applications`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(TIMEOUT_MS + 1500),
        });
        if (!res.ok) return { map, checked: false };
        const json = await res.json();
        const apps: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        for (const app of apps) {
            const status = String(app?.status ?? '').trim(); // e.g. "running:healthy"
            const fqdn = String(app?.fqdn ?? '');
            for (const part of fqdn.split(',')) {
                try {
                    const host = new URL(part.trim()).host.toLowerCase();
                    if (host) map.set(host, status);
                } catch {
                    /* skip non-URL fqdn entries */
                }
            }
        }
        return { map, checked: true };
    } catch {
        return { map, checked: false };
    }
}

/** True when a Coolify status string indicates the container is NOT running. */
function coolifyIsDown(status: string): boolean {
    const s = status.toLowerCase();
    return (
        s.startsWith('exited') ||
        s.startsWith('stopped') ||
        s.startsWith('restarting') ||
        s.startsWith('dead') ||
        s.includes('error')
    );
}

export async function getSystemHealth(force = false): Promise<HealthSnapshot> {
    if (!force && cache && Date.now() - cache.at < TTL_MS) return cache;

    const [statuses, coolify] = await Promise.all([
        Promise.all(TARGETS.map((t) => pingStatus(t.healthUrl))),
        getCoolifyStatusByHost(),
    ]);

    const systems: SystemHealth[] = TARGETS.map((t, i) => {
        const httpStatus = statuses[i];
        let status = classify(httpStatus);
        const notes: string[] = [];

        // Coolify refinement — match this target to a Coolify app by fqdn host.
        let coolifyStatus: string | null = null;
        for (const h of t.coolifyHosts) {
            const c = coolify.map.get(h.toLowerCase());
            if (c) {
                coolifyStatus = c;
                break;
            }
        }
        if (coolifyStatus) {
            if (coolifyIsDown(coolifyStatus)) {
                status = 'down';
                notes.push(`Coolify: ${coolifyStatus}`);
            } else if (coolifyStatus.includes('unhealthy')) {
                if (status === 'ok') status = 'degraded';
                notes.push(`Coolify: ${coolifyStatus}`);
            }
        }

        if (httpStatus == null) notes.push('no HTTP response (timeout / unreachable)');
        else if (status === 'degraded') notes.push(`HTTP ${httpStatus}`);

        return {
            key: t.key,
            label: t.label,
            url: t.url,
            host: t.host,
            status,
            httpStatus,
            coolify: coolifyStatus,
            note: notes.length ? notes.join(' · ') : null,
        };
    });

    cache = { systems, coolifyChecked: coolify.checked, at: Date.now() };
    return cache;
}
