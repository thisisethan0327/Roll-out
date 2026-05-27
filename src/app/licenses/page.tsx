import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Open-Source Licenses',
    description: 'Third-party libraries used in Rollout.',
};

const LIBS: Array<{ name: string; license: string; usage: string }> = [
    { name: 'React Native', license: 'MIT', usage: 'Mobile app framework' },
    { name: 'Expo', license: 'MIT', usage: 'Native module + build pipeline' },
    { name: 'expo-router', license: 'MIT', usage: 'File-based navigation' },
    { name: 'expo-image-manipulator', license: 'MIT', usage: 'Client-side image compression' },
    { name: 'expo-image-picker', license: 'MIT', usage: 'Photo + camera access' },
    { name: 'expo-local-authentication', license: 'MIT', usage: 'Face ID / Touch ID unlock' },
    { name: 'react-native-maps', license: 'MIT', usage: 'Sector map' },
    { name: 'react-native-reanimated', license: 'MIT', usage: 'Animations + gestures' },
    { name: 'react-native-svg', license: 'MIT', usage: 'Icon rendering' },
    { name: '@supabase/supabase-js', license: 'MIT', usage: 'Backend client (auth + DB + storage)' },
    { name: 'zustand', license: 'MIT', usage: 'State management' },
    { name: 'Next.js', license: 'MIT', usage: 'This website' },
    { name: 'Inter font', license: 'OFL', usage: 'Body type' },
    { name: 'JetBrains Mono', license: 'OFL', usage: 'Display + mono type' },
    { name: 'Noto Sans JP', license: 'OFL', usage: 'Japanese subtitles' },
];

export default function LicensesPage() {
    return (
        <div className="legal">
            <div className="container container-narrow">
                <div className="eyebrow eyebrow-gold mb-4">／ ATTRIBUTION</div>
                <h1>OPEN-SOURCE LICENSES</h1>
                <div className="meta">LIBRARIES THAT MAKE ROLLOUT POSSIBLE</div>

                <p>
                    Rollout stands on the shoulders of an enormous open-source community. Below is a
                    non-exhaustive list of the most-load-bearing libraries we use. A complete machine-readable
                    license file ships with the mobile app via{' '}
                    <code style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>expo-licenses</code>{' '}
                    — open Settings → Open-Source Licenses inside the app to see every dependency.
                </p>

                <div style={{ marginTop: 32, border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1.5fr 1fr 2fr',
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--line)',
                            fontFamily: 'var(--font-display)',
                            fontSize: 10,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--text-3)',
                            textTransform: 'uppercase',
                        }}
                    >
                        <span>LIBRARY</span>
                        <span>LICENSE</span>
                        <span>USED FOR</span>
                    </div>
                    {LIBS.map((lib, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1.5fr 1fr 2fr',
                                padding: '12px 16px',
                                borderBottom: i === LIBS.length - 1 ? 'none' : '1px solid var(--line)',
                                fontSize: 13,
                            }}
                        >
                            <span style={{ color: 'var(--text)' }}>{lib.name}</span>
                            <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 11 }}>{lib.license}</span>
                            <span className="text-dim">{lib.usage}</span>
                        </div>
                    ))}
                </div>

                <p style={{ marginTop: 32 }}>
                    Questions about attribution or license terms? Email{' '}
                    <a href="mailto:legal@rollout.club">legal@rollout.club</a>.
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
