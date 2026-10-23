'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shopStyles as sh } from '@/components/glide-shop/parts';

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={`g-cb g-cb--fill ${sh.navBtn}`} onClick={() => go(-7)} aria-label="Previous week">
                <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className={`g-sec ${sh.sec}`} onClick={() => go(null)}>
                Today
            </button>
            <button type="button" className={`g-cb g-cb--fill ${sh.navBtn}`} onClick={() => go(7)} aria-label="Next week">
                <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
            </button>
        </div>
    );
}
