'use client';
import { StaleDeployRecovery } from '@/components/errors/StaleDeployRecovery';

// Replaces the root layout when it throws, so it must render its own html/body.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="en">
            <body style={{ margin: 0, background: '#050505' }}>
                <StaleDeployRecovery error={error} />
            </body>
        </html>
    );
}
