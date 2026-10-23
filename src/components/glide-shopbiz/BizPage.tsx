/**
 * The root of every shop-console business page (orders, products, sell,
 * services, reviews, posts, page, staff, settings, account).
 *
 *   frame  `.glide`: the Glide palette for the page. Deliberately not a
 *          `.glide-page`: that one restyles <body>, and the console shell
 *          around these pages belongs to the shopops lane.
 *   page   the /me console's `.scope` (legacy admin-* pieces read in Glide,
 *          stacked sections) plus this lane's surface and tokens
 *
 * Tenant doors: a shop with its own brand (lib/tenant-brand.ts — UNITY USA,
 * Popeye Energy) gets `.tenant`: its accent in place of Rollout's blues,
 * neutral surfaces, and no tricolore. The legacy console does the same by
 * slug (its accent overrides --gold on .shop-layout on rollout.club and on
 * the tenant host alike), so this keys on the slug too.
 *
 * Server-safe: no hooks.
 */
import type { CSSProperties, ReactNode } from 'react';
import { brandForSlug, ROLLOUT_BRAND } from '@/lib/tenant-brand';
import cs from '@/components/glide-console/console.module.css';
import b from './biz.module.css';

export function isTenantSlug(slug: string): boolean {
    return brandForSlug(slug) !== ROLLOUT_BRAND;
}

export function BizPage({ slug, children, className }: { slug: string; children: ReactNode; className?: string }) {
    const brand = brandForSlug(slug);
    const tenant = brand !== ROLLOUT_BRAND;
    const style = tenant ? ({ '--tenant-accent': brand.accent } as CSSProperties) : undefined;
    return (
        <div className={`glide ${b.frame}`}>
            <div
                className={[cs.scope, b.page, tenant ? b.tenant : '', className ?? ''].filter(Boolean).join(' ')}
                style={style}
                data-tenant={tenant ? slug : undefined}
            >
                {children}
            </div>
        </div>
    );
}
