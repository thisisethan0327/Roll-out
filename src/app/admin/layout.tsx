/**
 * Admin route group root layout — pass-through. The actual chrome lives in
 * the (console) route group so /admin/login stays uncluttered.
 */
export const metadata = {
    title: { template: '%s · Rollout Admin', default: 'Rollout Admin' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
