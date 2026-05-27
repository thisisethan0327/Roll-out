import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Sign in on your phone',
    description: 'Rollout magic links open the mobile app. Forward this email to your phone or enter the 6-digit code in the app.',
};

export default function SignInOnPhonePage() {
    return (
        <div className="legal">
            <div className="container container-narrow">
                <div className="eyebrow eyebrow-gold mb-4">／ SIGN-IN HELP</div>
                <h1 style={{ marginBottom: 8 }}>OPEN ON YOUR PHONE</h1>
                <div className="meta">CONTINUE THE SIGN-IN ON YOUR ROLLOUT APP</div>

                <p style={{ fontSize: 17 }}>
                    You opened a Rollout sign-in link on desktop. Magic links route to the mobile app via the{' '}
                    <code style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>mobile://</code>{' '}
                    scheme, so the click won&apos;t do anything useful in a browser.
                </p>

                <h2>Two ways to finish signing in</h2>

                <ol>
                    <li>
                        <strong>Open the email on your phone</strong> and tap the same link. iOS / Android will hand it off to the Rollout app.
                    </li>
                    <li>
                        <strong>Use the 6-digit code in the email instead.</strong> The Rollout app asks for it on the email sign-in screen — works on any device, no link click needed.
                    </li>
                </ol>

                <div
                    style={{
                        marginTop: 40,
                        padding: 24,
                        background: 'var(--bg-2)',
                        border: '1px solid var(--line)',
                        position: 'relative',
                    }}
                    className="corner-wrap"
                >
                    <span className="corner-bottom-left" />
                    <span className="corner-bottom-right" />
                    <div className="eyebrow eyebrow-gold" style={{ marginBottom: 10 }}>
                        DON&apos;T HAVE ROLLOUT YET?
                    </div>
                    <p style={{ marginBottom: 18 }}>
                        Grab the app and your sign-in code will work the moment you reach the email screen.
                    </p>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <a className="btn" href="https://apps.apple.com/" rel="noopener" target="_blank">
                            Download iOS
                        </a>
                        <a className="btn btn-ghost" href="https://play.google.com/" rel="noopener" target="_blank">
                            Get Android
                        </a>
                    </div>
                </div>

                <h2>Still stuck?</h2>
                <p>
                    Email <a href="mailto:support@rollout.club">support@rollout.club</a> with the email address you used
                    and we&apos;ll get you in within 24 hours.
                </p>

                <div style={{ marginTop: 48 }}>
                    <Link href="/" className="mono-row">
                        <span className="accent">←</span> BACK TO ROLLOUT.CLUB
                    </Link>
                </div>
            </div>
        </div>
    );
}
