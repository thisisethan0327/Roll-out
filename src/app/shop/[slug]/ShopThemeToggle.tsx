'use client';

/**
 * Shop-console Appearance control. Lives in the ShopSidebar footer.
 *
 * Glide: the console follows the site Appearance setting (Theme: System ·
 * Light · Dark, and the Midnight · Graphite dark style), stamped on <html>
 * before first paint from the rollout-theme / rollout-dark cookies, so there
 * is no flash. This button opens the kit's Appearance control in a sheet; it
 * writes those same cookies and re-themes the page live. Device-only, as
 * everywhere else on the site.
 *
 * The export name is kept so the admin "acting as shop" sub-sidebar keeps
 * working unchanged.
 */
import { useState } from 'react';
import { Contrast } from 'lucide-react';
import { Sheet } from '@/components/glide/Sheet';
import { Appearance } from '@/components/glide/Appearance';

export function ShopThemeToggle({ className }: { className?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                className={['g-sec g-sec--ink', className].filter(Boolean).join(' ')}
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
            >
                <Contrast size={17} strokeWidth={2} aria-hidden="true" />
                Appearance
            </button>
            <Sheet open={open} onClose={() => setOpen(false)} title="Appearance">
                <div style={{ padding: '6px 24px 8px' }}>
                    <Appearance idPrefix="shop-appearance" />
                </div>
            </Sheet>
        </>
    );
}
