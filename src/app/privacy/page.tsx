import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'How Rollout (UNITY USA LLC) collects, uses, and protects your data.',
};

export default function PrivacyPage() {
    return <LegalPage docKey="privacy" />;
}
