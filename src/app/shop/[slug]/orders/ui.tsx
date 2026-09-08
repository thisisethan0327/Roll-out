/**
 * Server-safe presentational helpers for the Orders section (shared by the list
 * and detail views). Pure rendering — no client hooks. Matches the shop
 * dashboard's HUD idiom (admin-pill / mono / --gold).
 */

export function fmtMoney(amount: number | null | undefined, currency?: string | null): string {
    if (amount == null) return '—';
    const cur = (currency ?? 'usd').toUpperCase();
    const prefix = cur === 'USD' ? '$' : cur + ' ';
    return `${prefix}${Number(amount).toFixed(2)}`;
}

export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    // Locale AND time zone are pinned. With neither, the server formats in the
    // container's locale and UTC while the browser uses the visitor's — two
    // different strings for the same timestamp, which is React hydration error
    // #418 on every orders and order-detail navigation (run 10, lane G2).
    //
    // Pacific because the shops these consoles serve are, and because the meets
    // map already pins the same zone. If Rollout ever hosts a shop outside
    // Pacific this should become a client-rendered local time instead — a
    // pinned zone is right for one region and merely consistent everywhere
    // else.
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Los_Angeles',
    });
}

/** Mask the middle of an email: joh•••@domain.com → keeps first 3 + domain. */
export function maskEmail(email: string | null | undefined): string {
    if (!email) return '—';
    const at = email.indexOf('@');
    if (at <= 0) return email;
    const local = email.slice(0, at);
    const domain = email.slice(at);
    const keep = Math.min(3, local.length);
    const shown = local.slice(0, keep);
    return `${shown}${'•'.repeat(Math.max(2, local.length - keep))}${domain}`;
}

type PillVariant = '' | 'gold' | 'neon' | 'warn';

function pillVariant(status: string | null | undefined): PillVariant {
    const s = (status ?? '').toLowerCase();
    if (
        ['captured', 'paid', 'shipped', 'delivered', 'fulfilled', 'completed'].includes(s)
    )
        return 'neon';
    if (['canceled', 'cancelled', 'refunded', 'void', 'not_paid'].includes(s)) return 'warn';
    if (
        [
            'authorized',
            'pending',
            'not_fulfilled',
            'partially_fulfilled',
            'partially_shipped',
            'partially_captured',
            'awaiting',
            'requires_action',
        ].includes(s)
    )
        return 'gold';
    return '';
}

export function StatusChip({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    return (
        <span className={`admin-pill ${pillVariant(status)}`}>
            {String(status).replace(/_/g, ' ').toUpperCase()}
        </span>
    );
}
