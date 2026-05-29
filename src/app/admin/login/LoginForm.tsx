'use client';
import { OtpLoginForm } from '@/components/auth/OtpLoginForm';

export function LoginForm() {
    return (
        <OtpLoginForm
            successPath="/admin/overview"
            redirectSuffix="/admin/login"
        />
    );
}
