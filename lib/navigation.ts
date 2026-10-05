import {
  LayoutDashboard,
  BedDouble,
  Users,
  UserPlus,
  Receipt,
  Banknote,
  Coins,
  BarChart3,
  Settings,
  Home,
  User,
  type LucideIcon,
  Wrench,
} from "lucide-react";

// Single source of truth for the app's navigation — consumed by the
// desktop sidebar, the mobile bottom nav, and the mobile "More" sheet,
// so a route only ever gets added/renamed/reordered in one place.
//
// Every href here corresponds to a real page in app/ (checked against
// the actual route tree, not the aspirational list in whatever design
// brief prompted this file) — there is no "Accounting", "Reports", or
// "Users" route in this app, so those labels don't appear. The closest
// real equivalents (Expenses, Monitoring) keep their real names rather
// than being relabeled to sound like something they aren't.
export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "pendingRequests" | "pendingMaintenance" | "myPendingMaintenance";
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export type NavConfig = {
  // Mobile bottom nav — capped at 4 by design (see components/bottom-nav.tsx).
  primary: NavItem[];
  // Mobile "More" sheet, grouped for scanability.
  secondaryGroups: NavGroup[];
  // Desktop sidebar — shows everything, grouped.
  desktopGroups: NavGroup[];
};

const dashboard: NavItem = {
  key: "dashboard",
  label: "Dashboard",
  href: "/admin",
  icon: LayoutDashboard,
};

const maintenance: NavItem = {
  key: "maintenance",
  label: "Maintenance",
  href: "/admin/maintenance",
  icon: Wrench,
  badge: "pendingMaintenance",
};

const rooms: NavItem = {
  key: "rooms",
  label: "Rooms",
  href: "/admin/rooms",
  icon: BedDouble,
};
const tenants: NavItem = {
  key: "tenants",
  label: "Tenants",
  href: "/admin/tenants",
  icon: Users,
};
const tenantRequests: NavItem = {
  key: "tenant-requests",
  label: "Tenant Requests",
  href: "/admin/tenant-requests",
  icon: UserPlus,
  badge: "pendingRequests",
};

const tenantMaintenance: NavItem = {
  key: "maintenance",
  label: "Maintenance",
  href: "/tenant/maintenance",
  icon: Wrench,
  badge: "myPendingMaintenance",
};

const billing: NavItem = {
  key: "billing",
  label: "Billing",
  href: "/admin/billing",
  icon: Receipt,
};
const payments: NavItem = {
  key: "payments",
  label: "Payments",
  href: "/admin/payments",
  icon: Banknote,
};
const expenses: NavItem = {
  key: "expenses",
  label: "Expenses",
  href: "/admin/expenses",
  icon: Coins,
};
const monitoring: NavItem = {
  key: "monitoring",
  label: "Monitoring",
  href: "/admin/monitoring",
  icon: BarChart3,
};
const adminSettings: NavItem = {
  key: "settings",
  label: "Settings",
  href: "/admin/settings",
  icon: Settings,
};

export const adminNavigation: NavConfig = {
  primary: [dashboard, rooms, tenants, billing],
  secondaryGroups: [
    {
      label: "Management",
      items: [tenantRequests, payments, expenses, monitoring],
    },
    { label: "System", items: [adminSettings] },
  ],
  desktopGroups: [
    {
      label: "Main",
      items: [
        dashboard,
        rooms,
        tenants,
        tenantRequests,
        billing,
        payments,
        expenses,
        monitoring,
      ],
    },
    { label: "System", items: [adminSettings] },
  ],
};

// Real tenant-facing routes: just /tenant (room + billing, all on one
// page) and the shared /profile page. There is no separate "My Room",
// "Payments", "Requests", or "Notifications" route to link to, so the
// tenant nav stays honestly small rather than padded out with items
// that go nowhere new.
const tenantHome: NavItem = {
  key: "home",
  label: "Home",
  href: "/tenant",
  icon: Home,
};
const tenantProfile: NavItem = {
  key: "profile",
  label: "Profile",
  href: "/profile",
  icon: User,
};

export const tenantNavigation: NavConfig = {
  primary: [tenantHome, tenantProfile],
  secondaryGroups: [],
  desktopGroups: [{ items: [tenantHome, tenantProfile] }],
};

export function allSecondaryItems(config: NavConfig): NavItem[] {
  return config.secondaryGroups.flatMap((g) => g.items);
}
