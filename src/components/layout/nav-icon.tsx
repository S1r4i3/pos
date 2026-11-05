import {
  BarChart3,
  ChefHat,
  LayoutDashboard,
  LayoutGrid,
  Package,
  ReceiptIndianRupee,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/auth/roles";

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  pos: ReceiptIndianRupee,
  tables: LayoutGrid,
  kitchen: ChefHat,
  menu: UtensilsCrossed,
  inventory: Package,
  customers: Users,
  reports: BarChart3,
  staff: UserCog,
  settings: Settings,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
