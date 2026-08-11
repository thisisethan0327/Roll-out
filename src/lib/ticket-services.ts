/**
 * Ticket services JSONB shape — the wire contract shared with emwraps-tickets.
 *
 * A persisted `tickets.services` line item (produced by emwraps' serviceStore
 * `getFormattedServices()`) is EXACTLY:
 *
 *   {
 *     service:    string,            // breadcrumb, "Cadillac > Window Tint > Full Car Tint > 20%"
 *     price:      number | null,     // LINE TOTAL (= unit_price × quantity); null when un-priced
 *     unit_price: number | 'Custom', // per-unit price, or the string 'Custom'
 *     quantity:   number,            // >= 1
 *     duration:   string,            // "1 day", "5-7 days", "Varies", "TBD"
 *     custom?:    true,              // present ONLY on free-form / one-off lines
 *   }
 *
 * `total_price` = Σ line.price over numeric prices (non-numeric contribute 0).
 *
 * This module is the single source of truth for parsing that array into the
 * editor's working shape and serializing it back, so the Rollout console and
 * emwraps-tickets read each other's tickets cleanly. Pure + isomorphic (no
 * server-only imports) so both server actions and client editors use it.
 */

/** Editor working shape for one service line. */
export type ServiceLine = {
    /** breadcrumb / display name, e.g. "Window Tint > Full Car > 20%" or a custom name */
    service: string;
    /** per-unit price; null means un-priced ('Custom'/TBD) */
    unitPrice: number | null;
    quantity: number;
    duration: string;
    /** true = free-form one-off line (not picked from the catalog) */
    custom: boolean;
    /**
     * The original persisted object this line was parsed from (if any). Carried
     * through parse→edit→serialize so unknown/foreign keys — e.g. the emwraps
     * catalog remodel's forthcoming `spec:{short,…}`, or `customText` — are
     * PRESERVED rather than stripped. Undefined for freshly-added lines.
     */
    raw?: Record<string, unknown>;
};

/**
 * The persisted emwraps-shape line item. Additional keys (spec, customText, …)
 * may ride along via pass-through; the index signature keeps them type-legal.
 */
export type PersistedServiceLine = {
    service: string;
    price: number | null;
    unit_price: number | 'Custom';
    quantity: number;
    duration: string;
    custom?: true;
    [k: string]: unknown;
};

/**
 * Keys this module owns and rewrites on serialize. Legacy aliases now folded
 * into the canonical fields (name/qty/notes) are dropped; every other key on a
 * parsed line's original object passes through untouched.
 */
const LEGACY_ALIAS_KEYS = ['name', 'qty', 'notes'] as const;

function toFiniteNumber(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Line total for one editor line (null when un-priced). */
export function lineTotal(line: ServiceLine): number | null {
    if (line.unitPrice == null) return null;
    const qty = line.quantity > 0 ? line.quantity : 1;
    return line.unitPrice * qty;
}

/**
 * Parse a raw `tickets.services` value (any legacy shape) into editor lines.
 * Backward-compatible with:
 *   - emwraps current: { service, price, unit_price, quantity, duration, custom }
 *   - emwraps early:   { service, price, duration }              (qty implied 1)
 *   - rollout legacy:  { name, qty, price }                       (old editor)
 *   - { notes: "..." } / bare strings                              (free-form)
 */
export function parseServices(raw: unknown): ServiceLine[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((s: any): ServiceLine => {
        if (s && typeof s === 'object') {
            const service = String(s.service ?? s.name ?? s.notes ?? '').trim();
            const quantity =
                typeof s.quantity === 'number' && s.quantity > 0
                    ? Math.round(s.quantity)
                    : typeof s.qty === 'number' && s.qty > 0
                      ? Math.round(s.qty)
                      : 1;
            // Prefer an explicit unit_price; else derive from a line total / price.
            let unitPrice = toFiniteNumber(s.unit_price);
            if (unitPrice == null) {
                const p = toFiniteNumber(s.price);
                unitPrice = p == null ? null : quantity > 0 ? p / quantity : p;
            }
            return {
                service,
                unitPrice,
                quantity,
                duration: (s.duration ?? 'Varies').toString(),
                custom: !!s.custom,
                raw: s as Record<string, unknown>,
            };
        }
        return { service: String(s), unitPrice: null, quantity: 1, duration: 'Varies', custom: true };
    });
}

/**
 * Serialize editor lines back to the emwraps persisted array (drops blank
 * names). Non-destructive: any unknown/foreign keys carried on `line.raw`
 * (e.g. the emwraps remodel's `spec`, or `customText`) pass through untouched;
 * only the canonical fields are (re)written and superseded legacy aliases
 * (name/qty/notes) are dropped.
 */
export function serializeServices(lines: ServiceLine[]): PersistedServiceLine[] {
    return lines
        .map((l): PersistedServiceLine | null => {
            const service = (l.service ?? '').trim();
            if (!service) return null;
            const quantity = l.quantity > 0 ? Math.round(l.quantity) : 1;
            const priced = l.unitPrice != null && Number.isFinite(l.unitPrice);

            // Start from the original object so foreign keys survive the round-trip.
            const base: Record<string, unknown> = { ...(l.raw ?? {}) };
            for (const k of LEGACY_ALIAS_KEYS) delete base[k];

            const out: PersistedServiceLine = {
                ...base,
                service,
                price: priced ? (l.unitPrice as number) * quantity : null,
                unit_price: priced ? (l.unitPrice as number) : 'Custom',
                quantity,
                duration: (l.duration ?? 'Varies').toString(),
            };
            if (l.custom) out.custom = true;
            else delete out.custom;
            return out;
        })
        .filter((x): x is PersistedServiceLine => x !== null);
}

/** Total over persisted lines (Σ numeric price), or null when nothing is priced. */
export function totalFromPersisted(lines: PersistedServiceLine[]): number | null {
    const priced = lines.filter((l) => typeof l.price === 'number');
    if (priced.length === 0) return null;
    return priced.reduce((s, l) => s + (l.price as number), 0);
}

/** Total over editor lines (Σ numeric line totals), or null when nothing is priced. */
export function totalFromLines(lines: ServiceLine[]): number | null {
    const totals = lines.map(lineTotal).filter((t): t is number => t != null);
    if (totals.length === 0) return null;
    return totals.reduce((s, t) => s + t, 0);
}
