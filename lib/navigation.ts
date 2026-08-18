import type { LucideIcon } from "lucide-react";
import {
  Home,
  DoorOpen,
  Users,
  UserPlus,
  Receipt,
  Banknote,
  Wallet,
  LineChart,
  Settings,
  User,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Numeric badge, e.g. pending tenant requests. */
  badgeKey?: "pendingRequests";
  /** Shown as a "Soon" pill instead of being a real link. */
  comingSoon?: boolean;
};

export type NavGroup = {
  /** Optional small caps heading shown above the group on desktop. */
  label?: string;
  items: NavItem[];
};

export type NavConfig = {
  /** Desktop sidebar — every real route, grouped. Nothing is hidden here. */
  sidebar: NavGroup[];
  /** Mobile bottom nav — max 4 destinations. Everything else goes in `more`. */
  primary: NavItem[];
  /** Mobile "More" sheet — grouped secondary destinations. */
  more: NavGroup[];
};

// ---------------------------------------------------------------------------
// Admin / Owner
//
// Only routes that actually exist under app/admin/** (plus /profile) are
// listed here. Desktop shows all of them directly in the sidebar. Mobile
// keeps the 4 most-used destinations on the bottom bar and tucks the rest
// (Payments, Expenses, Monitoring, Tenant Requests, Settings) into "More".
// ---------------------------------------------------------------------------

const adminOverview: NavItem = { label: "Overview", href: "/admin", icon: Home };
const adminRooms: NavItem = { label: "Rooms", href: "/admin/rooms", icon: DoorOpen };
const adminTenants: NavItem = { label: "Tenants", href: "/admin/tenants", icon: Users };
const adminTenantRequests: NavItem = {
  label: "Tenant Requests",
  href: "/admin/tenant-requests",
  icon: UserPlus,
  badgeKey: "pendingRequests",
};
const adminBilling: NavItem = { label: "Billing", href: "/admin/billing", icon: Receipt };
const adminPayments: NavItem = { label: "Payments", href: "/admin/payments", icon: Banknote };
const adminExpenses: NavItem = { label: "Expenses", href: "/admin/expenses", icon: Wallet };
const adminMonitoring: NavItem = { label: "Monitoring", href: "/admin/monitoring", icon: LineChart };
const adminSettings: NavItem = { label: "Settings", href: "/admin/settings", icon: Settings };

export const adminNavigation: NavConfig = {
  sidebar: [
    {
      label: "Main",
      items: [
        adminOverview,
        adminRooms,
        adminTenants,
        adminTenantRequests,
        adminBilling,
        adminPayments,
        adminExpenses,
        adminMonitoring,
      ],
    },
    {
      label: "System",
      items: [adminSettings],
    },
  ],
  primary: [adminOverview, adminRooms, adminTenants, adminBilling],
  more: [
    {
      label: "Management",
      items: [adminPayments, adminExpenses, adminMonitoring, adminTenantRequests],
    },
    {
      label: "System",
      items: [adminSettings],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tenant
//
// Only /tenant (the tenant dashboard) and /profile currently exist for
// tenants — there's no separate My Room / Payments / Requests page yet, so
// none are invented here. The config is intentionally small; add items as
// those routes are built and they'll automatically show up everywhere.
// ---------------------------------------------------------------------------

const tenantHome: NavItem = { label: "Home", href: "/tenant", icon: Home };
const tenantProfile: NavItem = { label: "Profile", href: "/profile", icon: User };

export const tenantNavigation: NavConfig = {
  sidebar: [{ items: [tenantHome, tenantProfile] }],
  primary: [tenantHome],
  more: [{ items: [tenantProfile] }],
};

export function isItemActive(pathname: string, item: NavItem) {
  return item.href === "/admin" || item.href === "/tenant"
    ? pathname === item.href
    : pathname.startsWith(item.href);
}

export function isGroupActive(pathname: string, groups: NavGroup[]) {
  return groups.some((group) =>
    group.items.some((item) => isItemActive(pathname, item))
  );
}
