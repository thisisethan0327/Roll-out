import 'server-only';
/**
 * The member's default shipping address lives on their MEDUSA customer — the
 * store checkout adopts that customer from the platform session (run 11), so
 * an address saved at onboarding is the one checkout prefills. Nothing is
 * stored on rollout.profiles: commerce identity stays in the commerce system.
 *
 * Both calls are best-effort: a Medusa outage at onboarding must not block the
 * member, so the caller tells them to add the address at checkout instead.
 */
import { MEDUSA_URL, medusaHeaders } from './medusa';
import { ensureMedusaCustomerToken } from './medusa-customer';
import type { AddressInput } from './medusa-types';

function auth(token: string): Record<string, string> {
    return { ...medusaHeaders(), Authorization: `Bearer ${token}` };
}

/** Save `a` as the customer's default shipping address (creating the customer link if needed). */
export async function saveDefaultShippingAddress(a: AddressInput): Promise<{ ok: true } | { ok: false; error: string }> {
    const token = await ensureMedusaCustomerToken();
    if (!token) return { ok: false, error: 'Store account not connected.' };
    try {
        const res = await fetch(`${MEDUSA_URL}/store/customers/me/addresses`, {
            method: 'POST',
            headers: auth(token),
            body: JSON.stringify({
                first_name: a.firstName,
                last_name: a.lastName,
                address_1: a.address1,
                address_2: a.address2 || undefined,
                city: a.city,
                province: a.province,
                postal_code: a.postalCode,
                country_code: a.countryCode.toLowerCase(),
                phone: a.phone || undefined,
                is_default_shipping: true,
                address_name: 'Shipping',
            }),
            cache: 'no-store',
        });
        if (!res.ok) return { ok: false, error: `Store refused the address (${res.status}).` };
        return { ok: true };
    } catch {
        return { ok: false, error: 'Store unreachable.' };
    }
}

/** The customer's default shipping address (or the first one), as checkout's AddressInput. Null when none / not linked. */
export async function loadDefaultShippingAddress(): Promise<AddressInput | null> {
    const token = await ensureMedusaCustomerToken();
    if (!token) return null;
    try {
        const res = await fetch(`${MEDUSA_URL}/store/customers/me?fields=*addresses`, { headers: auth(token), cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        const list: any[] = json?.customer?.addresses ?? [];
        const a = list.find((x) => x?.is_default_shipping) ?? list[0];
        if (!a) return null;
        return {
            firstName: a.first_name ?? '',
            lastName: a.last_name ?? '',
            address1: a.address_1 ?? '',
            address2: a.address_2 ?? '',
            city: a.city ?? '',
            province: a.province ?? '',
            postalCode: a.postal_code ?? '',
            countryCode: (a.country_code ?? 'us').toLowerCase(),
            phone: a.phone ?? '',
        };
    } catch {
        return null;
    }
}
