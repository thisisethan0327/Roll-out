import { AuthShell } from '@/components/glide-auth/AuthShell';
import { GlideButton, SecButton } from '@/components/glide/primitives';

/**
 * Glide 404: the auth lane's sheet without the Rollout cover or tricolore edge,
 * so it reads the same on rollout.club and behind a tenant's own door.
 */
export default function NotFound() {
    return (
        <AuthShell
            title="Page not found"
            sub="That page doesn't exist. Try the meets, the home page, or the help center."
            cover={false}
            edge={false}
        >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <GlideButton href="/">Home</GlideButton>
                <SecButton href="/meets">Find a meet</SecButton>
                <SecButton href="/help">Help center</SecButton>
            </div>
        </AuthShell>
    );
}
