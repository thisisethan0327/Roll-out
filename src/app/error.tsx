'use client';
import { StaleDeployRecovery } from '@/components/errors/StaleDeployRecovery';

export default function RouteError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
    return <StaleDeployRecovery error={error} />;
}
