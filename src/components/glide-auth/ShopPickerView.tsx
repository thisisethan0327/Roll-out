/**
 * /shop/picker in Glide: one row per shop the member staffs, or the no-access
 * card. Presentational; the page does the session check and the lookup.
 */
import Link from 'next/link';
import { ChevronRight, Store } from 'lucide-react';
import { IconRoundel } from '@/components/glide/primitives';
import { AuthShell } from './AuthShell';

export type PickerShop = { shopId: number; slug: string; name: string; role: string };

function roleLabel(role: string): string {
    return role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';
}

export function ShopPickerView({ shops, barLabel }: { shops: PickerShop[]; barLabel?: string }) {
    if (shops.length === 0) {
        return (
            <AuthShell
                bare
                barLabel={barLabel}
                cover={false}
                title="Not a shop member"
                sub={
                    <>
                        Your account isn&apos;t on any shop&apos;s staff list. Reach out to{' '}
                        <a className="ga-a" href="mailto:team@rollout.club">
                            team@rollout.club
                        </a>{' '}
                        if that&apos;s not right.
                    </>
                }
            />
        );
    }

    return (
        <AuthShell
            bare
            barLabel={barLabel}
            cover={false}
            title="Pick a shop"
            sub={
                <>
                    You&apos;re a member of <span className="g-w">{shops.length}</span> shops. Each shop has its own inbox, calendar,
                    and customer data.
                </>
            }
        >
            <ul className="g-rows ga-rows">
                {shops.map((s) => (
                    <li key={s.shopId}>
                        <Link className="g-row" href={`/shop/${s.slug}/overview`}>
                            <IconRoundel>
                                <Store size={20} strokeWidth={1.75} />
                            </IconRoundel>
                            <span className="g-row-t">
                                <b>{s.name}</b>
                                <small>
                                    @{s.slug} · {roleLabel(s.role)}
                                </small>
                            </span>
                            <ChevronRight className="g-row-ch" size={20} strokeWidth={2} aria-hidden="true" />
                        </Link>
                    </li>
                ))}
            </ul>
        </AuthShell>
    );
}
