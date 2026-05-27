// Single source of truth for Terms / Privacy / Community Guidelines.
//
// Mirrored from mobile/src/screens/LegalDocumentScreen.tsx. If you update
// one side, also update the other — the mobile app links here as a
// fallback for users who tap from email.

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = { title: string; updated: string; body: LegalSection[] };

export const LEGAL: Record<'terms' | 'privacy' | 'guidelines', LegalDoc> = {
    terms: {
        title: 'TERMS OF SERVICE',
        updated: '2026-05-25',
        body: [
            {
                heading: '1. Acceptance',
                paragraphs: [
                    'By creating a Rollout account, you agree to these Terms of Service ("Terms"). If you do not agree, do not use the app.',
                    'Rollout is operated by UNITY USA LLC ("we", "us"). These Terms form a binding agreement between you and us.',
                ],
            },
            {
                heading: '2. Eligibility',
                paragraphs: [
                    'You must be at least 13 years old to use Rollout. If you are between 13 and 18, you confirm a parent or legal guardian has reviewed and accepts these Terms on your behalf.',
                    'One person, one account. You are responsible for everything that happens on your account.',
                ],
            },
            {
                heading: '3. Acceptable use',
                paragraphs: [
                    'You agree not to post or share content that is illegal, harassing, hateful, threatening, sexually explicit, fraudulent, infringing, or otherwise objectionable. See the Community Guidelines for the full list.',
                    'We have zero tolerance for objectionable content and abusive behavior. We will remove violating content, suspend or terminate accounts, and cooperate with law enforcement when required.',
                ],
            },
            {
                heading: '4. Your content',
                paragraphs: [
                    "You retain ownership of the photos, posts, comments, and messages you create on Rollout (\"Your Content\"). By posting, you grant us a worldwide, royalty-free license to host, display, and distribute Your Content within Rollout and on related marketing channels, subject to your privacy settings.",
                    "You represent that you have the rights to everything you post and that your posts do not infringe anyone else's rights.",
                ],
            },
            {
                heading: '5. Reports and moderation',
                paragraphs: [
                    'You can report any post, profile, message, or comment from inside the app. We review every report within 24 hours and take action when our Community Guidelines have been violated.',
                    'Action may include removing the content, warning the user, suspending the account, or in serious cases banning the user permanently and reporting to authorities.',
                ],
            },
            {
                heading: '6. Account termination',
                paragraphs: [
                    'You can delete your account from Settings → Delete Account at any time. Deletion is permanent and removes your profile, posts, garage, and messages.',
                    'We may suspend or terminate your account if you violate these Terms or the Community Guidelines.',
                ],
            },
            {
                heading: '7. Disclaimer of warranties',
                paragraphs: [
                    'Rollout is provided "as is" without warranties of any kind. We do not guarantee continuous availability, security against all threats, or that any specific feature will always work.',
                ],
            },
            {
                heading: '8. Limitation of liability',
                paragraphs: [
                    'To the maximum extent permitted by law, UNITY USA LLC will not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of Rollout.',
                ],
            },
            {
                heading: '9. Governing law',
                paragraphs: [
                    'These Terms are governed by the laws of the State of Washington, USA. Disputes will be resolved in the state or federal courts located in King County, Washington.',
                ],
            },
            {
                heading: '10. Changes',
                paragraphs: [
                    'We may update these Terms. When we do, we will revise the "Last updated" date above and, for material changes, notify you in-app. Continued use after changes means you accept them.',
                ],
            },
            {
                heading: '11. Contact',
                paragraphs: ['Questions? Email team@rollout.club. Abuse reports: support@rollout.club.'],
            },
        ],
    },

    privacy: {
        title: 'PRIVACY POLICY',
        updated: '2026-05-25',
        body: [
            {
                heading: '1. What we collect',
                paragraphs: [
                    'Account info: email or phone number, display name, handle, optional bio and location.',
                    'Content you post: photos, build logs, posts, comments, and messages.',
                    'Vehicle data: makes, models, years, modifications you choose to add to your garage.',
                    'Device info: model, OS version, app version. Required for crash reports and performance.',
                    'Usage info: which screens you visit, which posts you interact with. Used to improve the app and personalize your feed.',
                ],
            },
            {
                heading: '2. What we do NOT collect',
                paragraphs: [
                    'We do not collect: payment card numbers (handled by Stripe), social security numbers, biometric data, browsing history outside Rollout, or precise location without your explicit permission.',
                    'We do not track you across other apps or websites.',
                ],
            },
            {
                heading: '3. How we use it',
                paragraphs: [
                    'To deliver the service: show your feed, deliver messages, surface meets near you.',
                    'To enforce our Community Guidelines and act on user reports.',
                    'To improve product features and fix bugs (aggregated, non-identifying analytics).',
                    'To send transactional emails (sign-in codes, receipts, account notifications). Marketing emails are opt-in only.',
                ],
            },
            {
                heading: '4. Who we share it with',
                paragraphs: [
                    'Other Rollout users: per your privacy settings (DM policy, Ghost Mode, hide location, etc.).',
                    'Our service providers: Supabase (database/auth), Resend (email), Twilio (SMS), Stripe (payments), and crash-reporting services. Each is bound by data-processing agreements.',
                    'Law enforcement: when required by valid legal process. We will notify you unless prohibited.',
                    'We do not sell your personal data. Ever.',
                ],
            },
            {
                heading: '5. Your rights',
                paragraphs: [
                    'Access: request a copy of your data via Settings → Privacy → Download Your Data.',
                    'Deletion: delete your account in-app via Settings → Delete Account. Deletion is permanent.',
                    'Correction: edit your profile at any time in Settings.',
                    'California (CCPA) and EU (GDPR) residents have additional rights including the right to opt out of any sale of personal information (we do not sell). Email privacy@rollout.club to exercise these.',
                ],
            },
            {
                heading: '6. Data retention',
                paragraphs: [
                    'Active accounts: retained while your account is in use.',
                    'Deleted accounts: profile + content removed within 30 days. Some records (moderation history, legal holds) retained as required by law.',
                    'Logs and analytics: retained up to 90 days then aggregated.',
                ],
            },
            {
                heading: '7. Children',
                paragraphs: [
                    'Rollout is not intended for users under 13. We do not knowingly collect data from children under 13. If you believe a child has created an account, email privacy@rollout.club.',
                ],
            },
            {
                heading: '8. Security',
                paragraphs: [
                    'All traffic uses HTTPS. Passwords are hashed (we use Supabase Auth). We follow industry-standard practices but no system is perfectly secure. We will notify affected users of any breach as required by law.',
                ],
            },
            {
                heading: '9. Changes',
                paragraphs: [
                    'We will revise the "Last updated" date above when this policy changes and notify you in-app for material changes.',
                ],
            },
            {
                heading: '10. Contact',
                paragraphs: ['Privacy questions: privacy@rollout.club'],
            },
        ],
    },

    guidelines: {
        title: 'COMMUNITY GUIDELINES',
        updated: '2026-05-25',
        body: [
            {
                heading: 'Our standard',
                paragraphs: [
                    'Rollout is a community for car people. Be the version of yourself you would want to meet at a meet.',
                    'These guidelines apply to every post, profile, comment, photo, and DM. Violations get content removed and may get accounts suspended or banned.',
                ],
            },
            {
                heading: 'What is not allowed',
                paragraphs: [
                    '• Harassment, bullying, or threats — toward anyone, for any reason.',
                    '• Hate speech or attacks based on race, ethnicity, national origin, religion, gender, gender identity, sexual orientation, age, or disability.',
                    '• Sexual content or nudity. Rollout is not the platform for it.',
                    '• Violence, threats of violence, glorification of self-harm, or suicide ideation directed at others.',
                    '• Illegal activity — including drug sales, weapons sales, stolen-parts sales, or anything that would land you in court.',
                    '• Spam, scams, or repeated unwanted contact. This includes fake giveaways and pyramid schemes.',
                    '• Impersonation of a person, shop, or brand.',
                    "• Doxxing — sharing someone's home address, phone, or other private info without consent.",
                    '• Copyright or trademark infringement.',
                ],
            },
            {
                heading: 'How to report',
                paragraphs: [
                    'On any post: tap the ⋯ menu → Report post.',
                    'On any profile: tap the ⋯ menu → Report user.',
                    'In any chat: tap the ⋯ menu → Report this user / conversation.',
                    'You can also email support@rollout.club.',
                ],
            },
            {
                heading: 'What happens after a report',
                paragraphs: [
                    'We review every report within 24 hours.',
                    'If we find a violation we remove the content, warn the user, suspend the account, or ban the user — depending on severity. We may also report to law enforcement for serious violations (threats, CSAM, etc.).',
                    'We do not share who reported whom.',
                ],
            },
            {
                heading: 'Blocking',
                paragraphs: [
                    "You can block any user from their profile (⋯ → Block). Blocked users can't see your posts, can't DM you, and can't follow you. You won't see their content either.",
                    'Manage your block list in Settings → Privacy.',
                ],
            },
            {
                heading: 'Appeals',
                paragraphs: [
                    'If we take action on your account and you believe it was a mistake, email appeals@rollout.club within 30 days. We will review and respond within 5 business days.',
                ],
            },
        ],
    },
};
