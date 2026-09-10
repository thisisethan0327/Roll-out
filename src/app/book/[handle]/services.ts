/** The console's appointment vocabulary (shop/[slug]/inbox SERVICE_LABEL), as a member reads it. */
export const SERVICE_TYPES = ['WRAP', 'PPF', 'TINT', 'CERAMIC', 'PARTS', 'OTHER'] as const;
export const SERVICE_LABEL: Record<(typeof SERVICE_TYPES)[number], string> = {
    WRAP: 'Vinyl wrap',
    PPF: 'Paint protection film',
    TINT: 'Window tint',
    CERAMIC: 'Ceramic coating',
    PARTS: 'Parts / install',
    OTHER: 'Something else',
};
