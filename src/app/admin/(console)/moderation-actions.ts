'use server';
import { revalidatePath } from 'next/cache';
import { logAdminAction, requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { eventHasPaidExposure } from '@/lib/event-refund';

export async function forceDeletePost(postId: string) {
    const { profile } = await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', postId);
    if (error) throw new Error(error.message);
    await logAdminAction(profile, 'post.force_delete', 'post', postId);
    revalidatePath('/admin/posts');
    revalidatePath('/admin/overview');
}

export async function forceCancelEvent(eventId: string) {
    const { profile } = await requirePlatformAdmin();

    // 077: even a platform-admin force-cancel must not skip refunds on a paid
    // event — cancelEventAndRefundAllAction (available to platform admins
    // too) is the path for that; it cancels AND refunds atomically.
    const paid = await eventHasPaidExposure(eventId);
    if (paid) {
        throw new Error(
            'This event has paid tickets — use "Cancel event & refund everyone" so ticket holders are refunded.',
        );
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', eventId);
    if (error) throw new Error(error.message);
    console.warn('[admin] @%s force-cancelled event %s', profile.handle, eventId);
    await logAdminAction(profile, 'event.force_cancel', 'event', eventId);
    revalidatePath('/admin/events');
    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath('/admin/overview');
}
