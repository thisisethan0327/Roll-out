/**
 * events.area_label (migration 089) — the host's own "general area" for a
 * private / followers-only event ("Edmonds, WA"), shown to strangers on the
 * locked teaser (rollout.event_teasers.general_area) instead of the venue.
 *
 * Text, 1..60 chars trimmed, or null. Every write FAILS SOFT: before 089 the
 * column does not exist, so a save that mentions it would fail outright. The
 * composers therefore go through writeWithAreaLabel(), which retries the same
 * write without the column when the error names it — the event still saves,
 * only the area is dropped.
 */

export const AREA_LABEL_MAX = 60;
export const AREA_LABEL_FIELD = 'area_label';

export type AreaLabelParse = { ok: true; value: string | null } | { ok: false; error: string };

/** Trimmed (inner whitespace collapsed), null when empty, error when > 60. */
export function parseAreaLabel(raw: FormDataEntryValue | null | undefined): AreaLabelParse {
    const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
    if (!s) return { ok: true, value: null };
    if (s.length > AREA_LABEL_MAX) {
        return { ok: false, error: `General area must be ${AREA_LABEL_MAX} characters or fewer.` };
    }
    return { ok: true, value: s };
}

/** Does this PostgREST error mean "no area_label column here yet"? */
export function isAreaLabelColumnError(error: { message?: string | null } | null | undefined): boolean {
    return !!error?.message && /area_label/i.test(error.message);
}

/**
 * Run an events insert/update with area_label, retrying WITHOUT it when the
 * column is missing (pre-089). `run(true)` must include area_label in its
 * payload, `run(false)` must leave it out.
 */
export async function writeWithAreaLabel<R extends { error: { message?: string | null } | null }>(
    run: (includeAreaLabel: boolean) => PromiseLike<R>,
): Promise<R> {
    const first = await run(true);
    if (!first.error || !isAreaLabelColumnError(first.error)) return first;
    console.warn('[event-area-label] area_label column missing — saved without it:', first.error.message);
    return run(false);
}

/**
 * Best-effort read of one event's area_label for the edit forms — kept OUT of
 * their main select so the page still loads before 089 (null then).
 */
export async function loadEventAreaLabel(client: any, eventId: string): Promise<string | null> {
    try {
        const { data, error } = await client.from('events').select('area_label').eq('id', eventId).maybeSingle();
        if (error || !data) return null;
        const v = (data as { area_label?: unknown }).area_label;
        return typeof v === 'string' && v.trim() ? v.trim() : null;
    } catch {
        return null;
    }
}
