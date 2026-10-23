/**
 * The Glide sign-in shell (board G1 "Sign in"): the day / night cover with the
 * ROLL OUT mark on the left, the sheet card with the form on the right. Below
 * 900px the cover crops to a band and the sheet rides up over it, as on the
 * phone board.
 *
 * `bare` adds a slim bar with the wordmark for the console-segment doors
 * (/shop/login, /shop/apply, /shop/picker), which get no site header.
 * `cover={false}` drops the Rollout imagery: a tenant's own door must never
 * show Rollout branding (lib/tenant-brand.ts).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import './auth.css';

export function AuthBar({ label = 'rollout', href = '/' }: { label?: string; href?: string }) {
    return (
        <div className="ga-bar">
            <Link href={href} className="g-wm">
                {label}
            </Link>
        </div>
    );
}

export function AuthCover() {
    return (
        <div className="ga-cover" aria-hidden="true">
            <picture className="g-only-light">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/glide/welcome-day.webp" alt="" />
            </picture>
            <picture className="g-only-dark">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/glide/welcome-night.webp" alt="" />
            </picture>
            <div className="ga-cover-head">
                <p className="ga-mark">ROLL OUT</p>
                <span className="ga-mark-tri" />
                <p className="ga-mark-line">
                    Find your crew.
                    <br />
                    Hit the road.
                </p>
            </div>
        </div>
    );
}

export function AuthShell({
    title,
    sub,
    children,
    foot,
    terms,
    bare,
    barLabel,
    cover = true,
    edge = true,
    wide,
    titleId = 'auth-title',
}: {
    title: ReactNode;
    sub?: ReactNode;
    children?: ReactNode;
    /** Line under the sheet ("New here? Create your account"). */
    foot?: ReactNode;
    /** Small print under the sheet. */
    terms?: ReactNode;
    bare?: boolean;
    barLabel?: string;
    cover?: boolean;
    edge?: boolean;
    wide?: boolean;
    titleId?: string;
}) {
    const cls = ['ga-auth', cover ? null : 'is-solo', wide ? 'is-wide' : null].filter(Boolean).join(' ');
    return (
        <div className="glide glide-page ga-page">
            <div className="g-wrap">
                {bare ? <AuthBar label={barLabel} /> : null}
                <div className={cls}>
                    {cover ? <AuthCover /> : null}
                    <section className={`g-card ga-sheet${edge ? ' g-edge' : ''}`} aria-labelledby={titleId}>
                        <div className="ga-sheet-in">
                            <h1 className="ga-h" id={titleId}>
                                {title}
                            </h1>
                            {sub ? <p className="ga-sub">{sub}</p> : null}
                            <div className="ga-body">{children}</div>
                            {foot ? <p className="ga-foot">{foot}</p> : null}
                            {terms ? <p className="ga-terms">{terms}</p> : null}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
