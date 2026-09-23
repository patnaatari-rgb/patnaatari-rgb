import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import {
  FORM_MANAGEMENT,
  resolveNavPath,
  landingCards,
  type NavGroup,
  type MasterColumn,
} from "@/lib/navigation";
import { REPORT_FORM_LEAVES } from "@/lib/reports";
import { PageHeader, type Crumb } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { SectionedMasterGrid } from "@/components/layout/sectioned-master-grid";
import {
  EmptyDataTable,
  type MasterTab,
} from "@/components/data-table/empty-data-table";
import { AddLeafPage } from "@/components/data-table/add-leaf-page";
import { EditLeafPage } from "@/components/data-table/edit-leaf-page";
import { KvkMasterAddForm } from "@/components/data-table/kvk-master-add-form";
import { KvkMasterEditForm } from "@/components/data-table/kvk-master-edit-form";
import { LandDetailsAddForm } from "@/components/data-table/land-details-add-form";
import { StaffQuartersForm } from "@/components/data-table/staff-quarters-form";
import { EmployeeDetailsAddForm } from "@/components/data-table/employee-details-add-form";
import { OftForm } from "@/components/data-table/oft-form";
import { FldForm } from "@/components/data-table/fld-form";
import { CfldTechnicalParameterPage } from "@/components/data-table/cfld-technical-parameter-page";
import { cfldTabFromQuery } from "@/lib/cfld-technical-parameter-tabs";
import { TechnicalAchievementSummaryPanel } from "@/components/data-table/technical-achievement-summary-panel";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/** Technology Week Celebration and World Soil Day moved off the popup EventDemographicDialog onto the generic full-page Add/Edit flow (client direction, 2026-09-02 - see the matching leaf-record-registry.ts comment). Kept as an empty set (rather than deleted outright) since `customForm="event-demographic"` below still exists as a real EmptyDataTable prop, just never triggered now. */
const EVENT_DEMOGRAPHIC_SLUGS = new Set<string>([]);

/** Every Form Management leaf Reports files a Module Images category for - the same list Reports and the standalone Module Images page draw from. */
const REPORT_LEAF_PATHS = new Set(REPORT_FORM_LEAVES.map((leaf) => leaf.path));

/** Every Project section's "Team" leaf (slug) and the Prisma model behind it. Other Programmes (the last section) has no Team; NICRA's own equivalent is "Project Team Detail" (pi-co-pi-list). */
const PROJECT_TEAM_MODEL_BY_SLUG = {
  "cfld-team": "cfldProjectTeam",
  "arya-team": "aryaProjectTeam",
  "nf-team": "nfProjectTeam",
  "tsp-scsp-team": "tspScspProjectTeam",
  "nari-team": "nariProjectTeam",
  "seed-hub-team": "seedHubProjectTeam",
  "agri-drone-team": "agriDroneProjectTeam",
  "fpo-team": "fpoProjectTeam",
  "drmr-team": "drmrProjectTeam",
  "cra-team": "craProjectTeam",
  "csisa-team": "csisaProjectTeam",
} as const;
type ProjectTeamSlug = keyof typeof PROJECT_TEAM_MODEL_BY_SLUG;

function isProjectTeamSlug(slug: string): slug is ProjectTeamSlug {
  return Object.hasOwn(PROJECT_TEAM_MODEL_BY_SLUG, slug);
}

type ProjectTeamRecord = { id: string; startDate: Date; endDate: Date; projectTeam: string; name: string; kvk: { name: string } };

/** The ten Project Team models are column-for-column identical, so this one narrow structural type stands in for their ten separate Prisma delegates. */
function findProjectTeamRows(
  slug: ProjectTeamSlug,
  where: { kvkId?: string | { in: string[] }; zoneId?: string },
): Promise<ProjectTeamRecord[]> {
  const delegate = prisma[PROJECT_TEAM_MODEL_BY_SLUG[slug]] as unknown as {
    findMany(args: { where: typeof where; include: { kvk: true }; orderBy: { createdAt: "desc" } }): Promise<ProjectTeamRecord[]>;
  };
  return delegate.findMany({ where, include: { kvk: true }, orderBy: { createdAt: "desc" } });
}

/** The end-of-form "Photographs (with caption)" section every generic leaf's Add/Edit form now carries - on save it flows straight into Module Images -> Reports (see lib/leaf-record-registry.ts syncLeafModuleImages). */
const MODULE_IMAGES_COLUMN: MasterColumn = {
  key: "moduleImages",
  label: "Photographs",
  fieldKind: "photos",
  formOnly: true,
};

/** Appends the shared Photographs section to a leaf's generic Add/Edit form unless it already declares one (OFT/FLD carry their own) or Reports has no category for it. */
function withModuleImages(columns: MasterColumn[], path: string): MasterColumn[] {
  if (!REPORT_LEAF_PATHS.has(path)) return columns;
  // About KVK captures KVK profile data (land, vehicles, equipment, bank
  // accounts, staff...) - none of its forms carry a photo upload on the
  // live reference, so the shared Photographs section does not belong here.
  if (path.startsWith("about-kvk/")) return columns;
  if (columns.some((column) => column.fieldKind === "photos")) return columns;
  return [...columns, MODULE_IMAGES_COLUMN];
}
/** View OFT / View FLD only - see EmptyDataTable's `oftFldStatus` prop for the full spec (client pointer, 2026-08-24). */
const OFT_FLD_STATUS_SLUGS = new Set(["oft", "view-fld"]);
/** Leaves whose real Add/Edit shape isn't a flat field list - these keep opening their existing bespoke dialog instead of the new full-page Add flow. CFLD Technical Parameter used to be one of these too, but its own 4-tab shape moved to a dedicated page (CfldTechnicalParameterPage) same as every other leaf, 2026-09-01 - it's handled by its own `node.slug === "technical-parameter"` branches below instead. */
const CUSTOM_FORM_SLUGS = new Set([...EVENT_DEMOGRAPHIC_SLUGS]);

/**
 * About KVK's 5 sub-groups (Basic Information, Employee Information, Land &
 * Infrastructure Information, Vehicles Information, Equipments Information)
 * exist only to group their leaves into landing-page cards - the real
 * reference's own breadcrumb for every leaf underneath them skips straight
 * from "About KVK" to the leaf name (confirmed directly against every one of
 * the 5: /forms/about-kvk/view-kvks, bank-account, employee-details,
 * infrastructure, vehicles, equipments all render "Form Management > About
 * KVK > {leaf}" with no group crumb in between). Achievements/Projects/CFLD
 * and the rest of Form Management do NOT share this - their own group crumbs
 * (Projects, CFLD, Front Line Demonstrations (FLD), ...) are confirmed to
 * appear in the real breadcrumb, so this suppression is scoped to these 5
 * slugs only, not a general rule. Applied to both the list page's breadcrumb
 * and the Add page's breadcrumb, so the two stay consistent.
 */
const ABOUT_KVK_CARD_ONLY_GROUP_SLUGS = new Set([
  "basic",
  "employee",
  "land-infrastructure",
  "vehicles",
  "equipments",
]);

type FormsPageProps = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** One batched query instead of N+1 - groups a pilot leaf's own ModuleImage rows (client PDF, "Module Image workflow", 2026-09-02) by their owning formRecordId so each list row's own Edit page can preload its Photographs section via FormPhotosField's own {url, caption}[] shape. */
async function moduleImagesByRecord(recordIds: string[]): Promise<Map<string, { url: string; caption: string }[]>> {
  if (recordIds.length === 0) return new Map();
  const images = await prisma.moduleImage.findMany({
    where: { formRecordId: { in: recordIds } },
    orderBy: { createdAt: "asc" },
  });
  const byRecord = new Map<string, { url: string; caption: string }[]>();
  for (const image of images) {
    if (!image.formRecordId) continue;
    const list = byRecord.get(image.formRecordId) ?? [];
    list.push({ url: image.imageUrl, caption: image.caption });
    byRecord.set(image.formRecordId, list);
  }
  return byRecord;
}

