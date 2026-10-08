/**
 * Console shell — enforces requirePlatformAdmin once per navigation, then
 * renders the sidebar + content for every page underneath.
 */
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { AdminShell } from '../AdminShell';

export default async function ConsoleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { profile } = await requirePlatformAdmin();
    return <AdminShell adminHandle={profile.handle}>{children}</AdminShell>;
}
