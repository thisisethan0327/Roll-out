/**
 * Shared JSON-LD pieces: the site's own entity ids, the operator node, and the
 * one safe way to put JSON-LD into a page.
 *
 * Rollout is operated by UNITY USA LLC (the footer's legal line). UNITY USA's
 * own site, unityusa.co, is where that organization lives, so Rollout points at
 * its @id rather than minting a second identity for the same company. Other
 * companies on Rollout (shops, sellers) are described as themselves, never
 * tied to UNITY USA or to each other by ownership (no parentOrganization, no
 * shared address): they are separate, independent businesses (owner decision
 * 2026-10-01). A real business relationship — the seller of a product, the
 * host of a meet — is stated as exactly that.
 */
import { ROLLOUT_ORIGIN } from './tenant-hosts';

export const WEBSITE_ID = `${ROLLOUT_ORIGIN}/#website`;
export const APP_ID = `${ROLLOUT_ORIGIN}/#app`;
export const UNITY_ORG_ID = 'https://unityusa.co/#organization';

/** UNITY USA, the company that operates Rollout. */
export const UNITY_ORG = {
    '@type': 'Organization',
    '@id': UNITY_ORG_ID,
    name: 'UNITY USA',
    legalName: 'UNITY USA LLC',
    url: 'https://unityusa.co',
} as const;

/**
 * JSON for a <script type="application/ld+json">. JSON.stringify leaves "<"
 * alone, so a host's event description or a shop bio containing "</script>"
 * would close the tag and run whatever followed. Escaping "<" as \u003c keeps
 * the JSON identical to a parser and inert to the HTML one.
 */
export function jsonLdHtml(data: unknown): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

const US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
    'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
    'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

/** "US" when the region is a US state code — the only country the data can prove. */
function countryFor(region: string | null | undefined): { addressCountry?: string } {
    return region && US_STATES.has(region.trim().toUpperCase()) ? { addressCountry: 'US' } : {};
}

/** PostalAddress from structured columns (shops.address_line / city / …). Empty parts are left out. */
export function postalAddress(parts: {
    street?: string | null;
    locality?: string | null;
    region?: string | null;
    postal?: string | null;
}): Record<string, string> {
    const clean = (s: string | null | undefined) => (s ?? '').trim();
    return {
        '@type': 'PostalAddress',
        ...(clean(parts.street) ? { streetAddress: clean(parts.street) } : {}),
        ...(clean(parts.locality) ? { addressLocality: clean(parts.locality) } : {}),
        ...(clean(parts.region) ? { addressRegion: clean(parts.region) } : {}),
        ...(clean(parts.postal) ? { postalCode: clean(parts.postal) } : {}),
        ...countryFor(parts.region),
    };
}

/** Street-type words ("Way", "Hwy", "St.") — one must appear for a line to count as a street. */
const STREET_TYPE_RE =
    /^(?:st|street|ave|avenue|rd|road|hwy|highway|blvd|boulevard|way|dr|drive|ln|lane|pl|place|ct|court|pkwy|parkway|ter|terrace|cir|circle|loop|trl|trail|pike|route|rte|fwy|freeway|expy|expressway|broadway|sq|square|plz|plaza)\.?$/i;

/**
 * A street line as an address is written: a house number, then capitalised
 * words or numbers, one of them a street type ("21910 Hwy 99", "1900 Airport
 * Way S #103", "123 NE 45th St"). A leading number alone is not enough — host
 * notes start with numbers too ("100 spots, first come", "5 min from I-5",
 * "3 Cars Max") and must never be published as a streetAddress.
 */
function isStreetLine(text: string): boolean {
    const [num, ...rest] = text.trim().split(/\s+/);
    if (!num || rest.length === 0 || !/^\d+[A-Za-z]?$/.test(num)) return false;
    return rest.every((t) => /^[A-Z0-9#]/.test(t)) && rest.some((t) => STREET_TYPE_RE.test(t));
}

/**
 * PostalAddress from a free-text address as hosts type it on an event
 * ("21910 Hwy 99, Edmonds, WA 98026"). Only text that ENDS in a city and a US
 * state (optionally a ZIP, optionally ", USA") gives an address: the city and
 * state are split out, and a street line before them is kept only when it
 * reads as one (isStreetLine; "Dick's Drive-In, 21910 Hwy 99, Edmonds, WA"
 * keeps "21910 Hwy 99"). location_detail is free text and is often a note
 * rather than an address ("Meet in the lot off Angeles Crest Highway",
 * "Roll-in from 8am…"), so anything else gives null — no address beats a
 * wrong one.
 */
export function postalAddressFromText(text: string | null | undefined): Record<string, string> | null {
    const raw = (text ?? '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && /^(usa|us|united states)$/i.test(parts[parts.length - 1])) parts.pop();
    const m = parts.length >= 2 ? /^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/.exec(parts[parts.length - 1]) : null;
    if (!m || !US_STATES.has(m[1].toUpperCase())) return null;
    const before = parts.slice(0, -2);
    const at = before.findIndex(isStreetLine);
    return postalAddress({
        // From the street line on ("1900 Airport Way S, #103"); a place name
        // in front of it ("Dick's Drive-In") is not part of the street.
        street: at >= 0 ? before.slice(at).join(', ') : null,
        locality: parts[parts.length - 2],
        region: m[1].toUpperCase(),
        postal: m[2] ?? null,
    });
}

/**
 * An absolute URL for markup, or null when the text is not a URL at all. A
 * host-entered cover URL is only prefix-checked when saved, and new URL()
 * throws on the rest ("https://my site.com/x.jpg") — which would take the
 * whole page down for an optional image field.
 */
export function absoluteUrl(src: string | null | undefined): string | null {
    if (!src) return null;
    try {
        return new URL(src, ROLLOUT_ORIGIN).toString();
    } catch {
        return null;
    }
}
