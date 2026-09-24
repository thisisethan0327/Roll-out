'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { eventHasPaidExposure } from '@/lib/event-refund';

export async function forceDeletePost(postId: string) {
    await requirePlatformAdmin();
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', postId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/posts');
    revalidatePath('/admin/overview');
}

export async function forceCancelEvent(eventId: string) {
    await requirePlatformAdmin();

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
    revalidatePath('/admin/events');
    revalidatePath('/admin/overview');
}
