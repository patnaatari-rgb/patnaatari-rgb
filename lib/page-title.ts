import { ALL_MASTERS, FORM_MANAGEMENT, resolveNavPath, type NavItem } from "@/lib/navigation";

export const APP_TITLE = "AMS - ATARI";

/** Top-level dashboard sections, keyed by the first URL segment. */
const SECTION_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  "form-summary": "Form Summary",
  forms: "Form Management",
  masters: "All Masters",
  "module-images": "Module Images",
  targets: "Targets",
  "log-history": "Log History",
  notifications: "Notifications",
  reports: "Reports",
  "role-management": "Role Management",
  "user-management": "User Management",
};

const NAV_ROOTS: Record<string, NavItem[]> = { forms: FORM_MANAGEMENT, masters: ALL_MASTERS };

/**
 * The browser-tab / screen-reader title for a dashboard URL, so every page is
 * distinguishable in the tab strip and in history (WCAG 2.4.2 Page Titled).
 * Form Management and Masters pages take the name of the form they show, e.g.
 * "Basic Information | Form Management | AMS - ATARI"; an Add or Edit screen
 * says so. Anything unrecognised falls back to the app name.
 */
export function pageTitleFor(pathname: string): string {
  const [top, ...rest] = pathname.split("/").filter(Boolean);
  const section = top ? SECTION_TITLES[top] : undefined;
  if (!section) return APP_TITLE;

  const root = NAV_ROOTS[top];
  if (!root) return rest.length === 0 ? `${section} | ${APP_TITLE}` : `${humanize(rest[rest.length - 1])} | ${section} | ${APP_TITLE}`;

  // The path may carry a trailing "add" or "edit/<id>" after the form's own slugs.
  let mode = "";
  let slugs = rest;
  if (slugs[slugs.length - 1] === "add") {
    mode = "Add ";
    slugs = slugs.slice(0, -1);
  } else if (slugs[slugs.length - 2] === "edit") {
    mode = "Edit ";
    slugs = slugs.slice(0, -2);
  }
  const resolved = slugs.length > 0 ? resolveNavPath(root, slugs) : null;
  return resolved ? `${mode}${resolved.node.label} | ${section} | ${APP_TITLE}` : `${section} | ${APP_TITLE}`;
}

function humanize(slug: string) {
  const text = slug.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
