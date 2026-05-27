import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'Rollout (UNITY USA LLC) terms of service.',
};

export default function TermsPage() {
    return <LegalPage docKey="terms" />;
}
