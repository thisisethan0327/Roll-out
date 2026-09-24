'use server';
/**
 * Thin Server Action wrappers around lib/event-refund.ts's cancel-and-
 * refund-all logic, so the three cancel surfaces (host /me/events, shop
 * console /shop/[slug]/events/[id], admin events list) can all call the SAME
 * implementation from their client components without each needing its own
 * copy. Permission checks live in event-refund.ts itself (host / shop
 * manager+ / platform admin) — this file adds no authorization of its own.
 */
import { revalidatePath } from 'next/cache';
import {
    cancelEventAndRefundAll,
    previewEventRefundAll,
    type CancelAllResult,
    type EventRefundPreview,
} from './event-refund';

export async function previewEventRefundAllAction(eventId: string): Promise<EventRefundPreview> {
    return previewEventRefundAll(eventId);
}

export async function cancelEventAndRefundAllAction(eventId: string): Promise<CancelAllResult> {
    const result = await cancelEventAndRefundAll(eventId);
    if (result.ok) {
        revalidatePath('/me/events');
        revalidatePath(`/me/events/${eventId}`);
        revalidatePath(`/event/${eventId}`);
        revalidatePath('/meets');
        revalidatePath('/admin/events');
        // Shop-console path is /shop/[slug]/events/[id] — the slug isn't known
        // here, so the caller (which does know it) also calls router.refresh().
    }
    return result;
}
