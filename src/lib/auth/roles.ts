// Who can do what. This file is safe to import anywhere (server or browser).
// The database enforces the same rules with Row Level Security — this file
// decides what to SHOW; the database decides what is ALLOWED.

export const ROLES = ["owner", "manager", "cashier", "waiter", "kitchen"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  waiter: "Waiter / Captain",
  kitchen: "Kitchen",
};

const ALL: readonly Role[] = ROLES;

export const PERMISSIONS = {
  viewDashboard: ALL,
  viewSales: ["owner", "manager", "cashier"],
  useBilling: ["owner", "manager", "cashier", "waiter"],
  viewTables: ["owner", "manager", "cashier", "waiter"],
  viewKitchen: ["owner", "manager", "kitchen"],
  manageMenu: ["owner", "manager"],
  toggleStock: ["owner", "manager", "cashier", "kitchen"],
  manageInventory: ["owner", "manager"],
  manageCustomers: ["owner", "manager", "cashier"],
  viewReports: ["owner", "manager"],
  manageStaff: ["owner", "manager"],
  manageOutlet: ["owner", "manager"],
  manageTaxes: ["owner"],
  manageOutlets: ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Icon names are mapped to real icons in components/layout/nav-icon.tsx */
export type NavIcon =
  | "dashboard"
  | "pos"
  | "tables"
  | "kitchen"
  | "menu"
  | "inventory"
  | "customers"
  | "reports"
  | "staff"
  | "settings";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  permission: Permission;
  /** Build phase that delivers this screen. Items from later phases show as "Soon". */
  phase: number;
};

/** The phase we have finished building. Bump this as each phase ships. */
export const CURRENT_PHASE = 1;

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "viewDashboard", phase: 1 },
  { href: "/pos", label: "Billing", icon: "pos", permission: "useBilling", phase: 3 },
  { href: "/tables", label: "Tables", icon: "tables", permission: "viewTables", phase: 3 },
  { href: "/kds", label: "Kitchen", icon: "kitchen", permission: "viewKitchen", phase: 4 },
  { href: "/menu", label: "Menu", icon: "menu", permission: "manageMenu", phase: 2 },
  { href: "/inventory", label: "Inventory", icon: "inventory", permission: "manageInventory", phase: 5 },
  { href: "/reports", label: "Reports", icon: "reports", permission: "viewReports", phase: 6 },
  { href: "/customers", label: "Customers", icon: "customers", permission: "manageCustomers", phase: 7 },
  { href: "/staff", label: "Staff", icon: "staff", permission: "manageStaff", phase: 7 },
  { href: "/settings", label: "Settings", icon: "settings", permission: "manageOutlet", phase: 1 },
];

export function navFor(role: Role): (NavItem & { ready: boolean })[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission)).map((item) => ({
    ...item,
    ready: item.phase <= CURRENT_PHASE,
  }));
}
