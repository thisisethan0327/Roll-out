/**
 * Console shell — enforces requirePlatformAdmin once per navigation, then
 * renders the sidebar + content for every page underneath.
 */
import { requirePlatformAdmin } from '@/lib/auth-guard';
import { AdminSidebar } from '../AdminSidebar';

export default async function ConsoleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { profile } = await requirePlatformAdmin();
    return (
        <div className="admin-layout">
            <AdminSidebar adminLabel={`@${profile.handle}`} />
            <div className="admin-main">{children}</div>
        </div>
    );
}
