/**
 * Shop-console navigation, shared by the shop sidebar (client) and the admin
 * event page's "act as shop" panel (server). Pure + isomorphic: no DB, no
 * `server-only`. Visibility is NAV only — each section's route guard enforces
 * the same module gate server-side (see shop-modules.ts).
 */
import { ModuleKey } from '@/lib/shop-modules';

export type ShopNavSection = 'TODAY' | 'CUSTOMERS' | 'PUBLIC' | 'SETTINGS';

export type ShopNavItem = {
    href: string;
    label: string;
    section: ShopNavSection;
    /** Tier module this link belongs to. The layout resolves the enabled set
     *  (tier ± overrides ± data-preconditions) and passes it in; links whose
     *  module isn't enabled are hidden. Section routes enforce the same gate. */
    module: ModuleKey;
    /** Min role required to see this link in the sidebar. Routes themselves
     *  enforce server-side; this just hides links the user can't use. */
    minRole?: 'owner' | 'manager' | 'installer';
};

export const SHOP_NAV_SECTIONS: ShopNavSection[] = ['TODAY', 'CUSTOMERS', 'PUBLIC', 'SETTINGS'];

export const SHOP_ROLE_RANK: Record<string, number> = {
    owner: 5,
    admin: 4,
    manager: 3,
    installer: 2,
    staff: 1,
};

export const SHOP_NAV: ShopNavItem[] = [
    { href: 'overview',  label: 'OVERVIEW',  section: 'TODAY',    module: ModuleKey.Overview,  minRole: 'installer' },
    { href: 'inbox',     label: 'INBOX',     section: 'TODAY',    module: ModuleKey.Inbox,     minRole: 'installer' },
    { href: 'messages',  label: 'MESSAGES',  section: 'TODAY',    module: ModuleKey.Messages,  minRole: 'installer' },
    { href: 'calendar',  label: 'CALENDAR',  section: 'TODAY',    module: ModuleKey.Calendar,  minRole: 'installer' },
    { href: 'tickets',   label: 'TICKETS',   section: 'TODAY',    module: ModuleKey.Tickets,   minRole: 'installer' },
    { href: 'customers', label: 'CUSTOMERS', section: 'CUSTOMERS', module: ModuleKey.Customers, minRole: 'installer' },
    { href: 'products',  label: 'PRODUCTS',  section: 'CUSTOMERS', module: ModuleKey.Products,  minRole: 'installer' },
    { href: 'orders',    label: 'ORDERS',    section: 'CUSTOMERS', module: ModuleKey.Orders,    minRole: 'installer' },
    { href: 'posts',     label: 'POSTS',     section: 'PUBLIC',   module: ModuleKey.Posts,     minRole: 'manager' },
    { href: 'events',    label: 'EVENTS',    section: 'PUBLIC',   module: ModuleKey.Events,    minRole: 'manager' },
    { href: 'kiosk-events', label: 'KIOSK EVENTS', section: 'PUBLIC', module: ModuleKey.KioskEvents, minRole: 'manager' },
    { href: 'reviews',   label: 'REVIEWS',   section: 'PUBLIC',   module: ModuleKey.Reviews,   minRole: 'manager' },
    { href: 'page',      label: 'SHOP PAGE', section: 'PUBLIC',   module: ModuleKey.Page,      minRole: 'owner' },
    { href: 'account',   label: 'MY ACCOUNT', section: 'SETTINGS', module: ModuleKey.Account },
    { href: 'staff',     label: 'STAFF',     section: 'SETTINGS', module: ModuleKey.Staff,    minRole: 'owner' },
    { href: 'services',  label: 'SERVICES',  section: 'SETTINGS', module: ModuleKey.Services, minRole: 'manager' },
    { href: 'settings/general', label: 'GENERAL',  section: 'SETTINGS', module: ModuleKey.Settings, minRole: 'owner' },
    { href: 'settings/email',   label: 'EMAIL',    section: 'SETTINGS', module: ModuleKey.Settings, minRole: 'owner' },
    { href: 'settings/billing', label: 'BILLING',  section: 'SETTINGS', module: ModuleKey.Settings, minRole: 'owner' },
];
