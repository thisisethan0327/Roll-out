'use client';
import { useRouter } from 'next/navigation';

function fmtYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function CalendarNav({ slug, weekStart }: { slug: string; weekStart: string }) {
    const router = useRouter();
    const current = new Date(weekStart + 'T00:00:00');

    const go = (offsetDays: number | null) => {
        if (offsetDays === null) {
            const today = new Date();
            const sunday = new Date(today);
            sunday.setDate(today.getDate() - today.getDay());
            sunday.setHours(0, 0, 0, 0);
            router.push(`/shop/${slug}/calendar?week=${fmtYmd(sunday)}`);
            return;
        }
        const next = new Date(current);
        next.setDate(current.getDate() + offsetDays);
        router.push(`/shop/${slug}/calendar?week=${fmtYmd(next)}`);
    };

    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="admin-action-btn muted" onClick={() => go(-7)}>
                ‹ PREV WEEK
            </button>
            <button className="admin-action-btn" onClick={() => go(null)}>
                TODAY
            </button>
            <button className="admin-action-btn muted" onClick={() => go(7)}>
                NEXT WEEK ›
            </button>
        </div>
    );
}
