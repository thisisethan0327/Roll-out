'use server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('events')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', eventId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/events');
    revalidatePath('/admin/overview');
}
