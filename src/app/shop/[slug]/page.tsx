import { redirect } from 'next/navigation';

export default async function ShopSlugRoot({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    redirect(`/shop/${slug}/overview`);
}
