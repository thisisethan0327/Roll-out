import type { Metadata } from 'next';
import { LogIn, Smartphone } from 'lucide-react';
import { APP_STORE_URL, IOS_BETA_URL } from '@/lib/app-links';
import { Card, GlideButton, SecButton } from '@/components/glide/primitives';
import '@/components/glide-auth/auth.css';

export const metadata: Metadata = {
    alternates: { canonical: '/sign-in-on-phone' },
    title: 'Sign in on your phone',
    description: 'Rollout magic links open the mobile app. Forward this email to your phone or enter the 6-digit code in the app.',
};

export default function SignInOnPhonePage() {
    return (
        <div className="glide glide-page ga-read">
            <div className="g-wrap">
                <div className="ga-read-grid is-single">
                    <Card as="article" className="ga-doc">
                        <header className="ga-doc-h">
                            <h1>Open on your phone</h1>
                            <p className="ga-doc-meta">
                                <span>Continue the sign-in on your Rollout app</span>
                            </p>
                        </header>

                        <p className="ga-doc-lede">
                            You opened a Rollout sign-in link in a web browser. Magic links route to the mobile app via the{' '}
                            <code>mobile://</code> scheme, so the click won&apos;t do anything useful in a browser.
                        </p>

                        <div className="ga-prose">
                            <h2>Two ways to finish signing in</h2>
                        </div>
                        <ol className="ga-steps">
                            <li>
                                <span className="ga-n" aria-hidden="true">
                                    1
                                </span>
                                <p>
                                    <strong>Open the email on your phone</strong> and tap the same link. iOS / Android will hand it off to the
                                    Rollout app.
                                </p>
                            </li>
                            <li>
                                <span className="ga-n" aria-hidden="true">
                                    2
                                </span>
                                <p>
                                    <strong>Use the 6-digit code in the email instead.</strong> The Rollout app asks for it on the email sign-in
                                    screen — works on any device, no link click needed.
                                </p>
                            </li>
                        </ol>

                        <div className="ga-prose">
                            <h2>Still stuck?</h2>
                            <p>
                                Email <a href="mailto:support@rollout.club">support@rollout.club</a> with the email address you used and
                                we&apos;ll get you in within 24 hours.
                            </p>
                        </div>
                    </Card>

                    <Card edge className="ga-cta">
                        <div>
                            <h2>Don&apos;t have Rollout yet?</h2>
                            <p>Rollout works in your browser — the same 6-digit code signs you in on any device.</p>
                        </div>
                        <div className="ga-cta-act">
                            <GlideButton href="/login" size="sm" icon={<LogIn size={18} strokeWidth={2} />}>
                                Sign in here
                            </GlideButton>
                            <SecButton href={APP_STORE_URL ?? IOS_BETA_URL} external>
                                <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" />
                                {APP_STORE_URL ? 'Download iOS' : 'iOS beta'}
                            </SecButton>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
