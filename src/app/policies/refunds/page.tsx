import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
    title: 'Refund & Cancellation Policy',
    description:
        'Rollout paid-event refund and cancellation policy: full refund more than 72 hours before the start, no refunds inside 72 hours, no transfers, and automatic full refunds when a host cancels.',
};

export default function RefundPolicyPage() {
    return <LegalPage docKey="refunds" />;
}
