import Link from 'next/link';
import { Appearance } from './glide/Appearance';
import { Tricolore } from './glide/primitives';

/**
 * Public site footer, in Glide. Same links as before; the Appearance control
 * sits here too, so a signed-out visitor can pick a theme (signed-in members
 * also have it on /me/settings).
 */
export function SiteFooter() {
    const year = new Date().getFullYear();
    return (
        <footer className="glide g-foot">
            <Tricolore thin />
            <div className="g-wrap g-foot-in">
                <div className="g-foot-top">
                    <div className="g-foot-brand">
                        <Link href="/" className="g-wm" aria-label="Rollout home">
                            rollout
                        </Link>
                        <p>Meets, runs and the shops you trust. A private network for the cars you build.</p>
                    </div>

                    <FooterColumn title="Product">
                        <Link href="/meets">Meets</Link>
                        <Link href="/shops">Shops</Link>
                        <Link href="/store">Store</Link>
                        <Link href="/signup">Create your account</Link>
                        <Link href="/sign-in-on-phone">Sign-in help</Link>
                    </FooterColumn>

                    <FooterColumn title="Company">
                        <Link href="/help">Help center</Link>
                        <a href="mailto:team@rollout.club">Contact</a>
                        <a href="mailto:support@rollout.club">Report a problem</a>
                        {/* The operator's own site — the same company as the
                            legal line below, nothing more. */}
                        <a href="https://unityusa.co">A UNITY USA platform</a>
                    </FooterColumn>

                    <FooterColumn title="Legal">
                        <Link href="/terms">Terms of Service</Link>
                        <Link href="/privacy">Privacy Policy</Link>
                        <Link href="/guidelines">Community Guidelines</Link>
                        <Link href="/policies/refunds">Refund &amp; Cancellation Policy</Link>
                    </FooterColumn>

                    <section className="g-foot-appearance" aria-labelledby="foot-appearance">
                        <h2 id="foot-appearance">Appearance</h2>
                        <Appearance compact idPrefix="foot-appearance" />
                    </section>
                </div>

                <div className="g-foot-legal">
                    <span>Rollout · UNITY USA LLC</span>
                    <span>© {year} UNITY USA LLC</span>
                </div>
            </div>
        </footer>
    );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode[] }) {
    return (
        <nav aria-label={title}>
            <h2>{title}</h2>
            <ul>
                {children.map((c, i) => (
                    <li key={i}>{c}</li>
                ))}
            </ul>
        </nav>
    );
}
