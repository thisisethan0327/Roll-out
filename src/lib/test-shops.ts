/**
 * QA / E2E shops that live in the production registry.
 *
 * The E2E harness creates real shops ("M15 Harness Shop h2", slug
 * m15-h2-shop) and a platform admin verifies them as part of the run, so
 * `status = 'verified'` alone does not keep them out of search: the SEO audit
 * of 2026-10-01 found /u/m15h2shop in the sitemap and indexable. There is no
 * test flag on rollout.shops, so they are recognised by the names the harness
 * and the KYC test gave them, plus the two markers the console already skips
 * (jump-search, attention-sweep): 'seed-' slugs and the KYC test shop, id 15.
 * A real shop that happens to carry one of these words as a whole word would
 * be left out of the sitemap and noindexed — the fix for that is a real
 * column, not a longer pattern here.
 */
const TEST_SHOP_RE = /\b(test|harness|e2e)\b/i;
const SEED_SLUG_PREFIX = 'seed-';
const KYC_TEST_SHOP_ID = 15;

export function isTestShop(
    shop: { id?: string | number | null; shopId?: number | null; slug?: string | null; name?: string | null } | null | undefined,
): boolean {
    if (!shop) return false;
    if (Number(shop.id ?? shop.shopId) === KYC_TEST_SHOP_ID) return true;
    if ((shop.slug ?? '').startsWith(SEED_SLUG_PREFIX)) return true;
    return TEST_SHOP_RE.test(shop.slug ?? '') || TEST_SHOP_RE.test(shop.name ?? '');
}
