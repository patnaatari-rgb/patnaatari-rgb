import { FORM_MANAGEMENT, ALL_MASTERS, type NavItem, type NavLeaf } from "@/lib/navigation";

export type LeafEntry = { path: string; leaf: NavLeaf };

export function collectLeaves(items: NavItem[], trail: string[] = [], out: LeafEntry[] = []): LeafEntry[] {
  for (const item of items) {
    if (item.type === "leaf") out.push({ path: [...trail, item.slug].join("/"), leaf: item });
    else collectLeaves(item.children, [...trail, item.slug], out);
  }
  return out;
}

export const formLeaves = collectLeaves(FORM_MANAGEMENT);
export const masterLeaves = collectLeaves(ALL_MASTERS);
