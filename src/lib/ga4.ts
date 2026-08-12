/**
 * GA4 Data API — server-side, degraded-by-default.
 *
 * The emwraps-react admin fetched GA4 with a *browser* OAuth token held in a
 * module variable that dies on page reload (admin-surface-inventory §5.4). A
 * server-rendered console cannot reuse that, and no server-side GA4 credential
 * exists yet. So this tile renders a "CONNECT GA4" state until the founder
 * supplies a service account — at which point it lights up with zero code
 * changes. Nothing here ever blocks the page: every failure returns
 * `{ connected: false }` (+ an optional error note).
 *
 * To activate, set TWO env vars on the rollout web Coolify app:
 *   GA4_PROPERTY_ID           — the numeric GA4 property id (e.g. 313191837)
 *   GOOGLE_SERVICE_ACCOUNT_JSON — the full service-account key JSON (one line)
 * Then grant that service account "Viewer" on the GA4 property. See the founder
 * runbook in the C2 handoff for the 5 exact steps.
 *
 * Auth flow (no external SDK): sign a JWT with the service account's RSA private
 * key, exchange it at Google's token endpoint for a short-lived access token
 * (scope analytics.readonly), then call properties/{id}:runReport.
 */
import 'server-only';
import crypto from 'crypto';

export type Ga4Overview = {
    /** False → render the CONNECT GA4 degraded state. */
    connected: boolean;
    sessions?: number;
    totalUsers?: number;
    pageViews?: number;
    error?: string | null;
};

function b64url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string | null> {
    if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(
        JSON.stringify({
            iss: sa.client_email,
            scope: 'https://www.googleapis.com/auth/analytics.readonly',
            aud: 'https://oauth2.googleapis.com/token',
            iat,
            exp,
        }),
    );
    const signingInput = `${header}.${claim}`;
    const signature = b64url(
        crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key),
    );
    const assertion = `${signingInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
        cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const token = typeof json?.access_token === 'string' ? json.access_token : null;
    if (token) tokenCache = { token, exp: Date.now() + Number(json?.expires_in ?? 3600) * 1000 };
    return token;
}

let overviewCache: { at: number; data: Ga4Overview } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Last-7-days GA4 overview (sessions / users / pageviews). Degraded-by-default:
 * returns `{ connected: false }` when the env credential is absent, so the tile
 * shows CONNECT GA4 without ever failing the page.
 */
export async function getGa4Overview(): Promise<Ga4Overview> {
    if (overviewCache && Date.now() - overviewCache.at < TTL_MS) return overviewCache.data;

    const propertyId = process.env.GA4_PROPERTY_ID;
    const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!propertyId || !saRaw) return { connected: false };

    try {
        const sa = JSON.parse(saRaw);
        if (!sa?.client_email || !sa?.private_key) {
            return { connected: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email / private_key.' };
        }
        const token = await getAccessToken(sa);
        if (!token) return { connected: false, error: 'GA4 token exchange failed (check the service account key).' };

        const res = await fetch(
            `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
                    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
                }),
                cache: 'no-store',
            },
        );
        if (!res.ok) {
            return { connected: false, error: `GA4 responded ${res.status} (grant the SA Viewer on the property?).` };
        }
        const json = await res.json();
        const row = json?.rows?.[0]?.metricValues ?? [];
        const data: Ga4Overview = {
            connected: true,
            sessions: Number(row[0]?.value ?? 0),
            totalUsers: Number(row[1]?.value ?? 0),
            pageViews: Number(row[2]?.value ?? 0),
            error: null,
        };
        overviewCache = { at: Date.now(), data };
        return data;
    } catch (e: any) {
        return { connected: false, error: e?.message ?? 'GA4 fetch failed.' };
    }
}
