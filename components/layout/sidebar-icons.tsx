import {
  LayoutDashboard,
  ListChecks,
  Database,
  Settings,
  Users,
  FileText,
  Image,
  Target,
  History,
  Bell,
  FileBarChart,
  type LucideIcon,
} from "lucide-react";
import type { SidebarIconName } from "@/lib/navigation";

/**
 * Mapped by zooming into the real reference sidebar the reference icon-by-icon
 * (not guessed) - Role Management is a gear (not a shield), Module Images is
 * a single photo frame.
 */
export const SIDEBAR_ICONS: Record<SidebarIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  "form-summary": ListChecks,
  masters: Database,
  "role-management": Settings,
  "user-management": Users,
  "form-management": FileText,
  "module-images": Image,
  targets: Target,
  "log-history": History,
  notifications: Bell,
  reports: FileBarChart,
};
