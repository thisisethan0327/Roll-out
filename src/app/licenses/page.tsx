import type { Metadata } from 'next';
import { ArrowRight, Mail } from 'lucide-react';
import { Card, Chip } from '@/components/glide/primitives';
import '@/components/glide-auth/auth.css';

export const metadata: Metadata = {
    alternates: { canonical: '/licenses' },
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
        <div className="glide glide-page ga-read">
            <div className="g-wrap">
                <div className="ga-read-grid is-single">
                    <Card as="article" className="ga-doc">
                        <header className="ga-doc-h">
                            <h1>Open-source licenses</h1>
                            <p className="ga-doc-meta">
                                <span>Libraries that make Rollout possible</span>
                            </p>
                        </header>

                        <p className="ga-doc-lede">
                            Rollout stands on the shoulders of an enormous open-source community. Below is a
                            non-exhaustive list of the most-load-bearing libraries we use. A complete machine-readable
                            license file ships with the mobile app via <code>expo-licenses</code> — open Settings{' '}
                            <ArrowRight size={15} strokeWidth={2} aria-label="then" style={{ verticalAlign: '-2px' }} /> Open-Source Licenses
                            inside the app to see every dependency.
                        </p>

                        <ul className="ga-lic" aria-label="Libraries">
                            <li className="is-head" aria-hidden="true">
                                <span>Library</span>
                                <span>License</span>
                                <span>Used for</span>
                            </li>
                            {LIBS.map((lib) => (
                                <li key={lib.name}>
                                    <b>{lib.name}</b>
                                    <Chip>{lib.license}</Chip>
                                    <span>{lib.usage}</span>
                                </li>
                            ))}
                        </ul>

                        <footer className="ga-doc-foot">
                            <span>Questions about attribution or license terms?</span>
                            <a href="mailto:legal@rollout.club">
                                <Mail size={16} strokeWidth={2} aria-hidden="true" />
                                legal@rollout.club
                            </a>
                        </footer>
                    </Card>
                </div>
            </div>
        </div>
    );
}
