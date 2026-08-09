'use server';
/**
 * Shared server actions for the /me consumer portal.
 */
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';

/** Sign the member out (clears the SSR cookie session) and return home. */
export async function signOutAction(): Promise<void> {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();
    redirect('/');
}
