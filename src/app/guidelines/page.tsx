import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
    alternates: { canonical: '/guidelines' },
    title: 'Community Guidelines',
    description: 'Rollout community standards and moderation policies.',
};

export default function GuidelinesPage() {
    return <LegalPage docKey="guidelines" />;
}