export default async function FormsPage({ params, searchParams }: FormsPageProps) {
  const { slug: rawSlug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = typeof rawTab === "string" ? rawTab : undefined;

  /**
   * "Add New" for Form Management opens a dedicated page instead of the
   * popup Masters/Targets/Notifications keep (client direction). Rather
   * than a sibling route file (which Next.js can't nest under a catch-all
   * segment folder), a trailing "add" slug segment is handled right here.
   */
  const isAddPage = rawSlug[rawSlug.length - 1] === "add";
  /**
   * "Edit" opens this same kind of dedicated page instead of the popup
   * EmptyDataTable's dialog otherwise uses (client direction, 2026-09-01 -
   * same reasoning and same trailing-segment technique as "Add New" above).
   * The record id is the final segment, "edit" the one before it.
   */
  const isEditPage = rawSlug[rawSlug.length - 2] === "edit";
  const editId = isEditPage ? rawSlug[rawSlug.length - 1] : undefined;
  const slug = isAddPage ? rawSlug.slice(0, -1) : isEditPage ? rawSlug.slice(0, -2) : rawSlug;

  const resolved = resolveNavPath(FORM_MANAGEMENT, slug);
  if (!resolved) notFound();

  const { node, trail } = resolved;

  // staff-transferred gives no per-row Add/Edit page in the live reference -
  // it's a read-only table (records come from the Transfer action on
  // Employee Details, atariams.org /transfer-staff). Send that URL back to
  // the list instead of 404ing. Land Details used to be special-cased here
  // too (one repeatable "Total Land with KVK" panel, no list/Add New at
  // all), but the client asked for it to match every sibling leaf instead -
  // a real list with its own Add New/Edit pages (client direction,
  // 2026-09-13).
  if ((isAddPage || isEditPage) && node.type === "leaf" && (node.slug === "staff-transferred" || node.slug === "staff-retired")) {
    redirect(`/forms/${slug.join("/")}`);
  }

  if (isEditPage) {
    if (node.type !== "leaf" || CUSTOM_FORM_SLUGS.has(node.slug) || !editId) notFound();
    const editTrail: Crumb[] = [{ label: "Form Management", href: "/forms" }];
    trail.forEach((item, index) => {
      if (
        trail[0]?.slug === "about-kvk" &&
        item.type === "group" &&
        ABOUT_KVK_CARD_ONLY_GROUP_SLUGS.has(item.slug)
      ) {
        return;
      }
      editTrail.push({
        label: item.type === "leaf" ? (item.pageTitle ?? item.label) : item.label,
        href: `/forms/${trail
          .slice(0, index + 1)
          .map((t) => t.slug)
          .join("/")}`,
      });
    });
    const editBackHref = `/forms/${slug.join("/")}`;
    if (node.slug === "view-kvks") {
      return (
        <KvkMasterEditForm
          trail={editTrail}
          backHref={editBackHref}
          id={editId}
          title="Edit KVKs"
        />
      );
    }
    if (node.slug === "staff-quarters") {
      return (
        <StaffQuartersForm
          trail={editTrail}
          backHref={editBackHref}
          id={editId}
          title="Edit Staff Quarters"
        />
      );
    }
    if (node.slug === "employee-details") {
      return <EmployeeDetailsAddForm trail={editTrail} backHref={editBackHref} id={editId} />;
    }
    if (node.slug === "technical-parameter") {
      return (
        <CfldTechnicalParameterPage
          trail={editTrail}
          backHref={editBackHref}
          id={editId}
          initialTab={cfldTabFromQuery(tab)}
        />
      );
    }
    if (node.slug === "oft") {
      return (
        <OftForm
          trail={editTrail}
          backHref={editBackHref}
          id={editId}
          initialView={tab === "result" ? "result" : "oft"}
        />
      );
    }
    if (node.slug === "view-fld") {
      return (
        <FldForm
          trail={editTrail}
          backHref={editBackHref}
          id={editId}
          initialView={tab === "result" ? "result" : "fld"}
        />
      );
    }
    return (
      <EditLeafPage
        title={node.pageTitle ?? node.label}
        trail={editTrail}
        backHref={editBackHref}
        columns={withModuleImages(node.columns, slug.join("/"))}
        // Same compact auto-fit field layout as every All Masters leaf
        // (app/(dashboard)/masters/[...slug]/page.tsx) - this route never
        // set it before, so every generic Form Management leaf was still on
        // the old one-field-per-row layout (client report, 2026-09-03).
        compactFields={node.compactFields ?? true}
        recordPath={slug.join("/")}
        id={editId}
      />
    );
  }

  if (isAddPage) {
    if (node.type !== "leaf" || CUSTOM_FORM_SLUGS.has(node.slug)) notFound();
    // These leaves add a record to one specific KVK, and only the KVK's own
    // login carries that KVK. A Super Admin has no KVK, so /api/leaf-record
    // rejects the add anyway (and the real reference shows no "Add" to a
    // Super Admin here either) - don't route them to a form that can't
    // submit. "view-kvks" is the exception: its own /api/kvks route is a
    // real Super Admin create flow.
    if (node.slug !== "view-kvks") {
      const addUser = await getCurrentUser();
      if (!addUser?.kvkId) notFound();
    }
    const addTrail: Crumb[] = [{ label: "Form Management", href: "/forms" }];
    trail.forEach((item, index) => {
      if (
        trail[0]?.slug === "about-kvk" &&
        item.type === "group" &&
        ABOUT_KVK_CARD_ONLY_GROUP_SLUGS.has(item.slug)
      ) {
        return;
      }
      addTrail.push({
        label: item.type === "leaf" ? (item.pageTitle ?? item.label) : item.label,
        href: `/forms/${trail
          .slice(0, index + 1)
          .map((t) => t.slug)
          .join("/")}`,
      });
    });
    const backHref = `/forms/${slug.join("/")}`;
    if (node.slug === "view-kvks") {
      return <KvkMasterAddForm trail={addTrail} backHref={backHref} title="Create KVKs" />;
    }
    if (node.slug === "staff-quarters") {
      return <StaffQuartersForm trail={addTrail} backHref={backHref} title="Add Staff Quarters" />;
    }
    if (node.slug === "land-details") {
      return <LandDetailsAddForm trail={addTrail} backHref={backHref} />;
    }
    if (node.slug === "employee-details") {
      return <EmployeeDetailsAddForm trail={addTrail} backHref={backHref} />;
    }
    if (node.slug === "oft") {
      return <OftForm trail={addTrail} backHref={backHref} />;
    }
    if (node.slug === "view-fld") {
      return <FldForm trail={addTrail} backHref={backHref} />;
    }
    if (node.slug === "technical-parameter") {
      return <CfldTechnicalParameterPage trail={addTrail} backHref={backHref} />;
    }
    return (
      <AddLeafPage
        title={node.pageTitle ?? node.label}
        trail={addTrail}
        backHref={backHref}
        columns={withModuleImages(node.columns, slug.join("/"))}
        // Same compact auto-fit field layout as every All Masters leaf
        // (app/(dashboard)/masters/[...slug]/page.tsx) - this route never
        // set it before, so every generic Form Management leaf was still on
        // the old one-field-per-row layout (client report, 2026-09-03).
        compactFields={node.compactFields ?? true}
        recordPath={slug.join("/")}
      />
    );
  }

  const trailCrumbs: Crumb[] = [{ label: "Form Management", href: "/forms" }];
  trail.slice(0, -1).forEach((item, index) => {
    if (
      trail[0]?.slug === "about-kvk" &&
      item.type === "group" &&
      ABOUT_KVK_CARD_ONLY_GROUP_SLUGS.has(item.slug)
    ) {
      return;
    }
    trailCrumbs.push({
      label: item.label,
      href: `/forms/${trail
        .slice(0, index + 1)
        .map((t) => t.slug)
        .join("/")}`,
    });
  });
  trailCrumbs.push({
    label: node.type === "leaf" ? (node.pageTitle ?? node.label) : node.label,
  });

  /**
   * Back must return to the immediate parent page - the crumb directly to
   * the current one's left - not jump straight to the Form Management root.
   * Client pointer (2026-08-24): "Back navigation should follow the user's
   * actual previous page/section", e.g. Achievement -> Extension Activities
   * -> Back should land on Extension's own group page, not the Achievement
   * Dashboard. Reusing `trailCrumbs` (rather than re-deriving from `slug`)
   * means this automatically respects About KVK's card-only sub-group
   * suppression too - its leaves' real previous page is About KVK itself,
   * not the invisible "Basic Information" stop the URL nests them under.
   */
  const listBackHref =
    trailCrumbs[trailCrumbs.length - 2]?.href ?? "/forms";

  /**
   * Sibling-leaf tabs above the table, same pattern All Masters uses -
   * every leaf under the immediate parent group becomes a pill, so clicking
   * across siblings (e.g. DRMR Details <-> DRMR Activity, or View FLD <->
   * Extension & Training <-> Technical Feedback) doesn't require going back
   * to the group's landing page first. Only shown when the parent's
   * children are ALL leaves (a genuine, cohesive sibling set) - client
   * pointer (2026-08-25): a "single" leaf sitting directly under a MIXED
   * parent (Achievements has both real sub-groups like FLD/Extension AND
   * flat standalone leaves like OFT/Trainings/Publications/HRD/Production &
   * Supply/Technical Achievement as direct children) got tabbed together
   * with those unrelated flat leaves purely by accident of the data shape,
   * which read as broken rather than useful - the real atariams.org page
   * for any of these has no such tab strip either. Excluding all of them
   * this way (not just OFT) rather than hardcoding each slug.
   */
  let tabs: MasterTab[] | undefined;
  if (node.type === "leaf" && trail.length >= 2) {
    const parent = trail[trail.length - 2];
    if (
      parent.type === "group" &&
      parent.children.every((item) => item.type === "leaf")
    ) {
      const basePath = `/forms/${slug.slice(0, -1).join("/")}`;
      tabs = parent.children
        .filter((item): item is Extract<typeof item, { type: "leaf" }> =>
          item.type === "leaf",
        )
        .map((item) => ({
          label: item.tabLabel ?? item.label,
          href: `${basePath}/${item.slug}`,
          active: item.slug === node.slug,
        }));
    }
  }

  /**
   * About KVK's leaves are backed by the real database - KVK Admins see
   * only their own KVK's records, Super Admin sees the whole zone. First
   * Form Management module wired end-to-end; every other module still
   * renders the placeholder table until its own turn.
   */
  let formData: { rows: Record<string, string>[]; totalCount: number } | undefined;
  const user = node.type === "leaf" ? await getCurrentUser() : null;
  const scopedKvkId = user && user.role !== "SUPER_ADMIN" ? (user.kvkId ?? undefined) : undefined;
  /**
   * A Host Organisation account (ORG_ADMIN, 2026-09-24) has no kvkId of its
   * own - scoped to every KVK mapped to its org instead. `kvkScope.kvkId`
   * widens from "a single KVK id" to "a single id, or {in: [...]} for every
   * KVK under a Host Org" - every one of this file's ~100 leaf queries below
   * either spreads `kvkScope` directly or reads `kvkScope.kvkId` into a
   * (possibly relation-nested) filter, and Prisma accepts that shape
   * identically to a plain string, so a KVK Admin/User/Super Admin's
   * behaviour is unchanged.
   */
  const orgKvkIds =
    user?.role === "ORG_ADMIN" && user.hostOrgId ? await getHostOrgKvkIds(user.hostOrgId) : null;
  const kvkScope: { kvkId?: string | { in: string[] }; zoneId?: string } = orgKvkIds
    ? { kvkId: { in: orgKvkIds } }
    : scopedKvkId
      ? { kvkId: scopedKvkId }
      : { zoneId: user?.zoneId };

  if (user && node.type === "leaf" && node.slug === "view-kvks") {
    const kvks = await prisma.kvk.findMany({
      where: kvkScope.kvkId ? { id: kvkScope.kvkId } : { zoneId: user.zoneId },
      include: { state: true, district: true, hostOrg: true, zone: true, institute: true },
      orderBy: { name: "asc" },
    });
    formData = {
      rows: kvks.map((kvk) => ({
        id: kvk.id,
        zoneName: kvk.zone.name,
        stateName: kvk.state.name,
        hostOrg: kvk.hostOrg.name,
        districtName: kvk.district.name,
        kvk: kvk.name,
        mobile: kvk.officePhone ?? "-",
        landline: kvk.landline ?? "",
        fax: kvk.fax ?? "",
        email: kvk.email ?? "",
        address: kvk.address ?? "",
        sanctionYear: kvk.sanctionYear ? String(kvk.sanctionYear) : "",
        instituteName: kvk.institute?.name ?? "",
      })),
      totalCount: kvks.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "bank-account-details") {
    const rows = await prisma.bankAccount.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        accountType: r.accountType,
        accountName: r.accountName,
        bankName: r.bankName,
        location: r.location ?? "",
        accountNumber: r.accountNumber,
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "employee-details") {
    // A retired staff member (Action -> Retired sets dateOfRetirement) moves
    // out of Employee Details into Staff Retired.
    const rows = await prisma.staff.findMany({
      where: { ...kvkScope, dateOfRetirement: null },
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      // Position is stored as text (schema allows non-numeric legacy values)
      // but entered through a `type="number"` field and means a real rank -
      // sorting it as a string ("10" before "2") would be wrong (client
      // report, 2026-09-11: "position 1 hai to wo top pe rahega"). Sorted
      // here instead of via Prisma `orderBy` so the comparison is numeric;
      // blank/non-numeric position falls to the end, not interleaved.
      rows: rows
        .map((r) => ({
          id: r.id,
          kvk: r.kvk.name,
          photo: r.photoUrl ?? "",
          resume: r.resumeUrl ?? "",
          staffName: r.name,
          position: r.position ?? "",
          email: r.email ?? "",
          sanctionedPost: r.sanctionedPost,
          mobile: r.mobile ?? "",
          payBand: r.payBand ?? "",
          payScale: r.payScale ?? "",
          discipline: r.discipline ?? "",
          dateOfBirth: r.dateOfBirth ? r.dateOfBirth.toISOString().slice(0, 10) : "",
          dateOfJoining: r.dateOfJoining ? r.dateOfJoining.toISOString().slice(0, 10) : "",
          jobType: r.jobType ?? "",
          allowances: r.allowances ?? "",
          category: r.category ?? "",
          transferStatus: r.transferStatus ?? "",
        }))
        .sort((a, b) => {
          // Number("") is 0, not NaN - a blank position would otherwise sort
          // to the very top instead of the bottom. Check for a real value first.
          const pa = a.position.trim() ? Number(a.position) : NaN;
          const pb = b.position.trim() ? Number(b.position) : NaN;
          return (Number.isFinite(pa) ? pa : Infinity) - (Number.isFinite(pb) ? pb : Infinity);
        }),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "staff-transferred") {
    // Scoped by `fromKvkId` - the transfer belongs to the KVK the staff left
    // (it sits beside that KVK's own Employee Details), not the KVK they moved
    // to (client direction, 2026-09-10). Super Admin still sees the whole zone.
    // (A request to also show this to the destination KVK came up
    // 2026-09-12 - held pending client confirmation, not applied.)
    const rows = await prisma.staffTransfer.findMany({
      where: kvkScope.kvkId ? { fromKvkId: kvkScope.kvkId } : { zoneId: kvkScope.zoneId },
      include: { staff: true, fromKvk: true, toKvk: true },
      orderBy: { transferDate: "desc" },
    });
    /**
     * "View Transfer History" (real reference action, 2026-09-01) shows every
     * hop a staff member has ever made, not just the one row's own from/to -
     * a staff member can be transferred more than once (StaffTransfer.staffId
     * is a real one-to-many). Queried once for every distinct staff in this
     * page rather than per-row to avoid an N+1, then attached to each row as
     * a JSON string (EmptyDataTable's `rows` are typed Record<string,
     * ReactNode> - a plain string is the simplest way to carry structured
     * data through that shape without widening the type for one leaf).
     */
    const staffIds = Array.from(new Set(rows.map((r) => r.staffId)));
    const history = await prisma.staffTransfer.findMany({
      where: { staffId: { in: staffIds } },
      include: { fromKvk: true, toKvk: true },
      orderBy: { transferDate: "asc" },
    });
    const historyByStaffId = new Map<
      string,
      { fromKvk: string; toKvk: string; transferredBy: string; date: string }[]
    >();
    for (const h of history) {
      const entry = {
        fromKvk: h.fromKvk.name,
        toKvk: h.toKvk.name,
        // No separate "who performed this transfer" field on StaffTransfer - the real reference's own example
        // shows "Transferred By" always equal to the source KVK (KVK Bhojpur -> KVK Araria, Transferred By: KVK
        // Bhojpur), matching a transfer always being initiated by the KVK the staff member is leaving.
        transferredBy: h.fromKvk.name,
        date: h.transferDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      };
      historyByStaffId.set(h.staffId, [...(historyByStaffId.get(h.staffId) ?? []), entry]);
    }
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        staffName: r.staff.name,
        kvkNameBeforeTransfer: r.fromKvk.name,
        latestKvkName: r.toKvk.name,
        dateOfRelieving: r.transferDate.toISOString().slice(0, 10),
        historyJson: JSON.stringify(historyByStaffId.get(r.staffId) ?? []),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "staff-retired") {
    const rows = await prisma.staff.findMany({
      where: { ...kvkScope, dateOfRetirement: { not: null } },
      include: { kvk: true },
      orderBy: { dateOfRetirement: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        staffName: r.name,
        position: r.position ?? "",
        sanctionedPost: r.sanctionedPost,
        dateOfRetirement: r.dateOfRetirement ? r.dateOfRetirement.toISOString().slice(0, 10) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "infrastructure-details") {
    const rows = await prisma.infrastructure.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    const yn = (v: boolean) => (v ? "Yes" : "No");
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        infraMasterName: r.infrastructureName,
        notYetStarted: yn(r.notYetStarted),
        completedPlinthLevel: yn(r.completedPlinthLevel),
        completedLintelLevel: yn(r.completedLintelLevel),
        completedRoofLevel: yn(r.completedRoofLevel),
        totallyCompleted: yn(r.totallyCompleted),
        plinthAreaSqM: r.plinthAreaSqM ? String(r.plinthAreaSqM) : "",
        underUse: yn(r.underUse),
        sourceOfFunding: r.sourceOfFunding ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "land-details") {
    const rows = await prisma.land.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        item: r.item,
        areaHa: String(r.areaHa),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "staff-quarters") {
    const rows = await prisma.staffQuarters.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        noOfStaffQuarters: String(r.numberOfQuarters),
        dateOfCompletion: r.dateOfCompletion
          ? r.dateOfCompletion.toISOString().slice(0, 10)
          : "",
        remark: r.remark ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "view-vehicles") {
    const rows = await prisma.vehicle.findMany({
      where: kvkScope,
      include: { kvk: true },
      // Real bug, 2026-09-13 (client screenshot): this was `createdAt: "desc"`
      // only, so a vehicle registered later but purchased in an earlier year
      // (e.g. an old tractor entered into the system after a newer bus) sorted
      // above it - "Year of Purchase" column read 2025, 2026, 2025, 2009,
      // 2015... with no real order. Same fix as VehicleStatus/NfBeneficiary.
      orderBy: [{ yearOfPurchase: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        vehicleType: r.vehicleType ?? "",
        vehicleName: r.name,
        registrationNo: r.registrationNo,
        yearOfPurchase: String(r.yearOfPurchase),
        totalCost: String(r.cost),
        totalRun: r.totalRun != null ? String(r.totalRun) : "",
        presentStatus: r.presentStatus ?? "",
        repairingCost: r.repairingCost != null ? String(r.repairingCost) : "",
        sourceOfFunding: r.sourceOfFunding ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "vehicle-details") {
    // VehicleStatus has no kvkId of its own (only vehicleId + zoneId), so a KVK
    // Admin has to be scoped through the parent Vehicle - same shape as the FLD
    // child tables below.
    const statuses = await prisma.vehicleStatus.findMany({
      where: kvkScope.kvkId
        ? { vehicle: { kvkId: kvkScope.kvkId } }
        : { zoneId: kvkScope.zoneId },
      include: { vehicle: { include: { kvk: true } } },
      // Real bug, 2026-09-13: this was `createdAt: "desc"` only, so a record
      // entered later for an EARLIER reporting year (catch-up/arrears entry)
      // sorted above a real, more recent year - "2025 is there, 2019 is
      // above it". Year first, same pattern every other reportingYear model
      // in this file already uses, with createdAt only as the tiebreak.
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    // Carry-forward (client direction, 2026-09-10, revised 2026-09-11): a
    // vehicle whose latest record is in an earlier year and isn't "Auction"
    // shows automatically as a current-year row carrying last year's values.
    // It's display-only (id "carry:<vehicleId>", `_carriedForward`) until the
    // user edits+saves it - that creates the real current-year record
    // (upsert). Only "Auction" stops carry-forward now - "Condemned" no
    // longer does (client direction, 2026-09-11: a condemned vehicle still
    // carries forward normally; only once it's sent to auction does it stop).
    const CURRENT_YEAR = new Date().getFullYear();
    const latestByVehicle = new Map<string, (typeof statuses)[number]>();
    for (const s of statuses) {
      const cur = latestByVehicle.get(s.vehicleId);
      if (!cur || s.reportingYear > cur.reportingYear) latestByVehicle.set(s.vehicleId, s);
    }
    const carried = [...latestByVehicle.values()].filter(
      (s) =>
        s.reportingYear < CURRENT_YEAR &&
        (s.presentStatus ?? "").trim().toLowerCase() !== "auction",
    );
    const toVehicleRow = (s: (typeof statuses)[number], isCarried: boolean) => {
      const formFields = {
        reportingYear: String(isCarried ? CURRENT_YEAR : s.reportingYear),
        vehicleName: s.vehicle.name,
        totalRunKms: s.totalRunKmHrs != null ? String(s.totalRunKmHrs) : "",
        presentStatus: s.presentStatus ?? "",
        fundingSource: s.fundingSource ?? "",
        repairingCost: s.repairingCost != null ? String(s.repairingCost) : "",
      };
      return {
        id: isCarried ? `carry:${s.vehicleId}` : s.id,
        ...formFields,
        kvk: s.vehicle.kvk.name,
        registrationNumber: s.vehicle.registrationNo,
        _carriedForward: isCarried ? "1" : "",
        ...(isCarried ? { _prefill: JSON.stringify(formFields) } : {}),
      };
    };
    formData = {
      rows: [
        ...carried.map((s) => toVehicleRow(s, true)),
        ...statuses.map((s) => toVehicleRow(s, false)),
      ],
      totalCount: statuses.length + carried.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "view-equipments") {
    const rows = await prisma.equipment.findMany({
      where: kvkScope,
      include: { kvk: true },
      // Same real bug as view-vehicles above (2026-09-13): year first, then
      // createdAt only to break ties.
      orderBy: [{ yearOfPurchase: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        equipmentType: r.equipmentType ?? "",
        equipmentName: r.name,
        yearOfPurchase: String(r.yearOfPurchase),
        totalCost: String(r.cost),
        presentStatus: r.presentStatus ?? "",
        repairingCost: r.repairingCost != null ? String(r.repairingCost) : "",
        sourceOfFund: r.sourceOfFund ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "equipment-details") {
    // EquipmentStatus has no kvkId of its own (only equipmentId + zoneId) - scope
    // a KVK Admin through the parent Equipment.
    const statuses = await prisma.equipmentStatus.findMany({
      where: kvkScope.kvkId
        ? { equipment: { kvkId: kvkScope.kvkId } }
        : { zoneId: kvkScope.zoneId },
      include: { equipment: { include: { kvk: true } } },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    // Same carry-forward as Vehicle Details above - only "Auction" stops it.
    const CURRENT_YEAR = new Date().getFullYear();
    const latestByEquipment = new Map<string, (typeof statuses)[number]>();
    for (const s of statuses) {
      const cur = latestByEquipment.get(s.equipmentId);
      if (!cur || s.reportingYear > cur.reportingYear) latestByEquipment.set(s.equipmentId, s);
    }
    const carried = [...latestByEquipment.values()].filter(
      (s) =>
        s.reportingYear < CURRENT_YEAR &&
        (s.presentStatus ?? "").trim().toLowerCase() !== "auction",
    );
    const toEquipmentRow = (s: (typeof statuses)[number], isCarried: boolean) => {
      const formFields = {
        reportingYear: String(isCarried ? CURRENT_YEAR : s.reportingYear),
        equipmentName: s.equipment.name,
        presentStatus: s.presentStatus ?? "",
        repairingCost: s.repairingCost != null ? String(s.repairingCost) : "",
      };
      return {
        id: isCarried ? `carry:${s.equipmentId}` : s.id,
        ...formFields,
        kvk: s.equipment.kvk.name,
        sourceOfFund: s.equipment.sourceOfFund ?? "",
        _carriedForward: isCarried ? "1" : "",
        ...(isCarried ? { _prefill: JSON.stringify(formFields) } : {}),
      };
    };
    formData = {
      rows: [
        ...carried.map((s) => toEquipmentRow(s, true)),
        ...statuses.map((s) => toEquipmentRow(s, false)),
      ],
      totalCount: statuses.length + carried.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "oft") {
    const rows = await prisma.oft.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        reportingYear: String(r.reportingYear),
        kvk: r.kvk.name,
        staff: r.staff,
        trialOnForm: r.trialOnForm,
        problemDiagnosed: r.problemDiagnosed ?? "",
        status: r.status === "COMPLETED" ? "Completed" : r.status === "TRANSFERRED" ? "Transferred to Next Year" : "Ongoing",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "view-fld") {
    const rows = await prisma.fld.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        reportingYear: String(r.reportingYear),
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        kvk: r.kvk.name,
        category: r.category,
        subCategory: r.subCategory,
        technologyDemonstrated: r.technologyDemonstrated,
        status: r.status === "COMPLETED" ? "Completed" : r.status === "TRANSFERRED" ? "Transferred to Next Year" : "Ongoing",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "fld-extension-training") {
    const rows = await prisma.fldExtensionTraining.findMany({
      where: kvkScope.kvkId ? { fld: { kvkId: kvkScope.kvkId } } : { zoneId: kvkScope.zoneId },
      include: { fld: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        fldName: r.fld.technologyDemonstrated,
        activity: r.activity,
        date: r.date.toISOString().slice(0, 10),
        activityCount: String(r.activityCount),
        participantCountMale: r.participantCountMale != null ? String(r.participantCountMale) : "",
        participantCountFemale: r.participantCountFemale != null ? String(r.participantCountFemale) : "",
        participantCount: String(r.participantCount),
        remark: r.remark ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "fld-technical-feedback") {
    const rows = await prisma.fldTechnicalFeedback.findMany({
      where: kvkScope.kvkId ? { fld: { kvkId: kvkScope.kvkId } } : { zoneId: kvkScope.zoneId },
      include: { fld: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        fld: r.fld.technologyDemonstrated,
        crop: r.crop,
        feedback: r.feedback,
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "trainings") {
    const rows = await prisma.training.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    const imagesByRecord = await moduleImagesByRecord(rows.map((r) => r.id));
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        moduleImages: JSON.stringify(imagesByRecord.get(r.id) ?? []),
        reportingYear: String(r.reportingYear),
        kvk: r.kvk.name,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        title: r.title,
        venue: r.venue ?? "",
        trainingDiscipline: r.trainingDiscipline ?? "",
        thematicArea: r.thematicArea ?? "",
        clientele: r.clientele ?? "",
        trainingType: r.trainingType ?? "",
        trainingArea: r.trainingArea ?? "",
        onCampusOffCampus: r.onCampusOffCampus ?? "",
        courseCoordinator: r.courseCoordinator ?? "",
        fundingSource: r.fundingSource ?? "",
        fundingAgencyName: r.fundingAgencyName ?? "",
        generalMale: String(r.generalMale),
        generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale),
        obcFemale: String(r.obcFemale),
        scMale: String(r.scMale),
        scFemale: String(r.scFemale),
        stMale: String(r.stMale),
        stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "extension-activities") {
    const rows = await prisma.extensionActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    const imagesByRecord = await moduleImagesByRecord(rows.map((r) => r.id));
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        moduleImages: JSON.stringify(imagesByRecord.get(r.id) ?? []),
        reportingYear: String(r.reportingYear),
        kvk: r.kvk.name,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        natureOfExtensionActivity: r.natureOfExtensionActivity,
        noOfActivities: String(r.noOfActivities),
        noOfParticipants: String(r.noOfParticipants),
        staff: r.staff ?? "",
        farmersGeneralMale: String(r.farmersGeneralMale),
        farmersGeneralFemale: String(r.farmersGeneralFemale),
        farmersObcMale: String(r.farmersObcMale),
        farmersObcFemale: String(r.farmersObcFemale),
        farmersScMale: String(r.farmersScMale),
        farmersScFemale: String(r.farmersScFemale),
        farmersStMale: String(r.farmersStMale),
        farmersStFemale: String(r.farmersStFemale),
        officialsGeneralMale: String(r.officialsGeneralMale),
        officialsGeneralFemale: String(r.officialsGeneralFemale),
        officialsObcMale: String(r.officialsObcMale),
        officialsObcFemale: String(r.officialsObcFemale),
        officialsScMale: String(r.officialsScMale),
        officialsScFemale: String(r.officialsScFemale),
        officialsStMale: String(r.officialsStMale),
        officialsStFemale: String(r.officialsStFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "other-extension-activities") {
    const rows = await prisma.otherExtensionActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        reportingYear: String(r.reportingYear),
        kvk: r.kvk.name,
        natureOfExtensionActivity: r.natureOfExtensionActivity,
        noOfActivities: String(r.noOfActivities),
        staff: r.staff ?? "",
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "technology-week-celebration") {
    const rows = await prisma.technologyWeekCelebration.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        kvk: r.kvk.name,
        typeOfActivities: r.typeOfActivities,
        noOfActivities: String(r.noOfActivities),
        relatedCropTechnology: r.relatedCropTechnology ?? "",
        numberOfParticipants: String(r.numberOfParticipants),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "celebration-days") {
    const rows = await prisma.celebrationDay.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        importantDay: r.importantDay,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        noOfActivities: String(r.noOfActivities),
        farmersGeneralMale: String(r.farmersGeneralMale),
        farmersGeneralFemale: String(r.farmersGeneralFemale),
        farmersObcMale: String(r.farmersObcMale),
        farmersObcFemale: String(r.farmersObcFemale),
        farmersScMale: String(r.farmersScMale),
        farmersScFemale: String(r.farmersScFemale),
        farmersStMale: String(r.farmersStMale),
        farmersStFemale: String(r.farmersStFemale),
        officialsGeneralMale: String(r.officialsGeneralMale),
        officialsGeneralFemale: String(r.officialsGeneralFemale),
        officialsObcMale: String(r.officialsObcMale),
        officialsObcFemale: String(r.officialsObcFemale),
        officialsScMale: String(r.officialsScMale),
        officialsScFemale: String(r.officialsScFemale),
        officialsStMale: String(r.officialsStMale),
        officialsStFemale: String(r.officialsStFemale),
        vipGeneralMale: String(r.vipGeneralMale),
        vipGeneralFemale: String(r.vipGeneralFemale),
        vipObcMale: String(r.vipObcMale),
        vipObcFemale: String(r.vipObcFemale),
        vipScMale: String(r.vipScMale),
        vipScFemale: String(r.vipScFemale),
        vipStMale: String(r.vipStMale),
        vipStFemale: String(r.vipStFemale),
        vipNameDesignationAddress: r.vipNameDesignationAddress ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "poshan-maaha") {
    const rows = await prisma.poshanMaaha.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        activityDate: r.activityDate.toISOString().slice(0, 10),
        activitiesConducted: r.activitiesConducted,
        eventName: r.eventName,
        saplingsPlanted: String(r.saplingsPlanted),
        vegetableKits: String(r.vegetableKits),
        participantsGirls: String(r.participantsGirls),
        participantsPublicRepresentatives: String(r.participantsPublicRepresentatives),
        participantsFarmWoman: String(r.participantsFarmWoman),
        participantsFarmers: String(r.participantsFarmers),
        participantsAganwadiWorkers: String(r.participantsAganwadiWorkers),
        participantsGovtOfficials: String(r.participantsGovtOfficials),
        totalParticipants: String(r.totalParticipants),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && (node.slug === "sewa" || node.slug === "pakhwada")) {
    const rows = await prisma.swachhtaObservance.findMany({
      where: { ...kvkScope, kind: node.slug === "sewa" ? "SEWA" : "PAKHWADA" },
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        fromDate: r.fromDate ? r.fromDate.toISOString().slice(0, 10) : "",
        toDate: r.toDate ? r.toDate.toISOString().slice(0, 10) : "",
        totalNoOfActivitiesUndertaken: String(r.totalNoOfActivitiesUndertaken),
        noOfStaffs: String(r.noOfStaffs),
        noOfFarmers: String(r.noOfFarmers),
      })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "budget-expenditure" &&
    trail[trail.length - 2]?.slug === "swachhta-bharat-abhiyaan"
  ) {
    const rows = await prisma.swachhtaBudgetExpenditure.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        /** Stored as a bare year (Int) but rendered as a real date picker (fieldKind: "date") - see World Soil Day's own identical comment above. */
        reportingYear: `${r.reportingYear}-01-01`,
        vermicompostingVillagesCovered: String(r.vermicompostingVillagesCovered),
        vermicompostingTotalExpenditure: String(r.vermicompostingTotalExpenditure),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "production-supply") {
    const rows = await prisma.technologyProductProduction.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear != null ? String(r.reportingYear) : "",
        productCategory: r.productCategory ?? "",
        variety: r.variety,
        quantity: String(r.quantity),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "soil-testing-equipment") {
    const rows = await prisma.soilTestingEquipment.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear != null ? String(r.reportingYear) : "",
        analysis: r.analysis,
        equipmentName: r.equipmentName,
        quantity: String(r.quantity),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "soil-water-testing") {
    const rows = await prisma.soilWaterPlantAnalysis.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        analysis: r.analysis,
        noOfSamplesAnalyzed: String(r.noOfSamplesAnalyzed),
        noOfVillagesCovered: String(r.noOfVillagesCovered),
        amountRealized: String(r.amountRealized),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "world-soil-day") {
    const rows = await prisma.worldSoilDay.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        /** Stored as a bare year (Int?) but rendered as a real date picker (fieldKind: "date") - "yyyy-01-01" is a valid value for that input, and parseInt on save reads the year back out regardless of month/day. */
        reportingYear: r.reportingYear !== null ? `${r.reportingYear}-01-01` : "",
        noOfActivitiesConducted: String(r.noOfActivitiesConducted),
        soilHealthCardsDistributed: String(r.soilHealthCardsDistributed),
        noOfVip: String(r.noOfVip),
        vipNames: r.vipNames ?? "",
        totalParticipants: String(r.totalParticipants),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "publications") {
    const rows = await prisma.publication.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        itemName: r.itemName,
        title: r.title,
        authorName: r.authorName,
        journalName: r.journalName ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "hrd") {
    const rows = await prisma.humanResourceDevelopment.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        staff: r.staff,
        course: r.course,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        venue: r.venue ?? "",
        organizer: r.organizer ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "kvk" &&
    trail[trail.length - 2]?.slug === "awards"
  ) {
    const rows = await prisma.kvkAward.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        award: r.award,
        amount: String(r.amount),
        achievement: r.achievement ?? "",
        conferringAuthority: r.conferringAuthority ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "scientist" &&
    trail[trail.length - 2]?.slug === "awards"
  ) {
    const rows = await prisma.scientistAward.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        headScientist: r.headScientist,
        award: r.award,
        amount: String(r.amount),
        achievement: r.achievement ?? "",
        conferringAuthority: r.conferringAuthority ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "farmer" &&
    trail[trail.length - 2]?.slug === "awards"
  ) {
    const rows = await prisma.farmerAward.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        farmerName: r.farmerName,
        address: r.address ?? "",
        contactNumber: r.contactNumber ?? "",
        award: r.award,
        amount: String(r.amount),
        achievement: r.achievement ?? "",
        conferringAuthority: r.conferringAuthority ?? "",
        // Photographs (fieldKind "photos", key "moduleImages") load on Edit from
        // /api/leaf-record/module-images, not off the list row.
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "technical-parameter") {
    const rows = await prisma.cfldTechnicalParameter.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        reportingYear: String(r.reportingYear),
        kvk: r.kvk.name,
        crop: r.crop,
        technologyDemonstrated: r.detailOfTechnologyDemonstrated,
        areaHa: String(r.areaHa),
        numberOfFarmers: String(r.numberOfFarmers),
        districtYield: r.districtYield ? String(r.districtYield) : "",
        stateYield: r.stateYield ? String(r.stateYield) : "",
        potentialYield: r.potentialYield ? String(r.potentialYield) : "",
        status: r.status === "COMPLETED" ? "Completed" : "Ongoing",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "extension-activity-cfld") {
    const rows = await prisma.cfldExtensionActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        season: r.season,
        activityName: r.activityName,
        activitiesOrganized: String(r.activitiesOrganized),
        date: r.date.toISOString().slice(0, 10),
        placeOfActivity: r.placeOfActivity,
        generalMale: String(r.generalMale),
        generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale),
        obcFemale: String(r.obcFemale),
        scMale: String(r.scMale),
        scFemale: String(r.scFemale),
        stMale: String(r.stMale),
        stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "budget-utilization") {
    const rows = await prisma.cfldBudgetUtilization.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        crop: r.crop,
        season: r.season,
        overallFundAllocation: String(r.overallFundAllocation),
        areaAllotedHa: r.areaAllotedHa != null ? String(r.areaAllotedHa) : "",
        areaAchievedHa: r.areaAchievedHa != null ? String(r.areaAchievedHa) : "",
        criticalInputReceived: r.criticalInputReceived != null ? String(r.criticalInputReceived) : "",
        criticalInputUtilization: r.criticalInputUtilization != null ? String(r.criticalInputUtilization) : "",
        criticalInputBalance: r.criticalInputBalance != null ? String(r.criticalInputBalance) : "",
        extensionReceived: r.extensionReceived != null ? String(r.extensionReceived) : "",
        extensionUtilization: r.extensionUtilization != null ? String(r.extensionUtilization) : "",
        extensionBalance: r.extensionBalance != null ? String(r.extensionBalance) : "",
        publicationReceived: r.publicationReceived != null ? String(r.publicationReceived) : "",
        publicationUtilization: r.publicationUtilization != null ? String(r.publicationUtilization) : "",
        publicationBalance: r.publicationBalance != null ? String(r.publicationBalance) : "",
        taDaReceived: r.taDaReceived != null ? String(r.taDaReceived) : "",
        taDaUtilization: r.taDaUtilization != null ? String(r.taDaUtilization) : "",
        taDaBalance: r.taDaBalance != null ? String(r.taDaBalance) : "",
        overallFundReceived: r.overallFundReceived != null ? String(r.overallFundReceived) : "",
        overallFundUtilized: r.overallFundUtilized != null ? String(r.overallFundUtilized) : "",
        overallBalance: r.overallBalance != null ? String(r.overallBalance) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "crop-wise-images") {
    const rows = await prisma.cfldCropWiseImage.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id, kvk: r.kvk.name, crop: r.crop, image: r.imageUrl })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "basic-information" &&
    trail[trail.length - 2]?.slug === "nicra"
  ) {
    const rows = await prisma.nicraBasicInformation.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        rfDistrictNormal: r.rfDistrictNormal ? String(r.rfDistrictNormal) : "",
        rfDistrictReceived: r.rfDistrictReceived ? String(r.rfDistrictReceived) : "",
        maxTemperature: r.maxTemperature ? String(r.maxTemperature) : "",
        minTemperature: r.minTemperature ? String(r.minTemperature) : "",
      })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "details" &&
    trail[trail.length - 2]?.slug === "nicra"
  ) {
    const rows = await prisma.nicraDetails.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        cropName: r.cropName,
        seasonName: r.seasonName,
        technologyDemonstration: r.technologyDemonstration,
        noOfFarmers: String(r.noOfFarmers),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (
    user &&
    node.type === "leaf" &&
    node.slug === "training" &&
    trail[trail.length - 2]?.slug === "nicra"
  ) {
    const rows = await prisma.nicraTraining.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        title: r.title,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        farmersAttended: String(r.farmersAttended),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "extension-activity-nicra") {
    const rows = await prisma.nicraExtensionActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        activityName: r.activityName,
        places: r.places,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        farmersAttended: String(r.farmersAttended),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "intervention") {
    const rows = await prisma.nicraIntervention.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        seedBankFodderBank: r.seedBankFodderBank,
        crop: r.crop,
        variety: r.variety,
        quantity: String(r.quantityQuintal),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "revenue-generated") {
    const rows = await prisma.nicraRevenueGenerated.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        year: String(r.year),
        revenue: String(r.revenue),
        total: String(r.total),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "custom-hiring-farm-implement") {
    const rows = await prisma.nicraCustomHiringFarmImplement.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        farmImplementName: r.farmImplementName,
        farmersUsed: String(r.farmersUsed),
        areaCovered: String(r.areaCovered),
        hoursUsed: String(r.hoursUsed),
        revenueGenerated: String(r.revenueGenerated),
        repairExpenditure: String(r.repairExpenditure),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "village-wise-vcrmc") {
    const rows = await prisma.nicraVillageWiseVcrmc.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        villageName: r.villageName,
        constitutionDate: r.constitutionDate
          ? r.constitutionDate.toISOString().slice(0, 10)
          : "",
        members: String(r.members),
        meetingsOrganized: String(r.meetingsOrganized),
        meetingDate: r.meetingDate ? r.meetingDate.toISOString().slice(0, 10) : "",
        secretaryName: r.secretaryName ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "soil-health-card") {
    const rows = await prisma.nicraSoilHealthCard.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        kvk: r.kvk.name,
        samplesCollected: String(r.samplesCollected),
        samplesAnalysed: String(r.samplesAnalysed),
        shcIssued: String(r.shcIssued),
        farmersBenefitted: String(r.farmersBenefitted),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "convergence-programme") {
    const rows = await prisma.nicraConvergenceProgramme.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        kvk: r.kvk.name,
        scheme: r.scheme,
        natureOfWork: r.natureOfWork,
        amount: String(r.amount),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "dignitaries-visited-nicra-villages") {
    const rows = await prisma.nicraDignitaryVisit.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        vipExperts: r.vipExperts,
        name: r.name,
        dateOfVisit: r.dateOfVisit.toISOString().slice(0, 10),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "pi-co-pi-list") {
    const rows = await prisma.nicraPiCoPi.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        kvk: r.kvk.name,
        piCoPi: r.piCoPi,
        name: r.name,
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && isProjectTeamSlug(node.slug)) {
    /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon") - same shape as NICRA's own "Project Team Detail" above, one model per Project section (PROJECT_TEAM_MODEL_BY_SLUG). */
    const rows = await findProjectTeamRows(node.slug, kvkScope);
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        kvk: r.kvk.name,
        projectTeam: r.projectTeam,
        name: r.name,
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "arya-safal-current-year") {
    const rows = await prisma.aryaCurrentYearDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        enterprise: r.enterprise,
        viableUnits: String(r.viableUnits),
        closedUnits: String(r.closedUnits),
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        groupsFormed: String(r.groupsFormed),
        groupsActive: String(r.groupsActive),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "arya-safal-previous-year") {
    const rows = await prisma.aryaPreviousYearEvaluation.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        enterprise: r.enterprise,
        totalClosed: String(r.totalClosed),
        closingDate: r.closingDate ? r.closingDate.toISOString().slice(0, 10) : "",
        totalRestarted: String(r.totalRestarted),
        restartedDate: r.restartedDate ? r.restartedDate.toISOString().slice(0, 10) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-geographical") {
    const rows = await prisma.nfGeographicalInfo.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        agroClimaticZone: r.agroClimaticZone,
        farmingSituation: r.farmingSituation,
        latitude: String(r.latitude),
        longitude: String(r.longitude),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-physical") {
    const rows = await prisma.nfPhysicalInfo.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        activityName: r.activityName,
        trainingTitle: r.trainingTitle,
        trainingDate: r.trainingDate.toISOString().slice(0, 10),
        venue: r.venue,
        participants: String(r.participants),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-demonstration") {
    const rows = await prisma.nfDemonstrationInfo.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        farmerName: r.farmerName,
        activityName: r.activityName,
        crop: r.crop,
        variety: r.variety,
        farmerAddress: r.farmerAddress ?? "",
        farmerContact: r.farmerContact ?? "",
        agroClimaticZone: r.agroClimaticZone ?? "",
        croppingPattern: r.croppingPattern ?? "",
        farmingSituation: r.farmingSituation ?? "",
        latitude: r.latitude != null ? String(r.latitude) : "",
        longitude: r.longitude != null ? String(r.longitude) : "",
        season: r.season ?? "",
        technologyDemonstrated: r.technologyDemonstrated ?? "",
        areaHa: r.areaHa != null ? String(r.areaHa) : "",
        farmerPracticeDetail: r.farmerPracticeDetail ?? "",
        farmerFeedback: r.farmerFeedback ?? "",
        parameters: JSON.stringify(r.parameters ?? {}),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-already-practicing") {
    const rows = await prisma.nfAlreadyPracticing.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        farmerName: r.farmerName,
        address: r.address ?? "",
        normalCropsGrown: r.normalCropsGrown ?? "",
        practicingYear: String(r.practicingYear),
        contactNumber: r.contactNumber ?? "",
        activityName: r.activityName ?? "",
        crop: r.crop ?? "",
        technologyDemonstrated: r.technologyDemonstrated ?? "",
        areaHa: r.areaHa != null ? String(r.areaHa) : "",
        farmerFeedback: r.farmerFeedback ?? "",
        parameters: JSON.stringify(r.parameters ?? {}),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-beneficiaries") {
    const rows = await prisma.nfBeneficiary.findMany({
      where: kvkScope,
      include: { kvk: true },
      // Same real bug as vehicleStatus above (2026-09-13): year first, then
      // createdAt only to break ties between rows in the same year.
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        numberOfBlock: String(r.numberOfBlock),
        numberOfVillage: String(r.numberOfVillage),
        numberOfTraining: String(r.numberOfTraining),
        farmersInfluenced: String(r.farmersInfluenced),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-soil-data") {
    const rows = await prisma.nfSoilData.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        season: r.season,
        type: r.type,
        crop: r.crop,
        beforePh: String(r.beforePh),
        beforeEc: String(r.beforeEc),
        beforeEcOc: String(r.beforeEcOc),
        afterPh: String(r.afterPh),
        afterEc: String(r.afterEc),
        afterEcOc: String(r.afterEcOc),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nf-budget-expenditure") {
    const rows = await prisma.nfBudgetExpenditure.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        activityName: r.activityName,
        activitiesOrganised: String(r.activitiesOrganised),
        budgetSanction: String(r.budgetSanction),
        budgetExpenditure: String(r.budgetExpenditure),
        totalBudgetExpenditure: String(r.totalBudgetExpenditure),
        balance: r.balance != null ? String(r.balance) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "view-sub-plan-activity") {
    const rows = await prisma.subPlanActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        type: r.type === "TSP" ? "TSP" : "SCSP",
        activities: r.activities,
        noOfTraining: String(r.noOfTraining),
        beneficiaries: String(r.beneficiaries),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nari-nutrition-garden") {
    const rows = await prisma.nariNutritionGarden.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        nutriSmartVillage: r.nutriSmartVillage,
        typeOfNutritionalGarden: r.typeOfNutritionalGarden,
        numbers: String(r.numbers),
        areaSqm: String(r.areaSqm),
        male: String(r.male), female: String(r.female),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nari-bio-fortified") {
    const rows = await prisma.nariBioFortified.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        nutriSmartVillage: r.nutriSmartVillage,
        season: r.season,
        activity: r.activity,
        categoryOfCrop: r.categoryOfCrop,
        male: String(r.male), female: String(r.female),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nari-value-addition") {
    const rows = await prisma.nariValueAddition.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        nutriSmartVillage: r.nutriSmartVillage,
        cropName: r.cropName,
        valueAddedProduct: r.valueAddedProduct,
        activity: r.activity,
        male: String(r.male), female: String(r.female),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nari-training") {
    const rows = await prisma.nariTraining.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        nutriSmartVillage: r.nutriSmartVillage,
        areaOfTraining: r.areaOfTraining,
        activity: r.activity,
        titleOfTraining: r.titleOfTraining,
        male: String(r.male), female: String(r.female),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nari-extension") {
    const rows = await prisma.nariExtension.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        nutriSmartVillage: r.nutriSmartVillage,
        activity: r.activity,
        nameOfActivity: r.nameOfActivity,
        noOfActivities: String(r.noOfActivities),
        male: String(r.male), female: String(r.female),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "agri-drone-introduction") {
    const rows = await prisma.agriDroneIntroduction.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        year: String(r.year),
        centreName: r.centreName,
        companyOfDrone: r.companyOfDrone,
        modelOfDrone: r.modelOfDrone,
        dronesSanctioned: String(r.dronesSanctioned),
        dronesPurchased: String(r.dronesPurchased),
        amountSanctioned: String(r.amountSanctioned),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "agri-drone-demonstration") {
    const rows = await prisma.agriDroneDemonstration.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        centreName: r.centreName,
        district: r.district,
        dateOfDemos: r.dateOfDemos.toISOString().slice(0, 10),
        placeOfDemos: r.placeOfDemos,
        cropName: r.cropName,
        noOfDemos: String(r.noOfDemos),
        areaCovered: String(r.areaCovered),
        noOfFarmers: String(r.noOfFarmers),
        generalMale: String(r.generalMale), generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale), obcFemale: String(r.obcFemale),
        scMale: String(r.scMale), scFemale: String(r.scFemale),
        stMale: String(r.stMale), stFemale: String(r.stFemale),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "fpo-cbbo-details") {
    const rows = await prisma.fpoCbboDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        noOfBlocksAllocated: String(r.noOfBlocksAllocated),
        noOfFposRegistered: String(r.noOfFposRegistered),
        trainingReceived: r.trainingReceived ?? "",
        businessPlanPrepared: r.businessPlanPrepared ? "Yes" : "No",
        noOfFposDoingBusiness: String(r.noOfFposDoingBusiness),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "fpo-management") {
    const rows = await prisma.fpoManagement.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        registrationNo: r.registrationNo,
        dateOfRegistration: r.dateOfRegistration.toISOString().slice(0, 10),
        fpoName: r.fpoName,
        fpoAddress: r.fpoAddress ?? "",
        totalBomMembers: String(r.totalBomMembers),
        financialPosition: r.financialPosition ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "drmr-details") {
    const rows = await prisma.drmrDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        varietiesUsedInIp: r.varietiesUsedInIp,
        situations: r.situations,
        varietiesUsedInFp: r.varietiesUsedInFp,
        netReturnImprovedPractice: String(r.netReturnImprovedPractice),
        netReturnFarmerPractice: String(r.netReturnFarmerPractice),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "drmr-activity") {
    const rows = await prisma.drmrActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => {
        const category = (r.farmersByCategory ?? {}) as Record<string, string>;
        return {
          id: r.id,
          kvk: r.kvk.name,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate.toISOString().slice(0, 10),
          training: r.training ?? "",
          flds: r.flds ?? "",
          awarenessCamps: r.awarenessCamps ?? "",
          distributionOfLiterature: r.distributionOfLiterature ?? "",
          generalMale: category.generalMale ?? "",
          generalFemale: category.generalFemale ?? "",
          obcMale: category.obcMale ?? "",
          obcFemale: category.obcFemale ?? "",
          scMale: category.scMale ?? "",
          scFemale: category.scFemale ?? "",
          stMale: category.stMale ?? "",
          stFemale: category.stFemale ?? "",
        };
      }),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "cra-details") {
    const rows = await prisma.craDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => {
        const category = (r.farmersByCategory ?? {}) as Record<string, string>;
        return {
          id: r.id,
          kvk: r.kvk.name,
          season: r.season,
          technologyDemonstrated: r.technologyDemonstrated,
          croppingSystem: r.croppingSystem,
          areaHa: String(r.areaHa),
          noOfFarmer: String(r.noOfFarmer),
          generalMale: category.generalMale ?? "",
          generalFemale: category.generalFemale ?? "",
          obcMale: category.obcMale ?? "",
          obcFemale: category.obcFemale ?? "",
          scMale: category.scMale ?? "",
          scFemale: category.scFemale ?? "",
          stMale: category.stMale ?? "",
          stFemale: category.stFemale ?? "",
        };
      }),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "cra-extension-activity") {
    const rows = await prisma.craExtensionActivity.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        extensionActivity: r.extensionActivity,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        withinOrWithoutState: r.withinOrWithoutState ?? "",
        exposureVisits: String(r.exposureVisits),
        farmersUnderExposure: String(r.farmersUnderExposure),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "csisa-details") {
    const rows = await prisma.csisaDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        season: r.season,
        villageCovered: String(r.villageCovered),
        blockCovered: String(r.blockCovered),
        districtCovered: String(r.districtCovered),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "seed-hub-program") {
    const rows = await prisma.seedHubProgram.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        season: r.season,
        cropName: r.cropName,
        variety: r.variety,
        areaHa: String(r.areaHa),
        yieldHa: String(r.yieldHa),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "other-programme") {
    const rows = await prisma.otherProgramme.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => {
        const category = (r.farmersByCategory ?? {}) as Record<string, string>;
        return {
          id: r.id,
          kvk: r.kvk.name,
          programmeName: r.programmeName,
          programmeDate: r.programmeDate.toISOString().slice(0, 10),
          venue: r.venue ?? "",
          purpose: r.purpose ?? "",
          participants: String(r.participants),
          generalMale: category.generalMale ?? "",
          generalFemale: category.generalFemale ?? "",
          obcMale: category.obcMale ?? "",
          obcFemale: category.obcFemale ?? "",
          scMale: category.scMale ?? "",
          scFemale: category.scFemale ?? "",
          stMale: category.stMale ?? "",
          stFemale: category.stFemale ?? "",
        };
      }),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "impact-of-kvk-activities") {
    const rows = await prisma.kvkActivityImpact.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear != null ? String(r.reportingYear) : "",
        specificArea: r.specificArea,
        briefDetails: r.briefDetails ?? "",
        farmersBenefitted: String(r.farmersBenefitted),
        horizontalSpread: r.horizontalSpread ?? "",
        adoptionPercent: String(r.adoptionPercent),
        impactSubjective: r.impactSubjective ?? "",
        impactObjective: r.impactObjective ?? "",
        incomeBefore: r.incomeBefore != null ? String(r.incomeBefore) : "",
        incomeAfter: r.incomeAfter != null ? String(r.incomeAfter) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "entrepreneurship-details") {
    const rows = await prisma.entrepreneurshipDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear != null ? String(r.reportingYear) : "",
        entrepreneurOrEnterprise: r.entrepreneurOrEnterprise,
        registeredAddress: r.registeredAddress ?? "",
        enterpriseType: r.enterpriseType,
        yearOfEstablishment: r.yearOfEstablishment != null ? String(r.yearOfEstablishment) : "",
        registrationDetails: r.registrationDetails ?? "",
        membersAssociated: String(r.membersAssociated),
        technicalComponents: r.technicalComponents ?? "",
        annualIncome: String(r.annualIncome),
        roleOfKvk: r.roleOfKvk ?? "",
        periodTimeline: r.periodTimeline ?? "",
        economicSocialStatus: r.economicSocialStatus ?? "",
        presentWorkingCondition: r.presentWorkingCondition ?? "",
        majorAchievements: r.majorAchievements ?? "",
        majorConstraints: r.majorConstraints ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "success-stories") {
    const rows = await prisma.successStory.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear != null ? String(r.reportingYear) : "",
        farmerOrEntrepreneur: r.farmerOrEntrepreneur,
        dateOfBirth: r.dateOfBirth ? r.dateOfBirth.toISOString().slice(0, 10) : "",
        education: r.education ?? "",
        experience: r.experience ?? "",
        cellNoEmail: r.cellNoEmail ?? "",
        fullAddress: r.fullAddress ?? "",
        professionalMembership: r.professionalMembership ?? "",
        majorAchievement: r.majorAchievement,
        awardsReceived: r.awardsReceived ?? "",
        storyTitle: r.storyTitle,
        situationAnalysis: r.situationAnalysis ?? "",
        planImplementSupport: r.planImplementSupport ?? "",
        detailsOfPractices: r.detailsOfPractices ?? "",
        resultsOutput: r.resultsOutput ?? "",
        impactOutcome: r.impactOutcome ?? "",
        futurePlans: r.futurePlans ?? "",
        enterprise: r.enterprise ?? "",
        grossIncome: r.grossIncome != null ? String(r.grossIncome) : "",
        netIncome: r.netIncome != null ? String(r.netIncome) : "",
        costBenefitRatio: r.costBenefitRatio != null ? String(r.costBenefitRatio) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "district-level-data") {
    const rows = await prisma.districtLevelData.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: String(r.reportingYear),
        items: r.items,
        information: r.information ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "operational-area-details") {
    const rows = await prisma.operationalAreaDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: String(r.reportingYear),
        taluk: r.taluk ?? "",
        block: r.block,
        village: r.village,
        majorCrops: r.majorCrops ?? "",
        majorProblems: r.majorProblems ?? "",
        thrustAreas: r.thrustAreas ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "village-adoption-programme") {
    const rows = await prisma.villageAdoptionProgramme.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: String(r.reportingYear),
        village: r.village,
        block: r.block,
        actionTaken: r.actionTaken ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "priority-thrust-area") {
    const rows = await prisma.priorityThrustArea.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: String(r.reportingYear),
        thrustArea: r.thrustArea,
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "demonstration-units") {
    const rows = await prisma.demonstrationUnit.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        demoUnitName: r.demoUnitName,
        yearOfEstt: String(r.yearOfEstt),
        areaSqMt: String(r.areaSqMt),
        varietyBreed: r.varietyBreed ?? "",
        produce: r.produce ?? "",
        qty: r.qty !== null ? String(r.qty) : "",
        costOfInputs: r.costOfInputs !== null ? String(r.costOfInputs) : "",
        grossIncome: r.grossIncome !== null ? String(r.grossIncome) : "",
        remarks: r.remarks ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "instructional-farm-crops") {
    const rows = await prisma.instructionalFarmCrop.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        cropName: r.cropName,
        areaHa: String(r.areaHa),
        season: r.season ?? "",
        variety: r.variety ?? "",
        produceType: r.produceType ?? "",
        qty: r.qty !== null ? String(r.qty) : "",
        costOfInputs: r.costOfInputs !== null ? String(r.costOfInputs) : "",
        grossIncome: r.grossIncome !== null ? String(r.grossIncome) : "",
        remarks: r.remarks ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "production-units") {
    const rows = await prisma.productionUnit.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        productName: r.productName,
        qty: String(r.qty),
        costOfInputs: r.costOfInputs !== null ? String(r.costOfInputs) : "",
        grossIncome: r.grossIncome !== null ? String(r.grossIncome) : "",
        remarks: r.remarks ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "instructional-farm-livestock") {
    const rows = await prisma.instructionalFarmLivestock.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        animalName: r.animalName,
        speciesBreed: r.speciesBreed ?? "",
        produceType: r.produceType ?? "",
        qty: r.qty !== null ? String(r.qty) : "",
        costOfInputs: r.costOfInputs !== null ? String(r.costOfInputs) : "",
        grossIncome: r.grossIncome !== null ? String(r.grossIncome) : "",
        remarks: r.remarks ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "hostel-utilization") {
    const rows = await prisma.hostelUtilization.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        months: r.months,
        traineesStayed: String(r.traineesStayed),
        traineeDays: String(r.traineeDays),
        reasonForShortFall: r.reasonForShortFall ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "staff-quarters-performance") {
    const rows = await prisma.staffQuartersPerformance.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        noOfStaffQuarters: String(r.noOfStaffQuarters),
        dateOfCompletion: r.dateOfCompletion
          ? r.dateOfCompletion.toISOString().slice(0, 10)
          : "",
        remark: r.remark ?? "",
        whetherCompleted: r.whetherCompleted ?? "",
        occupancyDetails: r.occupancyDetails ?? "",
        quarterlyCompletion: r.quarterlyCompletion ? JSON.stringify(r.quarterlyCompletion) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "rain-water-harvesting") {
    const rows = await prisma.rainWaterHarvesting.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        trainingProgrammes: String(r.trainingProgrammes),
        demonstrations: String(r.demonstrations),
        plantMaterialProduced: String(r.plantMaterialProduced),
        farmerVisits: String(r.farmerVisits),
        officialVisits: String(r.officialVisits),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "budget-details") {
    const rows = await prisma.budgetDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        salaryAllocation: String(r.salaryAllocation),
        salaryExpenditure: String(r.salaryExpenditure),
        generalGrantAllocation: String(r.generalGrantAllocation),
        generalGrantExpenditure: String(r.generalGrantExpenditure),
        capitalGrantAllocation: String(r.capitalGrantAllocation),
        capitalGrantExpenditure: String(r.capitalGrantExpenditure),
        generalTsp: r.generalTsp !== null ? String(r.generalTsp) : "",
        generalTspExpenditure: r.generalTspExpenditure !== null ? String(r.generalTspExpenditure) : "",
        generalScsp: r.generalScsp !== null ? String(r.generalScsp) : "",
        generalScspExpenditure: r.generalScspExpenditure !== null ? String(r.generalScspExpenditure) : "",
        capitalTsp: r.capitalTsp !== null ? String(r.capitalTsp) : "",
        capitalTspExpenditure: r.capitalTspExpenditure !== null ? String(r.capitalTspExpenditure) : "",
        capitalScsp: r.capitalScsp !== null ? String(r.capitalScsp) : "",
        capitalScspExpenditure: r.capitalScspExpenditure !== null ? String(r.capitalScspExpenditure) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "project-wise-budget-performance") {
    const rows = await prisma.projectWiseBudgetPerformance.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        projectName: r.projectName,
        accountNumber: r.accountNumber ?? "",
        fundingAgency: r.fundingAgency ?? "",
        budgetEstimate: String(r.budgetEstimate),
        budgetAllocated: String(r.budgetAllocated),
        budgetReleased: String(r.budgetReleased),
        expenditure: String(r.expenditure),
        unspentBalance: String(r.unspentBalance),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "revolving-fund") {
    const rows = await prisma.revolvingFund.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: String(r.reportingYear),
        openingBalance: String(r.openingBalance),
        incomeDuringYear: String(r.incomeDuringYear),
        expenditureDuringYear: String(r.expenditureDuringYear),
        closing: String(r.closing),
        kind: r.kind ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "revenue-generation") {
    const rows = await prisma.revenueGeneration.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        headName: r.headName,
        income: String(r.income),
        sponsoringAgency: r.sponsoringAgency ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "resource-generation") {
    const rows = await prisma.resourceGeneration.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
        programmeName: r.programmeName,
        purpose: r.purpose ?? "",
        sourcesOfFund: r.sourcesOfFund ?? "",
        amountLakhs: String(r.amountLakhs),
        infrastructureCreated: r.infrastructureCreated ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "functional-linkage") {
    const rows = await prisma.functionalLinkage.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        organizationName: r.organizationName,
        natureOfLinkage: r.natureOfLinkage ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "special-programmes") {
    const rows = await prisma.specialProgramme.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        reportingYear: r.reportingYear !== null ? String(r.reportingYear) : "",
        programmeType: r.programmeType,
        programmeName: r.programmeName,
        purpose: r.purpose ?? "",
        fundingAgency: r.fundingAgency ?? "",
        amount: r.amount !== null ? String(r.amount) : "",
        initiationDate: r.initiationDate ? r.initiationDate.toISOString().slice(0, 10) : "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "sac-meetings") {
    const rows = await prisma.sacMeeting.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        participants: String(r.participants),
        statutoryMembers: String(r.statutoryMembers),
        recommendations: r.recommendations ?? "",
        actionTaken: r.actionTaken ?? "",
        reason: r.reason ?? "",
        file: r.fileUrl ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "other-meetings") {
    const rows = await prisma.otherMeeting.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        date: r.date.toISOString().slice(0, 10),
        meetingType: r.meetingType,
        agenda: r.agenda ?? "",
        representativeFromAtari: r.representativeFromAtari ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "prevalent-diseases-crops") {
    const rows = await prisma.prevalentDiseaseCrop.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        diseaseName: r.diseaseName,
        crop: r.crop,
        outbreakDate: r.outbreakDate.toISOString().slice(0, 10),
        areaAffected: String(r.areaAffected),
        commodityLossPercent: String(r.commodityLossPercent),
        preventiveMeasures: r.preventiveMeasures ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "prevalent-diseases-livestock") {
    const rows = await prisma.prevalentDiseaseLivestock.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        diseaseName: r.diseaseName,
        speciesAffected: r.speciesAffected,
        outbreakDate: r.outbreakDate.toISOString().slice(0, 10),
        mortalityMorbidity: r.mortalityMorbidity ?? "",
        animalsVaccinated: String(r.animalsVaccinated),
        preventiveMeasures: r.preventiveMeasures ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "nyk-training") {
    const rows = await prisma.nykTraining.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        programmeTitle: r.programmeTitle,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        male: String(r.male),
        female: String(r.female),
        generalMale: String(r.generalMale),
        generalFemale: String(r.generalFemale),
        obcMale: String(r.obcMale),
        obcFemale: String(r.obcFemale),
        scMale: String(r.scMale),
        scFemale: String(r.scFemale),
        stMale: String(r.stMale),
        stFemale: String(r.stFemale),
        fundReceived: String(r.fundReceived),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "ppv-fra-training-programme") {
    const rows = await prisma.ppvFraTrainingProgramme.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => {
        const category = (r.farmersByCategory ?? {}) as Record<string, string>;
        return {
          id: r.id,
          kvk: r.kvk.name,
          date: r.date.toISOString().slice(0, 10),
          title: r.title,
          type: r.type ?? "",
          venue: r.venue ?? "",
          resourcePerson: r.resourcePerson ?? "",
          participants: String(r.participants),
          generalMale: category.generalMale ?? "",
          generalFemale: category.generalFemale ?? "",
          obcMale: category.obcMale ?? "",
          obcFemale: category.obcFemale ?? "",
          scMale: category.scMale ?? "",
          scFemale: category.scFemale ?? "",
          stMale: category.stMale ?? "",
          stFemale: category.stFemale ?? "",
        };
      }),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "ppv-fra-farmer-details") {
    const rows = await prisma.ppvFraFarmerDetail.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        year: String(r.year),
        crop: r.crop,
        registrationNo: r.registrationNo,
        farmerName: r.farmerName,
        block: r.block ?? "",
        district: r.district ?? "",
        mobileNo: r.mobileNo ?? "",
        village: r.village ?? "",
        characteristics: r.characteristics ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "rawe-fet-fit-programme") {
    const rows = await prisma.raweFetFitProgramme.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        kvk: r.kvk.name,
        attachmentType: r.attachmentType,
        attachment: r.attachment ?? "",
        numberOfStudents: String(r.numberOfStudents),
        daysStayed: String(r.daysStayed),
        male: String(r.male),
        female: String(r.female),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "vip-visitors") {
    const rows = await prisma.vipVisitor.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        visitDate: r.visitDate.toISOString().slice(0, 10),
        dignitaryType: r.dignitaryType,
        ministerName: r.ministerName,
        observations: r.observations ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "digital-mobile-app") {
    const rows = await prisma.digitalMobileApp.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        mobileAppsDeveloped: String(r.mobileAppsDeveloped),
        appName: r.appName ?? "",
        appLanguage: r.appLanguage ?? "",
        meantFor: r.meantFor ?? "",
        timesDownloaded: String(r.timesDownloaded),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "digital-web-portal") {
    const rows = await prisma.digitalWebPortal.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        visitors: String(r.visitors),
        farmersRegistered: String(r.farmersRegistered),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "digital-kisan-sarathi") {
    const rows = await prisma.digitalKisanSarathi.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        farmersRegisteredKsp: String(r.farmersRegisteredKsp),
        phoneCallAddressed: String(r.phoneCallAddressed),
        answeredCall: String(r.answeredCall),
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "digital-kmas") {
    const rows = await prisma.digitalKmas.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    const yn = (v: boolean) => (v ? "Yes" : "No");
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        farmersCovered: String(r.farmersCovered),
        advisoriesSent: String(r.advisoriesSent),
        messagesCrop: yn(r.messagesCrop),
        messagesLivestock: yn(r.messagesLivestock),
        messagesWeather: yn(r.messagesWeather),
        messagesMarketing: yn(r.messagesMarketing),
        messagesAwareness: yn(r.messagesAwareness),
        messagesOtherEnterprises: yn(r.messagesOtherEnterprises),
        messagesAnyOther: r.messagesAnyOther ?? "",
      })),
      totalCount: rows.length,
    };
  } else if (user && node.type === "leaf" && node.slug === "digital-other-channels") {
    const rows = await prisma.digitalOtherChannel.findMany({
      where: kvkScope,
      include: { kvk: true },
      orderBy: { createdAt: "desc" },
    });
    formData = {
      rows: rows.map((r) => ({
        id: r.id,
        kvk: r.kvk.name,
        textAdvisories: String(r.textAdvisories),
        textFarmers: String(r.textFarmers),
        whatsappAdvisories: String(r.whatsappAdvisories),
        whatsappFarmers: String(r.whatsappFarmers),
        socialMediaAdvisories: String(r.socialMediaAdvisories),
        socialMediaFarmers: String(r.socialMediaFarmers),
        weatherBulletinAdvisories: String(r.weatherBulletinAdvisories),
        weatherBulletinFarmers: String(r.weatherBulletinFarmers),
      })),
      totalCount: rows.length,
    };
  }

  /** Same flat inline-list card pattern as All Masters - confirmed against the reference for /forms/about-kvk and Projects. */
  let sectionedGroups: NavGroup[] | null = null;
  let sectionedBasePath = `/forms/${slug.join("/")}`;
  if (node.type === "group") {
    sectionedGroups = landingCards(node);
    if (sectionedGroups.length === 1 && sectionedGroups[0].slug === node.slug) {
      sectionedBasePath = `/forms/${slug.slice(0, -1).join("/")}`;
    }
  }

  return (
    <div>
      <AutoRefresh />
      <PageHeader
        backHref={listBackHref}
        trail={trailCrumbs}
        title={
          node.type === "group"
            ? "Form Management"
            : node.type === "leaf" && node.slug === "technical-achievement"
              ? (node.pageTitle ?? node.label)
              : undefined
        }
        icon={node.type === "group" ? FileText : undefined}
        description={
          node.type === "group"
            ? "Manage KVK forms, achievements, performance indicators, and miscellaneous data"
            : undefined
        }
      />
      {node.type === "group" && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-primary">{node.pageTitle ?? node.label}</h2>
          {node.description && (
            <p className="mt-1 text-sm text-muted-foreground">{node.description}</p>
          )}
        </div>
      )}
      {sectionedGroups ? (
        <SectionedMasterGrid
          groups={sectionedGroups}
          basePath={sectionedBasePath}
        />
      ) : node.type === "leaf" && node.slug === "technical-achievement" ? (
        /* The one Form Management leaf that is a matrix report rather than a list table. */
        <TechnicalAchievementSummaryPanel />
      ) : node.type === "leaf" ? (
        <EmptyDataTable
          title={node.pageTitle ?? node.label}
          icon="form-management"
          columns={node.columns}
          subtitle={`Manage and view all ${(node.pageTitle ?? node.label).toLowerCase()} in the system`}
          tabs={tabs}
          rows={formData?.rows}
          totalCount={formData?.totalCount}
          recordPath={slug.join("/")}
          // A Super Admin can't add a KVK-owned record (no KVK of their own -
          // /api/leaf-record needs the session's kvkId), and the real
          // reference shows no "Add" to a Super Admin on these leaves either.
          // "view-kvks" is the exception the other way round: it's a real
          // Super Admin create flow (its own /api/kvks route onboards a whole
          // new KVK into the system), but a KVK Admin has no business adding
          // a brand new KVK - they only ever view their own one row, so they
          // get the same "no Add" treatment every other leaf gives them
          // (client report, 2026-09-13: "Add New" showed on View KVK for a
          // KVK Admin, who should only see their own existing KVK info).
          hideAddNew={
            node.slug === "staff-transferred" ||
            node.slug === "staff-retired" ||
            (node.slug === "view-kvks" ? Boolean(user?.kvkId) : !user?.kvkId)
          }
          addNewHref={
            CUSTOM_FORM_SLUGS.has(node.slug)
              ? undefined
              : `/forms/${slug.join("/")}/add`
          }
          editHrefBase={
            CUSTOM_FORM_SLUGS.has(node.slug) ? undefined : `/forms/${slug.join("/")}`
          }
          customForm={EVENT_DEMOGRAPHIC_SLUGS.has(node.slug) ? "event-demographic" : undefined}
          eventSlug={node.slug}
          oftFldStatus={OFT_FLD_STATUS_SLUGS.has(node.slug)}
          /** OFT's list toolbar has a real "Reporting Year" filter (client-confirmed default-to-current-year); FLD's own reference toolbar does not have one at all (audit finding, 2026-09-02 - was silently hiding real non-current-year FLD data with no visible control explaining why). */
          reportingYearFilter={node.slug === "oft"}
          resultKind={node.slug === "view-fld" ? "fld" : node.slug === "oft" ? "oft" : undefined}
          staffTransferHistory={node.slug === "staff-transferred"}
          staffTransfer={node.slug === "employee-details"}
          staffRetire={node.slug === "employee-details"}
          autoRefresh={node.slug === "employee-details"}
          /* atariams.org /transfer-staff is a plain read-only table (no Add, no Action) - the records come only from Employee Details' Transfer action. */
          readOnly={node.slug === "staff-transferred" || node.slug === "staff-retired"}
          /** Exact wording from the client's "changes required 1.0.pdf" (2026-08-25, item 4) - each leaf's own note only, no cross-reference to the other leaf. CFLD Technical Parameter's own note is exact text confirmed against the real reference (atari-client.vercel.app, 2026-09-02). */
          note={
            node.slug === "oft"
              ? "Note- Please mark your result as Completed after adding the OFT details."
              : node.slug === "view-fld"
                ? "Note- Please mark your result as Completed after adding the FLD details."
                : node.slug === "technical-parameter"
                  ? "Note: Please mark your record as completed only after adding Technical + Economic + Socio-Economic + Farmers Perception details."
                  : undefined
          }
        />
      ) : null}
    </div>
  );
}
