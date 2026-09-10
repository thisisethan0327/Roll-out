'use server';
/**
 * A web appointment request — the same rollout.appointment_requests row the
 * shop console's inbox and calendar already read, with the console's
 * service vocabulary. The requester is the signed-in member; the preferred
 * time is a wall clock in the visitor's zone (hidden tz field), stored UTC.
 */
import { redirect } from 'next/navigation';
import { getConsumerProfile } from '@/lib/consumer';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveFormZone, zonedWallClockToUtc } from '@/lib/event-time';
import { SERVICE_TYPES } from './services';

export type BookResult = { ok: false; error: string };

export async function requestAppointmentAction(formData: FormData): Promise<BookResult> {
    const me = await getConsumerProfile();
    if (!me) return { ok: false, error: 'Your session expired. Refresh and try again.' };

    const shopId = Number(formData.get('shop_id'));
    const handle = String(formData.get('handle') ?? '');
    const service = String(formData.get('service_type') ?? '');
    const whenRaw = String(formData.get('preferred_at') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim().slice(0, 600) || null;
    const vehicleId = String(formData.get('vehicle_id') ?? '').trim() || null;

    if (!Number.isFinite(shopId) || shopId <= 0) return { ok: false, error: 'Shop not found.' };
    if (!(SERVICE_TYPES as readonly string[]).includes(service)) return { ok: false, error: 'Pick a service.' };

    let preferredAt: string | null = null;
    if (whenRaw) {
        const { timeZone } = resolveFormZone(formData.get('preferred_at_tz'));
        const d = zonedWallClockToUtc(whenRaw, timeZone);
        if (!d) return { ok: false, error: 'That date and time could not be read.' };
        if (d.getTime() < Date.now() - 60_000) return { ok: false, error: 'Pick a time in the future.' };
        preferredAt = d.toISOString();
    }

    const admin = getSupabaseAdmin();
    if (vehicleId) {
        const { data: v } = await admin.from('vehicles').select('id').eq('id', vehicleId).eq('owner_id', me.profileId).maybeSingle();
        if (!v) return { ok: false, error: 'That vehicle is not in your garage.' };
    }
    const { error } = await admin.from('appointment_requests').insert({
        shop_id: shopId,
        requester_profile_id: me.profileId,
        vehicle_id: vehicleId,
        service_type: service,
        preferred_at: preferredAt,
        notes,
    });
    if (error) return { ok: false, error: 'The request could not be sent — try again.' };

    redirect(`/me/appointments?requested=${encodeURIComponent(handle)}`);
}
