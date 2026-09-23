import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { REPORT_FORM_LEAVES } from "@/lib/reports";
import { DEMOGRAPHIC_KEYS } from "@/lib/navigation";

export type RecordContext = { kvkId: string; zoneId: string };
/**
 * Update/delete run for a KVK Admin (own records only, `kvkId` set), a
 * Super Admin (any KVK's records - no `kvkId`, no `kvkIds` either), or a
 * Host Organisation session (`kvkIds` - every KVK mapped to its org, added
 * 2026-09-24 for the Host Organisation role; `kvkId` stays null for it,
 * `kvkIds` is the only new field, so a KVK Admin/Super Admin ctx - which
 * never sets `kvkIds` - behaves exactly as before).
 */
type ScopedContext = { kvkId: string | null; kvkIds?: string[]; zoneId: string };

type CreateFn = (values: Record<string, string>, ctx: RecordContext) => Promise<unknown>;

/**
 * Super Admin has no kvkId to scope by and is trusted to act on any KVK's
 * record - but only within their own zone (RBAC spec: "KVK A must never be
 * able to read KVK B's data" - the same strict multi-tenant boundary
 * applies one level up between zones, a Super Admin isn't global). Falling
 * back to `{}` here would have let a Super Admin delete/update a record
 * from a zone they don't manage, given only its id - real gap, fixed
 * before this went out. A KVK Admin's ctx.kvkId still constrains every
 * delete/update to its own rows, same as before.
 */
function kvkScope(ctx: ScopedContext) {
  return ctx.kvkId
    ? { kvkId: ctx.kvkId }
    : ctx.kvkIds
      ? { kvkId: { in: ctx.kvkIds } }
      : { zoneId: ctx.zoneId };
}

/** Same as kvkScope(), for StaffTransfer's own `fromKvkId` column (it has no flat `kvkId` - a transfer is between two KVKs). */
function fromKvkScope(ctx: ScopedContext) {
  return ctx.kvkId
    ? { fromKvkId: ctx.kvkId }
    : ctx.kvkIds
      ? { fromKvkId: { in: ctx.kvkIds } }
      : { fromKvk: { zoneId: ctx.zoneId } };
}

/** Coercion helpers - every AddLeafPage field arrives as a plain string, these turn it into what Prisma actually expects. */
const str = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
const reqStr = (v: string | undefined) => v?.trim() ?? "";
const int = (v: string | undefined) => (v?.trim() ? parseInt(v, 10) : undefined);
const reqInt = (v: string | undefined) => parseInt(v ?? "0", 10) || 0;
const dec = (v: string | undefined) => (v?.trim() ? Number(v) : undefined);
const reqDec = (v: string | undefined) => Number(v) || 0;
const date = (v: string | undefined) => (v?.trim() ? new Date(v) : undefined);
const reqDate = (v: string | undefined) => new Date(v ?? Date.now());
const bool = (v: string | undefined) => v?.trim().toLowerCase() === "yes" || v?.trim().toLowerCase() === "true";
/** Inclusive day count between two dates (e.g. 1st-3rd = 3 days stayed, not 2) - for a leaf whose real reference form has no separate "days stayed" input, just Start/End Date, with the duration shown read-only in the list table (e.g. RAWE/FET/FIT Programme). */
const daysBetween = (start: Date, end: Date) => Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

/** `sumOf`-backed "calculated" fields - never trusted from the client, same as every other calculated field's server-side recompute. undefined (not 0) when none of the source fields were entered, so a blank set doesn't store a spurious "0". */
function sum(v: Record<string, string>, keys: string[]) {
  if (!keys.some((k) => v[k]?.trim())) return undefined;
  return keys.reduce((total, k) => total + (dec(v[k]) ?? 0), 0);
}

/** `diffOf`-backed "calculated" fields (Budget Utilization's own per-item Balance = Received - Utilization, and Overall Balance = sum of all 4 items' Received - sum of all 4 items' Utilization, client direction, 2026-09-15) - never trusted from the client, same as every other calculated field's server-side recompute. undefined (not 0) when neither side had anything entered, so a blank pair doesn't store a spurious "0" balance. */
function diff(v: Record<string, string>, receivedKeys: string[], spentKeys: string[]) {
  const received = sum(v, receivedKeys);
  const spent = sum(v, spentKeys);
  if (received === undefined && spent === undefined) return undefined;
  return (received ?? 0) - (spent ?? 0);
}

/** `ratioOf`-backed "calculated" fields (CSISA's own BCR = Gross Return ÷ Cost of Cultivation, client direction, 2026-09-15) - never trusted from the client, same as every other calculated field's server-side recompute. undefined when the denominator is missing/0, so a blank/zero cost never stores a bogus divide-by-zero result. */
function ratio(v: Record<string, string>, numeratorKey: string, denominatorKey: string) {
  const denominator = dec(v[denominatorKey]);
  if (!denominator) return undefined;
  const numerator = dec(v[numeratorKey]) ?? 0;
  return numerator / denominator;
}

/** `fieldKind: "nf-parameters"` arrives as one JSON-stringified `{ [key]: { without, with } }` object (NfParametersField) - kept as a plain object for the Json column, `{}` when absent/malformed. */
function parseNfParameters(raw: string | undefined): Record<string, { without: string; with: string }> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** World Soil Day's own "No of VIP" - server-computed from the comma-separated Name(s) of VIP(s) list, since the real Edit form has no separate count input for it (audit finding, 2026-09-02). */
function countVips(vipNames: string | undefined): number {
  if (!vipNames?.trim()) return 0;
  return vipNames.split(",").map((v) => v.trim()).filter(Boolean).length;
}

/** FormPhotosField's own value shape - one JSON-stringified array where each entry carries its own `{ url, caption }`. */
function parseFormPhotos(raw: string | undefined): { url: string; caption: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is { url: string; caption: string } => typeof p?.url === "string" && p.url.trim().length > 0)
      .map((p) => ({ url: p.url, caption: typeof p.caption === "string" ? p.caption : "" }));
  } catch {
    return [];
  }
}

/**
 * Real source for Module Images (client PDF, "Module Image workflow",
 * 2026-09-02): a form's own end-of-form Photographs section, not the
 * separate standalone Add Images page. Called from a pilot leaf's own
 * create/update function right after the record itself is saved -
 * `formRecordId` ties each ModuleImage row back to that specific record so
 * a later edit can reconcile without touching another record's photos.
 * Update is a delete-then-recreate (simplest correct reconciliation given
 * the client always submits the full current photo list, not a diff).
 */
export async function syncModuleImages(
  raw: string | undefined,
  opts: {
    kvkId: string;
    zoneId: string;
    categoryPath: string;
    categoryLabel: string;
    reportingYear: number;
    activityDate: Date;
    formRecordId: string;
    /** Which photo section of the record this reconciles - "" (default) is the primary end-of-form Photographs; a form with more than one photo section (OFT Result, CFLD Technical Parameter) passes its own slot so its save never touches another section's rows. */
    slot?: string;
    uploadedById?: string;
  },
) {
  const slot = opts.slot ?? "";
  const photos = parseFormPhotos(raw);
  await prisma.moduleImage.deleteMany({ where: { formRecordId: opts.formRecordId, slot } });
  if (photos.length === 0) return;
  await prisma.moduleImage.createMany({
    data: photos.map((p) => ({
      kvkId: opts.kvkId,
      zoneId: opts.zoneId,
      categoryPath: opts.categoryPath,
      categoryLabel: opts.categoryLabel,
      reportingYear: opts.reportingYear,
      activityDate: opts.activityDate,
      caption: p.caption,
      imageUrl: p.url,
      published: true,
      uploadedById: opts.uploadedById,
      formRecordId: opts.formRecordId,
      slot,
    })),
  });
}

/** First real date found among a leaf form's common date-ish fields, else today - so a Module Image filed against a record inherits that record's own activity date / reporting year rather than "now". */
const LEAF_DATE_KEYS = [
  "activityDate", "date", "startDate", "reportingDate", "meetingDate",
  "dateOfVisit", "dateOfVisited", "programmeDate", "eventDate", "dateOfDemos",
  "trainingDate", "meetingDate", "observationDate",
];
function leafActivityDate(v: Record<string, string>): Date {
  for (const k of LEAF_DATE_KEYS) {
    const raw = v[k]?.trim();
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

/** path -> {label} for every Form Management leaf Reports knows about, so any leaf's saved photos can be filed under the right Module Images category without re-typing the list here. */
const LEAF_LABEL_BY_PATH = new Map(
  (REPORT_FORM_LEAVES as { path: string; label: string; groupLabel: string }[]).map((l) => [
    l.path,
    `${l.groupLabel} - ${l.label}`,
  ]),
);

/** The "<group> - <leaf>" Module Images category label for a Form Management leaf path - so the bespoke OFT-Result / CFLD forms file their photos under the same label a generic leaf would. */
export function leafCategoryLabel(path: string): string {
  return LEAF_LABEL_BY_PATH.get(path) ?? path;
}

/**
 * Generic Module-Images reconciliation for ANY Form Management leaf, called
 * by the leaf-record create/update API routes right after the record is
 * saved. Every generic leaf's Add/Edit form now carries the end-of-form
 * "Photographs (with caption)" section, and whatever the user attaches there
 * flows straight into Module Images -> Reports, keyed by `formRecordId` so a
 * later edit reconciles cleanly. A no-op when the leaf isn't one Reports
 * maps a category for, or when nothing was attached.
 */
export async function syncLeafModuleImages(
  path: string,
  rawModuleImages: string | undefined,
  opts: { kvkId: string; zoneId: string; formRecordId: string; values?: Record<string, string>; uploadedById?: string },
) {
  // Field absent from the submission (leaf has no Photographs section, or an
  // older client) - leave any existing images alone. `"[]"` is different: the
  // user opened the section and removed every photo, so that DOES reconcile.
  if (rawModuleImages === undefined) return;
  const label = LEAF_LABEL_BY_PATH.get(path);
  if (!label) return;
  const when = opts.values ? leafActivityDate(opts.values) : new Date();
  const reportingYear = Number(opts.values?.reportingYear) || when.getFullYear();
  await syncModuleImages(rawModuleImages, {
    kvkId: opts.kvkId,
    zoneId: opts.zoneId,
    categoryPath: path,
    categoryLabel: label,
    reportingYear,
    activityDate: when,
    formRecordId: opts.formRecordId,
    uploadedById: opts.uploadedById,
  });
}

const EMPLOYEE_DETAILS_PATH = "about-kvk/employee/employee-details";

/**
 * Employee Details' own "Photo" field (a single ID/passport-style image, not
 * the generic multi-photo Photographs section) never showed up in Module
 * Images - it only ever saved to Staff.photoUrl (client report, 2026-09-24).
 * Reuses syncModuleImages with its own "staff-photo" slot so it reconciles
 * independently of any other section a future Employee Details change might
 * add, and clears cleanly (empty array) when the photo is removed on edit.
 */
export async function syncStaffPhotoModuleImage(
  values: Record<string, string>,
  opts: { kvkId: string; zoneId: string; formRecordId: string; uploadedById?: string },
) {
  const photoUrl = values.photo?.trim();
  const staffName = (values.name ?? values.staffName ?? "").trim();
  const raw = photoUrl ? JSON.stringify([{ url: photoUrl, caption: staffName }]) : "[]";
  await syncModuleImages(raw, {
    kvkId: opts.kvkId,
    zoneId: opts.zoneId,
    categoryPath: EMPLOYEE_DETAILS_PATH,
    categoryLabel: leafCategoryLabel(EMPLOYEE_DETAILS_PATH),
    reportingYear: new Date().getFullYear(),
    activityDate: new Date(),
    formRecordId: opts.formRecordId,
    slot: "staff-photo",
    uploadedById: opts.uploadedById,
  });
}

/** OFT's "Details of technologies selected for assessment/refinement" rows arrive as one JSON-stringified array field (same convention as StaffTransfer's own historyJson) since this registry's values are otherwise flat strings. */
function parseTechnologyOptions(raw: string | undefined): { label: string; description: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is { label: string; description: string } => typeof t?.label === "string" && typeof t?.description === "string")
      .filter((t) => t.label.trim() && t.description.trim());
  } catch {
    return [];
  }
}

/** Assembles the General/OBC/SC/ST x Male/Female breakdown from the 8 flat AddLeafPage fields into the farmersByCategory JSON shape (same convention as CfldTechnicalParameter) - undefined when every value is blank, so a record with no demographic data entered doesn't store an empty object. */
function farmersByCategory(v: Record<string, string>) {
  if (!DEMOGRAPHIC_KEYS.some((k) => v[k]?.trim())) return undefined;
  return Object.fromEntries(DEMOGRAPHIC_KEYS.map((k) => [k, String(int(v[k]) ?? 0)]));
}

/** DRMR Activity Item/Activity dropdown label -> the stable `DrmrActivityItem.itemKey` report 3.10.B renders by. */
const DRMR_ITEM_KEY: Record<string, string> = {
  "Training (Capacity building /skill development etc)": "training",
  "Area under FLDs": "areaUnderFlds",
  "Awareness camps, exposure visit etc": "awarenessCamps",
  "Seeds (Field Crops)": "seeds",
  "Small equipments (Upto Rs.2000)": "smallEquipments",
  "Large equipments (more than Rs.2000)": "largeEquipments",
  "Fertilizers (NPK)/ Secondary/ Micro Fertilizers": "fertilizers",
  "Plant Protection chemicals": "ppChemicals",
  "Distribution of Literature": "distributionOfLiterature",
  "Kisan Mela": "kisanMela",
  "Any other (specify)": "anyOther",
};
function drmrItemData(v: Record<string, string>, zoneId: string) {
  const key = DRMR_ITEM_KEY[(v.itemActivity ?? "").trim()];
  if (!key) return null;
  return {
    zoneId,
    itemKey: key,
    nameSpecification: str(v.nameSpecification),
    unit: str(v.unit),
    quantity: dec(v.quantity),
    farmersByCategory: farmersByCategory(v),
  };
}

/** Parses MonthQuarterGridField's own JSON-string form value ({month: {quarter: "Yes"|"No"}}) into a real object for the Json column - undefined for a blank/empty grid so an untouched matrix doesn't store `{}`. */
function quarterlyCompletion(raw: string | undefined) {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Same 8 General/OBC/SC/ST x Male/Female keys, but as 8 discrete real int
 * columns (Training/ExtensionActivity/CelebrationDay's own shape) instead of
 * the farmersByCategory JSON blob above - matches DemographicBreakdown's
 * component convention directly. `prefix` supports a form with two
 * independent blocks (e.g. "farmers"/"officials" on ExtensionActivity and
 * CelebrationDay) reading from MasterFormFields' own prefixed keys.
 */
function demographicColumns(v: Record<string, string>, prefix = "") {
  return Object.fromEntries(
    DEMOGRAPHIC_KEYS.map((k) => {
      const key = prefix ? `${prefix}${k[0].toUpperCase()}${k.slice(1)}` : k;
      return [key, reqInt(v[key])];
    }),
  );
}

/** Sum across all 8 General/OBC/SC/ST x Male/Female breakdown keys - the stored value of a leaf's own farmers/participants count wherever the form has no separate input for it: either a leaf with no total field at all (e.g. PPV & FRA Training Programme's "No. of Participants"), or one whose count is auto-filled from the grid (navigation.ts BENEFICIARY_TOTAL). Always recomputed here, never read from the client. */
function demographicTotal(v: Record<string, string>, prefix = "") {
  return DEMOGRAPHIC_KEYS.reduce((sum, k) => {
    const key = prefix ? `${prefix}${k[0].toUpperCase()}${k.slice(1)}` : k;
    return sum + (int(v[key]) ?? 0);
  }, 0);
}

/** Sum of just the 4 Male (or Female) breakdown keys - for a leaf whose real reference table shows separate Male/Female totals rather than one grand total (e.g. NYK Training). */
function demographicSexTotal(v: Record<string, string>, sex: "Male" | "Female") {
  return ["general", "obc", "sc", "st"].reduce((sum, category) => sum + (int(v[`${category}${sex}`]) ?? 0), 0);
}

/** NARI models keep the General pair as `male`/`female`; the rest are the plain OBC/SC/ST x M/F ints. */
function nariCaste(v: Record<string, string>) {
  return {
    male: int(v.male) ?? 0, female: int(v.female) ?? 0,
    obcMale: int(v.obcMale) ?? 0, obcFemale: int(v.obcFemale) ?? 0,
    scMale: int(v.scMale) ?? 0, scFemale: int(v.scFemale) ?? 0,
    stMale: int(v.stMale) ?? 0, stFemale: int(v.stFemale) ?? 0,
  };
}

/**
 * One entry per Form Management leaf that uses the generic AddLeafPage
 * (columns -> plain-text fields). Keyed by the leaf's full nav path
 * ("achievements/oft") since several leaf slugs repeat across different
 * parents (e.g. "training" under NICRA vs. Achievements' own "trainings").
 * Leaves with a bespoke Add form (KVK Master, View KVKs, Employee Details,
 * CFLD Technical Parameter, event-demographic dialogs) are wired directly in
 * their own component instead of through this registry.
 */
export const LEAF_RECORD_REGISTRY: Record<string, CreateFn> = {
  // --- About KVK ---
  "about-kvk/basic/bank-account-details": (v, ctx) =>
    prisma.bankAccount.create({
      data: {
        ...ctx,
        accountType: reqStr(v.accountType),
        accountName: reqStr(v.accountName),
        bankName: reqStr(v.bankName),
        location: reqStr(v.location),
        accountNumber: reqStr(v.accountNumber),
      },
    }),
  "about-kvk/employee/staff-transferred": async (v, ctx) => {
    const staff = await prisma.staff.findFirst({ where: { kvkId: ctx.kvkId, name: reqStr(v.staffName) } });
    const fromKvk = await prisma.kvk.findFirst({ where: { zoneId: ctx.zoneId, name: reqStr(v.kvkNameBeforeTransfer) } });
    const toKvk = await prisma.kvk.findFirst({ where: { zoneId: ctx.zoneId, name: reqStr(v.latestKvkName) } });
    if (!staff || !fromKvk || !toKvk) throw new Error("Staff or KVK not found");
    return prisma.staffTransfer.create({
      data: { staffId: staff.id, fromKvkId: fromKvk.id, toKvkId: toKvk.id, zoneId: ctx.zoneId, transferDate: new Date() },
    });
  },
  "about-kvk/land-infrastructure/infrastructure-details": (v, ctx) =>
    prisma.infrastructure.create({
      data: {
        ...ctx,
        infrastructureName: reqStr(v.infraMasterName),
        notYetStarted: bool(v.notYetStarted),
        completedPlinthLevel: bool(v.completedPlinthLevel),
        completedLintelLevel: bool(v.completedLintelLevel),
        completedRoofLevel: bool(v.completedRoofLevel),
        totallyCompleted: bool(v.totallyCompleted),
        plinthAreaSqM: dec(v.plinthAreaSqM),
        underUse: bool(v.underUse),
        sourceOfFunding: str(v.sourceOfFunding),
        // fundingAgencyName has no form input (not on the reference) - the
        // column keeps its schema default and existing values are untouched.
      },
    }),
  "about-kvk/land-infrastructure/land-details": (v, ctx) =>
    prisma.land.create({ data: { ...ctx, item: reqStr(v.item), areaHa: reqDec(v.areaHa) } }),
  "about-kvk/land-infrastructure/staff-quarters": (v, ctx) =>
    prisma.staffQuarters.create({
      data: { ...ctx, numberOfQuarters: reqInt(v.noOfStaffQuarters), dateOfCompletion: date(v.dateOfCompletion), remark: str(v.remark) },
    }),
  "about-kvk/vehicles/view-vehicles": (v, ctx) =>
    prisma.vehicle.create({
      data: {
        ...ctx,
        vehicleType: str(v.vehicleType),
        name: reqStr(v.vehicleName),
        registrationNo: reqStr(v.registrationNo),
        yearOfPurchase: reqInt(v.yearOfPurchase),
        cost: reqDec(v.totalCost),
        totalRun: dec(v.totalRun),
        presentStatus: str(v.presentStatus),
        // Only carries a value while Present Status is "Repairing".
        repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
        sourceOfFunding: str(v.sourceOfFunding),
      },
    }),
  "about-kvk/vehicles/vehicle-details": async (v, ctx) => {
    const vehicle = await prisma.vehicle.findFirst({ where: { kvkId: ctx.kvkId, name: reqStr(v.vehicleName) } });
    if (!vehicle) throw new Error("Vehicle not found");
    const reportingYear = reqInt(v.reportingYear);
    const data = {
      totalRunKmHrs: dec(v.totalRunKms),
      presentStatus: str(v.presentStatus),
      fundingSource: str(v.fundingSource),
      repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
    };
    // One VehicleStatus per vehicle+year (@@unique). Picking a vehicle/year
    // that already has a row updates it - the Add form's carry-forward
    // prefills from that same row - instead of failing on the unique key.
    return prisma.vehicleStatus.upsert({
      where: { vehicleId_reportingYear: { vehicleId: vehicle.id, reportingYear } },
      create: { vehicleId: vehicle.id, zoneId: ctx.zoneId, reportingYear, ...data },
      update: data,
    });
  },
  "about-kvk/equipments/view-equipments": (v, ctx) =>
    prisma.equipment.create({
      data: {
        ...ctx,
        equipmentType: str(v.equipmentType),
        name: reqStr(v.equipmentName),
        yearOfPurchase: reqInt(v.yearOfPurchase),
        cost: reqDec(v.totalCost),
        presentStatus: str(v.presentStatus),
        // Only carries a value while Present Status is "Repairing".
        repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
        sourceOfFund: str(v.sourceOfFund),
      },
    }),
  "about-kvk/equipments/equipment-details": async (v, ctx) => {
    const equipment = await prisma.equipment.findFirst({ where: { kvkId: ctx.kvkId, name: reqStr(v.equipmentName) } });
    if (!equipment) throw new Error("Equipment not found");
    const reportingYear = reqInt(v.reportingYear);
    const data = {
      presentStatus: str(v.presentStatus),
      repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
    };
    // One EquipmentStatus per equipment+year (@@unique) - see vehicle-details.
    return prisma.equipmentStatus.upsert({
      where: { equipmentId_reportingYear: { equipmentId: equipment.id, reportingYear } },
      create: { equipmentId: equipment.id, zoneId: ctx.zoneId, reportingYear, ...data },
      update: data,
    });
  },
  "about-kvk/employee/employee-details": (v, ctx) => {
    const resumeUrl = str(v.resume);
    return prisma.staff.create({
      data: {
        ...ctx,
        sanctionedPost: reqStr(v.sanctionedPost),
        name: reqStr(v.name ?? v.staffName),
        position: str(v.position),
        mobile: str(v.mobile),
        email: str(v.email),
        payBand: str(v.payBand),
        payScale: str(v.payScale),
        discipline: str(v.discipline),
        dateOfBirth: date(v.dateOfBirth),
        dateOfJoining: date(v.dateOfJoining),
        jobType: str(v.jobType),
        allowances: str(v.allowances),
        category: str(v.casteCategory ?? v.category),
        photoUrl: str(v.photo),
        resumeUrl,
      },
    });
  },

  // --- Achievements ---
  "achievements/oft": async (v, ctx) => {
    const oft = await prisma.oft.create({
      data: {
        ...ctx,
        reportingYear: reqInt(v.reportingYear),
        season: str(v.season),
        oftSubject: str(v.oftSubject),
        discipline: reqStr(v.discipline),
        staff: reqStr(v.staff),
        thematicArea: reqStr(v.thematicArea),
        trialOnForm: reqStr(v.trialOnForm),
        problemDiagnosed: str(v.problemDiagnosed),
        sourceOfTechnology: str(v.sourceOfTechnology),
        sourceOfFunding: str(v.sourceOfFunding),
        productionSystem: str(v.productionSystem),
        performanceIndicators: str(v.performanceIndicators),
        finalRecommendation: str(v.finalRecommendation),
        constraintsIdentified: str(v.constraintsIdentified),
        farmersParticipationProcess: str(v.farmersParticipationProcess),
        quantity: dec(v.quantity),
        unit: str(v.unit),
        noOfLocation: int(v.noOfLocation),
        noOfTrialReplicationFarmer: int(v.noOfTrialReplicationFarmer),
        startMonth: date(v.startMonth),
        endMonth: date(v.endMonth),
        criticalInput: str(v.criticalInput),
        costOfOft: dec(v.costOfOft),
        fundingAgency: str(v.fundingAgency),
        status: v.status?.toLowerCase().includes("complet") ? "COMPLETED" : "ONGOING",
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    });
    const technologyOptions = parseTechnologyOptions(v.technologyOptions);
    if (technologyOptions.length > 0) {
      await prisma.oftTechnologyOption.createMany({
        data: technologyOptions.map((t) => ({ oftId: oft.id, zoneId: ctx.zoneId, label: t.label, description: t.description })),
      });
    }
    await syncModuleImages(v.moduleImages, {
      ...ctx,
      categoryPath: "achievements/oft",
      categoryLabel: "Achievements - OFT",
      reportingYear: oft.reportingYear,
      activityDate: oft.startMonth ?? new Date(),
      formRecordId: oft.id,
    });
    return oft;
  },
  "achievements/front-line-demonstration/view-fld": async (v, ctx) => {
    const fld = await prisma.fld.create({
      data: {
        ...ctx,
        reportingYear: reqInt(v.reportingYear),
        startDate: date(v.startDate),
        endDate: date(v.endDate),
        staff: str(v.staff),
        season: str(v.season),
        sector: str(v.sector),
        thematicArea: str(v.thematicArea),
        category: reqStr(v.category),
        subCategory: reqStr(v.subCategory),
        cropAnimalEnterprise: str(v.cropAnimalEnterprise),
        technologyDemonstrated: reqStr(v.technologyDemonstrated),
        noOfDemonstration: int(v.noOfDemonstration),
        unit: str(v.unit),
        quantity: dec(v.quantity),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
        status: v.status?.toLowerCase().includes("complet") ? "COMPLETED" : "ONGOING",
      },
    });
    await syncModuleImages(v.moduleImages, {
      ...ctx,
      categoryPath: "achievements/front-line-demonstration/view-fld",
      categoryLabel: "Achievements - Front Line Demonstrations (FLD)",
      reportingYear: fld.reportingYear,
      activityDate: fld.startDate ?? new Date(),
      formRecordId: fld.id,
    });
    return fld;
  },
  "achievements/front-line-demonstration/fld-extension-training": async (v, ctx) => {
    const fld = await prisma.fld.findFirst({ where: { kvkId: ctx.kvkId, technologyDemonstrated: reqStr(v.fldName) } });
    if (!fld) throw new Error("FLD not found");
    const participantCountMale = reqInt(v.participantCountMale);
    const participantCountFemale = reqInt(v.participantCountFemale);
    return prisma.fldExtensionTraining.create({
      data: { fldId: fld.id, zoneId: ctx.zoneId, activity: reqStr(v.activity), date: reqDate(v.date), activityCount: reqInt(v.activityCount), participantCountMale, participantCountFemale, participantCount: participantCountMale + participantCountFemale, remark: str(v.remark) },
    });
  },
  "achievements/front-line-demonstration/fld-technical-feedback": async (v, ctx) => {
    const fld = await prisma.fld.findFirst({ where: { kvkId: ctx.kvkId, technologyDemonstrated: reqStr(v.fld) } });
    if (!fld) throw new Error("FLD not found");
    return prisma.fldTechnicalFeedback.create({
      data: { fldId: fld.id, zoneId: ctx.zoneId, crop: reqStr(v.crop), feedback: reqStr(v.feedback) },
    });
  },
  "achievements/trainings": async (v, ctx) => {
    const training = await prisma.training.create({
      data: {
        ...ctx,
        /** Server-computed, never trusted from the client - the real Edit form has no Reporting Year input at all (audit finding, 2026-09-02). */
        reportingYear: (date(v.startDate) ?? new Date()).getFullYear(),
        startDate: date(v.startDate), endDate: date(v.endDate),
        title: reqStr(v.title), venue: str(v.venue),
        trainingDiscipline: str(v.trainingDiscipline), thematicArea: str(v.thematicArea), clientele: str(v.clientele),
        trainingType: str(v.trainingType), trainingArea: str(v.trainingArea), onCampusOffCampus: str(v.onCampusOffCampus),
        courseCoordinator: str(v.courseCoordinator), fundingSource: str(v.fundingSource), fundingAgencyName: str(v.fundingAgencyName),
        ...demographicColumns(v),
      },
    });
    await syncModuleImages(v.moduleImages, {
      ...ctx,
      categoryPath: "achievements/trainings",
      categoryLabel: "Achievements - Trainings",
      reportingYear: training.reportingYear,
      activityDate: training.startDate ?? new Date(),
      formRecordId: training.id,
    });
    return training;
  },
  "achievements/extension/extension-activities": async (v, ctx) => {
    const farmers = demographicColumns(v, "farmers");
    const officials = demographicColumns(v, "officials");
    const activity = await prisma.extensionActivity.create({
      data: {
        ...ctx,
        /** Server-computed, never trusted from the client - the real Edit form has no Reporting Year/No. of Participants input at all (audit finding, 2026-09-02). Reporting Year comes from Start Date's own year; No. of Participants from the Farmers+Officials totals below. */
        reportingYear: (date(v.startDate) ?? new Date()).getFullYear(),
        startDate: date(v.startDate), endDate: date(v.endDate),
        natureOfExtensionActivity: reqStr(v.natureOfExtensionActivity), noOfActivities: reqInt(v.noOfActivities),
        noOfParticipants: Object.values({ ...farmers, ...officials }).reduce((sum, n) => sum + n, 0),
        staff: str(v.staff),
        ...farmers,
        ...officials,
      },
    });
    await syncModuleImages(v.moduleImages, {
      ...ctx,
      categoryPath: "achievements/extension/extension-activities",
      categoryLabel: "Achievements - Extension Activities",
      reportingYear: activity.reportingYear,
      activityDate: activity.startDate ?? new Date(),
      formRecordId: activity.id,
    });
    return activity;
  },
  "achievements/extension/other-extension-activities": (v, ctx) =>
    prisma.otherExtensionActivity.create({
      data: {
        ...ctx,
        /** Server-computed, never trusted from the client - the real Edit form has no Reporting Year input at all (audit finding, 2026-09-02). */
        reportingYear: (date(v.startDate) ?? new Date()).getFullYear(),
        natureOfExtensionActivity: reqStr(v.natureOfExtensionActivity), noOfActivities: reqInt(v.noOfActivities),
        staff: str(v.staff), startDate: date(v.startDate), endDate: date(v.endDate),
      },
    }),
  "achievements/special-days/celebration-days": (v, ctx) =>
    prisma.celebrationDay.create({
      data: {
        ...ctx,
        importantDay: reqStr(v.importantDay), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), noOfActivities: reqInt(v.noOfActivities),
        ...demographicColumns(v, "farmers"),
        ...demographicColumns(v, "officials"),
        ...demographicColumns(v, "vip"),
        vipNameDesignationAddress: str(v.vipNameDesignationAddress),
      },
    }),
  /** Moved from the standalone EventDemographicDialog popup to the generic full-page Add/Edit flow (client direction, 2026-09-02: keep it consistent with every other leaf's real full-page pattern, matching the reference). Mirrors app/api/event-demographic/route.ts's own former POST logic - numberOfParticipants stays server-computed from the real breakdown, never trusted from the client. */
  "achievements/special-days/technology-week-celebration": (v, ctx) => {
    const demographics = demographicColumns(v);
    return prisma.technologyWeekCelebration.create({
      data: {
        ...ctx,
        startDate: reqDate(v.startDate), endDate: reqDate(v.endDate),
        typeOfActivities: reqStr(v.typeOfActivities), noOfActivities: reqInt(v.noOfActivities),
        relatedCropTechnology: str(v.relatedCropTechnology),
        numberOfParticipants: Object.values(demographics).reduce((sum, n) => sum + n, 0),
        ...demographics,
      },
    });
  },
  "achievements/special-days/world-soil-day": (v, ctx) =>
    prisma.worldSoilDay.create({
      data: {
        ...ctx,
        reportingYear: int(v.reportingYear),
        noOfActivitiesConducted: reqInt(v.noOfActivitiesConducted),
        soilHealthCardsDistributed: reqInt(v.soilHealthCardsDistributed),
        noOfVip: countVips(v.vipNames),
        vipNames: str(v.vipNames),
        totalParticipants: demographicTotal(v),
        ...demographicColumns(v),
      },
    }),
  "achievements/swachhta-bharat-abhiyaan/sewa": (v, ctx) =>
    prisma.swachhtaObservance.create({
      data: { ...ctx, kind: "SEWA", fromDate: reqDate(v.fromDate), toDate: reqDate(v.toDate), totalNoOfActivitiesUndertaken: reqInt(v.totalNoOfActivitiesUndertaken), noOfStaffs: reqInt(v.noOfStaffs), noOfFarmers: reqInt(v.noOfFarmers), noOfOthers: reqInt(v.noOfOthers) },
    }),
  "achievements/swachhta-bharat-abhiyaan/pakhwada": (v, ctx) =>
    prisma.swachhtaObservance.create({
      data: { ...ctx, kind: "PAKHWADA", fromDate: reqDate(v.fromDate), toDate: reqDate(v.toDate), totalNoOfActivitiesUndertaken: reqInt(v.totalNoOfActivitiesUndertaken), noOfStaffs: reqInt(v.noOfStaffs), noOfFarmers: reqInt(v.noOfFarmers), noOfOthers: reqInt(v.noOfOthers) },
    }),
  "achievements/swachhta-bharat-abhiyaan/budget-expenditure": (v, ctx) =>
    prisma.swachhtaBudgetExpenditure.create({
      data: {
        ...ctx,
        reportingYear: reqInt(v.reportingYear),
        vermicompostingVillagesCovered: reqInt(v.vermicompostingVillagesCovered),
        vermicompostingTotalExpenditure: reqDec(v.vermicompostingTotalExpenditure),
        otherVillagesCovered: int(v.otherVillagesCovered),
        otherTotalExpenditure: dec(v.otherTotalExpenditure),
      },
    }),
  "achievements/special-days/poshan-maaha": (v, ctx) => {
    const participants = {
      participantsGirls: reqInt(v.participantsGirls),
      participantsPublicRepresentatives: reqInt(v.participantsPublicRepresentatives),
      participantsFarmWoman: reqInt(v.participantsFarmWoman),
      participantsFarmers: reqInt(v.participantsFarmers),
      participantsAganwadiWorkers: reqInt(v.participantsAganwadiWorkers),
      participantsGovtOfficials: reqInt(v.participantsGovtOfficials),
    };
    return prisma.poshanMaaha.create({
      data: {
        ...ctx,
        activityDate: reqDate(v.activityDate),
        activitiesConducted: reqStr(v.activitiesConducted),
        eventName: reqStr(v.eventName),
        saplingsPlanted: reqInt(v.saplingsPlanted),
        vegetableKits: reqInt(v.vegetableKits),
        ...participants,
        /** Real field is a disabled, auto-calculated readout, never a real user input - see the matching navigation.ts comment. */
        totalParticipants: Object.values(participants).reduce((sum, n) => sum + n, 0),
      },
    });
  },
  "achievements/production-supply": (v, ctx) =>
    prisma.technologyProductProduction.create({
      data: {
        ...ctx,
        reportingDate: date(v.reportingDate),
        /** Server-computed, never trusted from the client - same precedent as Trainings/Extension Activities' own Reporting Year. */
        reportingYear: (date(v.reportingDate) ?? new Date()).getFullYear(),
        productCategory: str(v.productCategory),
        productType: str(v.productType),
        product: str(v.product),
        variety: reqStr(v.variety),
        unit: str(v.unit),
        quantity: reqDec(v.quantity),
        value: dec(v.value),
        quantitySupplied: dec(v.quantitySupplied),
        supplyValue: dec(v.supplyValue),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    }),
  "achievements/soil-water/soil-testing-equipment": (v, ctx) =>
    prisma.soilTestingEquipment.create({
      data: {
        ...ctx,
        reportingYear: int(v.reportingYear),
        analysis: reqStr(v.analysis),
        equipmentName: reqStr(v.equipmentName),
        quantity: reqInt(v.quantity),
      },
    }),
  "achievements/soil-water/soil-water-testing": (v, ctx) =>
    prisma.soilWaterPlantAnalysis.create({
      data: {
        ...ctx,
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        analysis: reqStr(v.analysis),
        samplesAnalyzedThrough: str(v.samplesAnalyzedThrough),
        noOfSamplesAnalyzed: reqInt(v.noOfSamplesAnalyzed),
        noOfVillagesCovered: reqInt(v.noOfVillagesCovered),
        amountRealized: reqDec(v.amountRealized),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    }),
  "achievements/publications": (v, ctx) =>
    prisma.publication.create({
      data: {
        ...ctx, reportingDate: date(v.reportingDate), itemName: reqStr(v.itemName), title: reqStr(v.title),
        authorName: reqStr(v.authorName), journalName: str(v.journalName),
        publisherName: str(v.publisherName), isbnNumber: str(v.isbnNumber), pageNumber: str(v.pageNumber), naasRating: str(v.naasRating),
      },
    }),
  "achievements/hrd": (v, ctx) =>
    prisma.humanResourceDevelopment.create({
      data: { ...ctx, staff: reqStr(v.staff), course: reqStr(v.course), startDate: date(v.startDate), endDate: date(v.endDate), venue: str(v.venue), organizer: str(v.organizer) },
    }),
  "achievements/awards/kvk": (v, ctx) =>
    prisma.kvkAward.create({
      data: { ...ctx, reportingDate: date(v.reportingDate), award: reqStr(v.award), amount: reqDec(v.amount), achievement: str(v.achievement), conferringAuthority: str(v.conferringAuthority) },
    }),
  "achievements/awards/scientist": (v, ctx) =>
    prisma.scientistAward.create({
      data: { ...ctx, reportingDate: date(v.reportingDate), headScientist: reqStr(v.headScientist), award: reqStr(v.award), amount: reqDec(v.amount), achievement: str(v.achievement), conferringAuthority: str(v.conferringAuthority) },
    }),
  "achievements/awards/farmer": (v, ctx) =>
    prisma.farmerAward.create({
      data: { ...ctx, reportingDate: date(v.reportingDate), farmerName: reqStr(v.farmerName), address: str(v.address), contactNumber: str(v.contactNumber), award: reqStr(v.award), amount: reqDec(v.amount), achievement: str(v.achievement), conferringAuthority: str(v.conferringAuthority) },
    }),

  // --- Projects ---
  "projects/cfld/extension-activity-cfld": (v, ctx) =>
    prisma.cfldExtensionActivity.create({
      data: {
        ...ctx,
        season: reqStr(v.season),
        activityName: reqStr(v.activityName),
        activitiesOrganized: reqInt(v.activitiesOrganized),
        date: reqDate(v.date),
        placeOfActivity: reqStr(v.placeOfActivity),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    }),
  "projects/cfld/budget-utilization": (v, ctx) => {
    const receivedKeys = ["criticalInputReceived", "extensionReceived", "publicationReceived", "taDaReceived"];
    const utilizationKeys = ["criticalInputUtilization", "extensionUtilization", "publicationUtilization", "taDaUtilization"];
    return prisma.cfldBudgetUtilization.create({
      data: { ...ctx, crop: reqStr(v.crop), season: reqStr(v.season), overallFundAllocation: reqDec(v.overallFundAllocation), areaAllotedHa: dec(v.areaAllotedHa), areaAchievedHa: dec(v.areaAchievedHa), criticalInputReceived: dec(v.criticalInputReceived), criticalInputUtilization: dec(v.criticalInputUtilization), criticalInputBalance: diff(v, ["criticalInputReceived"], ["criticalInputUtilization"]), extensionReceived: dec(v.extensionReceived), extensionUtilization: dec(v.extensionUtilization), extensionBalance: diff(v, ["extensionReceived"], ["extensionUtilization"]), publicationReceived: dec(v.publicationReceived), publicationUtilization: dec(v.publicationUtilization), publicationBalance: diff(v, ["publicationReceived"], ["publicationUtilization"]), taDaReceived: dec(v.taDaReceived), taDaUtilization: dec(v.taDaUtilization), taDaBalance: diff(v, ["taDaReceived"], ["taDaUtilization"]), overallFundReceived: sum(v, receivedKeys), overallFundUtilized: sum(v, utilizationKeys), overallBalance: diff(v, receivedKeys, utilizationKeys) },
    });
  },
  "projects/cfld/crop-wise-images": (v, ctx) => {
    const imageUrl = reqStr(v.image);
    if (!imageUrl) throw new Error("An image is required.");
    return prisma.cfldCropWiseImage.create({ data: { ...ctx, crop: reqStr(v.crop), imageUrl } });
  },
  "projects/nicra/basic-information": (v, ctx) =>
    prisma.nicraBasicInformation.create({
      data: {
        ...ctx,
        rfDistrictNormal: dec(v.rfDistrictNormal), rfDistrictReceived: dec(v.rfDistrictReceived),
        maxTemperature: dec(v.maxTemperature), minTemperature: dec(v.minTemperature),
        drySpell10Days: int(v.drySpell10Days), drySpell15Days: int(v.drySpell15Days), drySpell20Days: int(v.drySpell20Days),
        nicraAdoptedVillages: int(v.nicraAdoptedVillages),
        floodIntensiveRainMm: dec(v.floodIntensiveRainMm), floodWaterDepthCm: dec(v.floodWaterDepthCm), floodDurationDays: int(v.floodDurationDays),
        reportingDate: date(v.reportingDate), startDate: date(v.startDate), endDate: date(v.endDate),
      },
    }),
  "projects/nicra/details": (v, ctx) =>
    prisma.nicraDetails.create({
      data: {
        ...ctx,
        cropName: reqStr(v.cropName), seasonName: reqStr(v.seasonName),
        technologyDemonstration: reqStr(v.technologyDemonstration), noOfFarmers: demographicTotal(v),
        category: str(v.category), subCategory: str(v.subCategory), areaOrUnit: dec(v.areaOrUnit), netReturn: dec(v.netReturn),
        month: str(v.month), yield: dec(v.yield), grossCost: dec(v.grossCost), grossReturn: dec(v.grossReturn), bcr: dec(v.bcr),
        ...demographicColumns(v),
      },
    }),
  "projects/nicra/training": (v, ctx) =>
    prisma.nicraTraining.create({
      data: { ...ctx, title: reqStr(v.title), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), farmersAttended: demographicTotal(v), duration: str(v.duration), trainingType: str(v.trainingType), ...demographicColumns(v) },
    }),
  "projects/nicra/extension-activity-nicra": (v, ctx) =>
    prisma.nicraExtensionActivity.create({
      data: { ...ctx, activityName: reqStr(v.activityName), places: reqStr(v.places), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), farmersAttended: demographicTotal(v), ...demographicColumns(v) },
    }),
  "projects/nicra/others/intervention": (v, ctx) =>
    prisma.nicraIntervention.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), seedBankFodderBank: reqStr(v.seedBankFodderBank), crop: reqStr(v.crop), variety: reqStr(v.variety), quantityQuintal: reqDec(v.quantity) },
    }),
  "projects/nicra/others/revenue-generated": (v, ctx) =>
    prisma.nicraRevenueGenerated.create({
      data: { ...ctx, year: reqInt(v.year), revenue: reqDec(v.revenue), total: reqDec(v.total) },
    }),
  "projects/nicra/others/custom-hiring-farm-implement": (v, ctx) =>
    prisma.nicraCustomHiringFarmImplement.create({
      data: { ...ctx, farmImplementName: reqStr(v.farmImplementName), farmersUsed: demographicTotal(v), areaCovered: reqDec(v.areaCovered), hoursUsed: reqDec(v.hoursUsed), revenueGenerated: reqDec(v.revenueGenerated), repairExpenditure: reqDec(v.repairExpenditure), ...demographicColumns(v) },
    }),
  "projects/nicra/others/village-wise-vcrmc": (v, ctx) =>
    prisma.nicraVillageWiseVcrmc.create({
      data: { ...ctx, villageName: reqStr(v.villageName), constitutionDate: date(v.constitutionDate), members: reqInt(v.members), meetingsOrganized: reqInt(v.meetingsOrganized), meetingDate: date(v.meetingDate), secretaryName: str(v.secretaryName), membersMale: int(v.membersMale), membersFemale: int(v.membersFemale), presidentName: str(v.presidentName), majorDecision: str(v.majorDecision) },
    }),
  "projects/nicra/others/soil-health-card": (v, ctx) =>
    prisma.nicraSoilHealthCard.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), samplesCollected: reqInt(v.samplesCollected), samplesAnalysed: reqInt(v.samplesAnalysed), shcIssued: reqInt(v.shcIssued), farmersBenefitted: demographicTotal(v), ...demographicColumns(v) },
    }),
  "projects/nicra/others/convergence-programme": (v, ctx) =>
    prisma.nicraConvergenceProgramme.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), scheme: reqStr(v.scheme), natureOfWork: reqStr(v.natureOfWork), amount: reqDec(v.amount) },
    }),
  "projects/nicra/others/dignitaries-visited-nicra-villages": (v, ctx) =>
    prisma.nicraDignitaryVisit.create({
      data: { ...ctx, vipExperts: reqStr(v.vipExperts), name: reqStr(v.name), dateOfVisit: reqDate(v.dateOfVisit), remark: str(v.remark) },
    }),
  "projects/nicra/others/pi-co-pi-list": (v, ctx) =>
    prisma.nicraPiCoPi.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), piCoPi: reqStr(v.piCoPi), name: reqStr(v.name) },
    }),
  "projects/arya-safal/arya-safal-current-year": (v, ctx) =>
    prisma.aryaCurrentYearDetail.create({
      data: {
        ...ctx, enterprise: reqStr(v.enterprise), viableUnits: reqInt(v.viableUnits), closedUnits: reqInt(v.closedUnits),
        startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), groupsFormed: reqInt(v.groupsFormed), groupsActive: reqInt(v.groupsActive),
        trainingsConducted: int(v.trainingsConducted), unitsEstablished: int(v.unitsEstablished),
        ruralYouthMale: int(v.ruralYouthMale), ruralYouthFemale: int(v.ruralYouthFemale),
        avgUnitSize: dec(v.avgUnitSize), productionPerUnit: dec(v.productionPerUnit), costPerUnit: dec(v.costPerUnit),
        saleValue: dec(v.saleValue), economicGainsPerUnit: dec(v.economicGainsPerUnit),
        employmentMandaysMale: int(v.employmentMandaysMale), employmentMandaysFemale: int(v.employmentMandaysFemale),
      },
    }),
  "projects/arya-safal/arya-safal-previous-year": (v, ctx) =>
    prisma.aryaPreviousYearEvaluation.create({
      data: {
        ...ctx, enterprise: reqStr(v.enterprise), totalClosed: reqInt(v.totalClosed), closingDate: date(v.closingDate),
        totalRestarted: reqInt(v.totalRestarted), restartedDate: date(v.restartedDate),
        unitsEstablishedProgressive: int(v.unitsEstablishedProgressive),
        sizeMale: int(v.sizeMale), sizeFemale: int(v.sizeFemale), sizeNoOfUnit: int(v.sizeNoOfUnit), sizeUnitCapacity: dec(v.sizeUnitCapacity),
        costFixed: dec(v.costFixed), costVariable: dec(v.costVariable),
        totalProductionPerUnitYear: dec(v.totalProductionPerUnitYear), grossCostPerUnitYear: dec(v.grossCostPerUnitYear),
        grossReturnPerUnitYear: dec(v.grossReturnPerUnitYear), netBenefitPerUnitYear: dec(v.netBenefitPerUnitYear),
        employmentFamily: int(v.employmentFamily), employmentOtherThanFamily: int(v.employmentOtherThanFamily), personsVisited: int(v.personsVisited),
      },
    }),
  "projects/arya-safal/arya-team": (v, ctx) =>
    prisma.aryaProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/natural-farming/nf-geographical": (v, ctx) =>
    prisma.nfGeographicalInfo.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), agroClimaticZone: reqStr(v.agroClimaticZone), farmingSituation: reqStr(v.farmingSituation), latitude: reqDec(v.latitude), longitude: reqDec(v.longitude) },
    }),
  "projects/natural-farming/nf-physical": (v, ctx) =>
    prisma.nfPhysicalInfo.create({
      data: {
        ...ctx, activityName: reqStr(v.activityName), trainingTitle: reqStr(v.trainingTitle),
        trainingDate: reqDate(v.trainingDate), venue: reqStr(v.venue), participants: demographicTotal(v),
        ...demographicColumns(v), remarks: str(v.remarks),
      },
    }),
  "projects/natural-farming/nf-demonstration": (v, ctx) =>
    prisma.nfDemonstrationInfo.create({
      data: {
        ...ctx,
        farmerName: reqStr(v.farmerName),
        activityName: reqStr(v.activityName),
        crop: reqStr(v.crop),
        variety: reqStr(v.variety),
        farmerAddress: str(v.farmerAddress),
        farmerContact: str(v.farmerContact),
        agroClimaticZone: str(v.agroClimaticZone),
        croppingPattern: str(v.croppingPattern),
        farmingSituation: str(v.farmingSituation),
        latitude: dec(v.latitude),
        longitude: dec(v.longitude),
        season: str(v.season),
        technologyDemonstrated: str(v.technologyDemonstrated),
        areaHa: dec(v.areaHa),
        farmerPracticeDetail: str(v.farmerPracticeDetail),
        farmerFeedback: str(v.farmerFeedback),
        parameters: parseNfParameters(v.parameters),
      },
    }),
  "projects/natural-farming/nf-already-practicing": (v, ctx) =>
    prisma.nfAlreadyPracticing.create({
      data: {
        ...ctx,
        farmerName: reqStr(v.farmerName),
        address: str(v.address),
        normalCropsGrown: str(v.normalCropsGrown),
        practicingYear: reqInt(v.practicingYear),
        contactNumber: str(v.contactNumber),
        activityName: str(v.activityName),
        crop: str(v.crop),
        technologyDemonstrated: str(v.technologyDemonstrated),
        areaHa: dec(v.areaHa),
        farmerFeedback: str(v.farmerFeedback),
        parameters: parseNfParameters(v.parameters),
      },
    }),
  "projects/natural-farming/nf-beneficiaries": (v, ctx) =>
    prisma.nfBeneficiary.create({
      data: {
        ...ctx, numberOfBlock: reqInt(v.numberOfBlock), numberOfVillage: reqInt(v.numberOfVillage),
        numberOfTraining: reqInt(v.numberOfTraining), farmersInfluenced: reqInt(v.farmersInfluenced),
        reportingYear: int(v.reportingYear), farmersEngagedAllSeason: int(v.farmersEngagedAllSeason),
        farmersEngagedOneSeason: int(v.farmersEngagedOneSeason), remarks: str(v.remarks),
      },
    }),
  "projects/natural-farming/nf-soil-data": (v, ctx) =>
    prisma.nfSoilData.create({
      data: {
        ...ctx, season: reqStr(v.season), type: reqStr(v.type), crop: reqStr(v.crop),
        beforePh: reqDec(v.beforePh), beforeEc: reqDec(v.beforeEc), beforeEcOc: reqDec(v.beforeEcOc),
        beforeN: dec(v.beforeN), beforeP: dec(v.beforeP), beforeK: dec(v.beforeK), beforeMicrobes: dec(v.beforeMicrobes),
        afterPh: reqDec(v.afterPh), afterEc: reqDec(v.afterEc), afterEcOc: reqDec(v.afterEcOc),
        afterN: dec(v.afterN), afterP: dec(v.afterP), afterK: dec(v.afterK), afterMicrobes: dec(v.afterMicrobes),
      },
    }),
  "projects/natural-farming/nf-budget-expenditure": (v, ctx) =>
    prisma.nfBudgetExpenditure.create({
      data: { ...ctx, activityName: reqStr(v.activityName), activitiesOrganised: reqInt(v.activitiesOrganised), budgetSanction: reqDec(v.budgetSanction), budgetExpenditure: reqDec(v.budgetExpenditure), totalBudgetExpenditure: reqDec(v.totalBudgetExpenditure), balance: diff(v, ["budgetSanction"], ["budgetExpenditure"]) },
    }),
  "projects/natural-farming/nf-team": (v, ctx) =>
    prisma.nfProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/tsp-scsp/view-sub-plan-activity": (v, ctx) =>
    prisma.subPlanActivity.create({
      data: { ...ctx, type: v.type?.toUpperCase() === "SCSP" ? "SCSP" : "TSP", activities: reqStr(v.activities), noOfTraining: reqInt(v.noOfTraining), beneficiaries: reqInt(v.beneficiaries), fundReceivedLakh: dec(v.fundReceivedLakh), physicalOutcomeNote: str(v.physicalOutcomeNote) },
    }),
  "projects/tsp-scsp/tsp-scsp-team": (v, ctx) =>
    prisma.tspScspProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/nari/nari-nutrition-garden": (v, ctx) =>
    prisma.nariNutritionGarden.create({
      data: { ...ctx, nutriSmartVillage: reqStr(v.nutriSmartVillage), typeOfNutritionalGarden: reqStr(v.typeOfNutritionalGarden), numbers: reqInt(v.numbers), areaSqm: reqDec(v.areaSqm), activity: v.activity ? reqStr(v.activity) : "Not Specified", ...nariCaste(v) },
    }),
  "projects/nari/nari-bio-fortified": (v, ctx) =>
    prisma.nariBioFortified.create({
      data: { ...ctx, nutriSmartVillage: reqStr(v.nutriSmartVillage), season: reqStr(v.season), activity: reqStr(v.activity), categoryOfCrop: reqStr(v.categoryOfCrop), numberOfCrops: int(v.numberOfCrops) ?? 0, cropName: str(v.cropName), variety: str(v.variety), areaHa: dec(v.areaHa), ...nariCaste(v) },
    }),
  "projects/nari/nari-value-addition": (v, ctx) =>
    prisma.nariValueAddition.create({
      data: { ...ctx, nutriSmartVillage: reqStr(v.nutriSmartVillage), cropName: reqStr(v.cropName), valueAddedProduct: reqStr(v.valueAddedProduct), activity: reqStr(v.activity), numberOfProducts: int(v.numberOfProducts) ?? 0, ...nariCaste(v) },
    }),
  "projects/nari/nari-training": (v, ctx) =>
    prisma.nariTraining.create({
      data: {
        ...ctx,
        nutriSmartVillage: reqStr(v.nutriSmartVillage),
        areaOfTraining: reqStr(v.areaOfTraining),
        activity: reqStr(v.activity),
        titleOfTraining: reqStr(v.titleOfTraining),
        numberOfCourses: int(v.numberOfCourses) ?? 0,
        onOffCampus: str(v.onOffCampus),
        venue: str(v.venue),
        ...nariCaste(v),
      },
    }),
  "projects/nari/nari-extension": (v, ctx) =>
    prisma.nariExtension.create({
      data: {
        ...ctx,
        nutriSmartVillage: reqStr(v.nutriSmartVillage),
        activity: reqStr(v.activity),
        nameOfActivity: reqStr(v.nameOfActivity),
        noOfActivities: reqInt(v.noOfActivities),
        ...nariCaste(v),
      },
    }),
  "projects/agri-drone/agri-drone-introduction": (v, ctx) =>
    prisma.agriDroneIntroduction.create({
      data: {
        ...ctx,
        year: reqInt(v.year),
        centreName: reqStr(v.centreName),
        companyOfDrone: reqStr(v.companyOfDrone),
        modelOfDrone: reqStr(v.modelOfDrone),
        dronesSanctioned: reqInt(v.dronesSanctioned),
        dronesPurchased: reqInt(v.dronesPurchased),
        amountSanctioned: reqDec(v.amountSanctioned),
        costPerDrone: dec(v.costPerDrone),
        pilotNameContact: str(v.pilotNameContact),
        targetAreaHa: dec(v.targetAreaHa),
        amountSanctionedDemo: dec(v.amountSanctionedDemo),
        amountUtilisedDemo: dec(v.amountUtilisedDemo),
        areaCoveredDemoHa: dec(v.areaCoveredDemoHa),
        operationType: str(v.operationType),
        farmersParticipated: int(v.farmersParticipated),
        advantages: str(v.advantages),
      },
    }),
  "projects/agri-drone/agri-drone-demonstration": (v, ctx) =>
    prisma.agriDroneDemonstration.create({
      data: {
        ...ctx, centreName: reqStr(v.centreName), district: reqStr(v.district), dateOfDemos: reqDate(v.dateOfDemos),
        placeOfDemos: reqStr(v.placeOfDemos), cropName: reqStr(v.cropName), noOfDemos: reqInt(v.noOfDemos),
        areaCovered: reqDec(v.areaCovered), noOfFarmers: demographicTotal(v), ...demographicColumns(v),
      },
    }),
  "projects/agri-drone/agri-drone-team": (v, ctx) =>
    prisma.agriDroneProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/fpo-cbbo/fpo-cbbo-details": (v, ctx) =>
    prisma.fpoCbboDetail.create({
      data: {
        ...ctx, noOfBlocksAllocated: reqInt(v.noOfBlocksAllocated), noOfFposRegistered: reqInt(v.noOfFposRegistered),
        trainingReceived: str(v.trainingReceived), businessPlanPrepared: bool(v.businessPlanPrepared),
        noOfFposDoingBusiness: reqInt(v.noOfFposDoingBusiness),
        avgMembersPerFpo: int(v.avgMembersPerFpo), noOfFpoManagementCost: int(v.noOfFpoManagementCost),
        noOfFpoEquityGrant: int(v.noOfFpoEquityGrant), techBackstoppingFpos: int(v.techBackstoppingFpos),
        noOfTrainingProgrammes: int(v.noOfTrainingProgrammes), assistanceEconomicActivities: int(v.assistanceEconomicActivities),
        businessPlanWithoutCbbo: bool(v.businessPlanWithoutCbbo),
      },
    }),
  "projects/fpo-cbbo/fpo-management": (v, ctx) =>
    prisma.fpoManagement.create({
      data: {
        ...ctx,
        registrationNo: reqStr(v.registrationNo),
        dateOfRegistration: reqDate(v.dateOfRegistration),
        fpoName: reqStr(v.fpoName),
        fpoAddress: str(v.fpoAddress),
        totalBomMembers: reqInt(v.totalBomMembers),
        financialPosition: str(v.financialPosition),
        proposedActivity: str(v.proposedActivity),
        commodityIdentified: str(v.commodityIdentified),
        areaHa: dec(v.areaHa),
        totalFarmersAttached: int(v.totalFarmersAttached),
        successIndicator: str(v.successIndicator),
      },
    }),
  "projects/fpo-cbbo/fpo-team": (v, ctx) =>
    prisma.fpoProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/drmr/drmr-details": (v, ctx) =>
    prisma.drmrDetail.create({
      data: {
        ...ctx,
        varietiesUsedInIp: reqStr(v.varietiesUsedInIp),
        situations: reqStr(v.situations),
        varietiesUsedInFp: reqStr(v.varietiesUsedInFp),
        netReturnImprovedPractice: reqDec(v.netReturnImprovedPractice),
        netReturnFarmerPractice: reqDec(v.netReturnFarmerPractice),
        yieldKgHaIp: dec(v.yieldKgHaIp),
        yieldKgHaFp: dec(v.yieldKgHaFp),
        yiofpPercentIp: dec(v.yiofpPercentIp),
        yiofpPercentFp: dec(v.yiofpPercentFp),
        cocRsHaIp: dec(v.cocRsHaIp),
        cocRsHaFp: dec(v.cocRsHaFp),
        gmrRsHaIp: dec(v.gmrRsHaIp),
        gmrRsHaFp: dec(v.gmrRsHaFp),
        anmrRsHaIp: dec(v.anmrRsHaIp),
        anmrRsHaFp: dec(v.anmrRsHaFp),
        bcRatioIp: dec(v.bcRatioIp),
        bcRatioFp: dec(v.bcRatioFp),
      },
    }),
  "projects/drmr/drmr-activity": (v, ctx) => {
    const item = drmrItemData(v, ctx.zoneId);
    return prisma.drmrActivity.create({
      data: {
        ...ctx,
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        training: str(v.training),
        flds: str(v.flds),
        awarenessCamps: str(v.awarenessCamps),
        distributionOfLiterature: str(v.distributionOfLiterature),
        itemActivity: str(v.itemActivity),
        unit: str(v.unit),
        quantity: dec(v.quantity),
        farmersByCategory: farmersByCategory(v),
        ...(item ? { items: { create: item } } : {}),
      },
    });
  },
  "projects/drmr/drmr-team": (v, ctx) =>
    prisma.drmrProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/cra/cra-details": (v, ctx) =>
    prisma.craDetail.create({
      data: {
        ...ctx,
        season: reqStr(v.season),
        technologyDemonstrated: reqStr(v.technologyDemonstrated),
        croppingSystem: reqStr(v.croppingSystem),
        areaHa: reqDec(v.areaHa),
        noOfFarmer: demographicTotal(v),
        farmingSystem: str(v.farmingSystem),
        crop: str(v.crop),
        cropYieldQha: dec(v.cropYieldQha),
        systemProductivityQha: dec(v.systemProductivityQha),
        totalReturnRsHa: dec(v.totalReturnRsHa),
        yieldFarmerPracticeQha: dec(v.yieldFarmerPracticeQha),
        farmersByCategory: farmersByCategory(v),
      },
    }),
  "projects/cra/cra-extension-activity": (v, ctx) =>
    prisma.craExtensionActivity.create({
      data: { ...ctx, extensionActivity: reqStr(v.extensionActivity), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), withinOrWithoutState: str(v.withinOrWithoutState), exposureVisits: reqInt(v.exposureVisits), farmersUnderExposure: demographicTotal(v), farmersByCategory: farmersByCategory(v) },
    }),
  "projects/csisa/csisa-details": (v, ctx) =>
    prisma.csisaDetail.create({
      data: {
        ...ctx, season: reqStr(v.season), villageCovered: reqInt(v.villageCovered), blockCovered: reqInt(v.blockCovered), districtCovered: reqInt(v.districtCovered),
        respondent: int(v.respondent), trailName: str(v.trailName), areaCoveredHa: dec(v.areaCoveredHa), cropName: str(v.cropName),
        techOptions: str(v.techOptions), varietyName: str(v.varietyName), durationDays: int(v.durationDays),
        sowingDate: date(v.sowingDate), harvestingDate: date(v.harvestingDate), maturityDays: int(v.maturityDays),
        grainYieldQha: dec(v.grainYieldQha), costOfCultivationRsHa: dec(v.costOfCultivationRsHa),
        grossReturnRsHa: dec(v.grossReturnRsHa), netReturnRsHa: dec(v.netReturnRsHa), bcr: ratio(v, "grossReturnRsHa", "costOfCultivationRsHa"),
      },
    }),
  "projects/cra/cra-team": (v, ctx) =>
    prisma.craProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/csisa/csisa-team": (v, ctx) =>
    prisma.csisaProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/cfld/cfld-team": (v, ctx) =>
    prisma.cfldProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/nari/nari-team": (v, ctx) =>
    prisma.nariProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/seed-hub/seed-hub-team": (v, ctx) =>
    prisma.seedHubProjectTeam.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) },
    }),
  "projects/seed-hub/seed-hub-program": (v, ctx) =>
    prisma.seedHubProgram.create({
      data: {
        ...ctx,
        season: reqStr(v.season),
        cropName: reqStr(v.cropName),
        variety: reqStr(v.variety),
        areaHa: reqDec(v.areaHa),
        yieldHa: reqDec(v.yieldHa),
        qtySeedProducedQ: dec(v.qtySeedProducedQ),
        qtySeedSaleOutQ: dec(v.qtySeedSaleOutQ),
        farmersPurchased: int(v.farmersPurchased),
        qtySeedSaleOutToFarmersQ: dec(v.qtySeedSaleOutToFarmersQ),
        villagesCovered: int(v.villagesCovered),
        qtySeedSaleOutOtherOrgQ: dec(v.qtySeedSaleOutOtherOrgQ),
        amountGeneratedLakh: dec(v.amountGeneratedLakh),
        totalAmountInProjectLakh: dec(v.totalAmountInProjectLakh),
      },
    }),
  "projects/other-programmes/other-programme": (v, ctx) =>
    prisma.otherProgramme.create({
      data: {
        ...ctx,
        programmeName: reqStr(v.programmeName),
        programmeDate: reqDate(v.programmeDate),
        venue: str(v.venue),
        purpose: str(v.purpose),
        participants: demographicTotal(v),
        farmersByCategory: farmersByCategory(v),
      },
    }),

  // --- Performance Indicators ---
  "performance/impact/impact-of-kvk-activities": (v, ctx) =>
    prisma.kvkActivityImpact.create({
      data: { ...ctx, reportingYear: int(v.reportingYear), specificArea: reqStr(v.specificArea), briefDetails: str(v.briefDetails), farmersBenefitted: reqInt(v.farmersBenefitted), horizontalSpread: str(v.horizontalSpread), adoptionPercent: reqDec(v.adoptionPercent), impactSubjective: str(v.impactSubjective), impactObjective: str(v.impactObjective), incomeBefore: dec(v.incomeBefore), incomeAfter: dec(v.incomeAfter) },
    }),
  "performance/impact/entrepreneurship-details": (v, ctx) =>
    prisma.entrepreneurshipDetail.create({
      data: {
        ...ctx,
        reportingYear: int(v.reportingYear),
        entrepreneurOrEnterprise: reqStr(v.entrepreneurOrEnterprise),
        registeredAddress: str(v.registeredAddress),
        enterpriseType: reqStr(v.enterpriseType),
        yearOfEstablishment: int(v.yearOfEstablishment),
        registrationDetails: str(v.registrationDetails),
        membersAssociated: reqInt(v.membersAssociated),
        technicalComponents: str(v.technicalComponents),
        annualIncome: reqDec(v.annualIncome),
        roleOfKvk: str(v.roleOfKvk),
        periodTimeline: str(v.periodTimeline),
        economicSocialStatus: str(v.economicSocialStatus),
        presentWorkingCondition: str(v.presentWorkingCondition),
        majorAchievements: str(v.majorAchievements),
        majorConstraints: str(v.majorConstraints),
      },
    }),
  "performance/impact/success-stories": (v, ctx) =>
    prisma.successStory.create({
      data: {
        ...ctx,
        reportingYear: int(v.reportingYear),
        farmerOrEntrepreneur: reqStr(v.farmerOrEntrepreneur),
        dateOfBirth: date(v.dateOfBirth),
        education: str(v.education),
        experience: str(v.experience),
        cellNoEmail: str(v.cellNoEmail),
        fullAddress: str(v.fullAddress),
        professionalMembership: str(v.professionalMembership),
        majorAchievement: reqStr(v.majorAchievement),
        awardsReceived: str(v.awardsReceived),
        storyTitle: reqStr(v.storyTitle),
        situationAnalysis: str(v.situationAnalysis),
        planImplementSupport: str(v.planImplementSupport),
        detailsOfPractices: str(v.detailsOfPractices),
        resultsOutput: str(v.resultsOutput),
        impactOutcome: str(v.impactOutcome),
        futurePlans: str(v.futurePlans),
        enterprise: str(v.enterprise),
        grossIncome: dec(v.grossIncome),
        netIncome: dec(v.netIncome),
        costBenefitRatio: dec(v.costBenefitRatio),
      },
    }),
  "performance/district-village-performance/district-level-data": (v, ctx) =>
    prisma.districtLevelData.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), items: reqStr(v.items), information: str(v.information) },
    }),
  "performance/district-village-performance/district-crop-productivity": (v, ctx) =>
    prisma.districtCropProductivity.create({
      data: {
        ...ctx,
        season: reqStr(v.season),
        type: reqStr(v.type),
        cropName: reqStr(v.cropName),
        areaHa: reqDec(v.areaHa),
        productionMt: reqDec(v.productionMt),
        productivityQha: reqDec(v.productivityQha),
        remarks: str(v.remarks),
      },
    }),
  "performance/district-village-performance/district-monthly-weather": (v, ctx) =>
    prisma.districtMonthlyWeather.create({
      data: {
        ...ctx, month: reqStr(v.month),
        rainfallMm: dec(v.rainfallMm), maxTempC: dec(v.maxTempC), minTempC: dec(v.minTempC),
        maxRhPct: dec(v.maxRhPct), minRhPct: dec(v.minRhPct), remarks: str(v.remarks),
      },
    }),
  "performance/district-village-performance/district-livestock-production": (v, ctx) =>
    prisma.districtLivestockProduction.create({
      data: { ...ctx, livestockName: reqStr(v.livestockName), number: reqDec(v.number), remarks: str(v.remarks) },
    }),
  "performance/district-village-performance/operational-area-details": (v, ctx) =>
    prisma.operationalAreaDetail.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), taluk: str(v.taluk), block: reqStr(v.block), village: reqStr(v.village), majorCrops: str(v.majorCrops), majorProblems: str(v.majorProblems), thrustAreas: str(v.thrustAreas) },
    }),
  "performance/district-village-performance/village-adoption-programme": (v, ctx) =>
    prisma.villageAdoptionProgramme.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), village: reqStr(v.village), block: reqStr(v.block), actionTaken: str(v.actionTaken) },
    }),
  "performance/district-village-performance/priority-thrust-area": (v, ctx) =>
    prisma.priorityThrustArea.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), thrustArea: reqStr(v.thrustArea), majorFocus: str(v.majorFocus), achievement: str(v.achievement) },
    }),
  "performance/infrastructure-performance/demonstration-units": (v, ctx) =>
    prisma.demonstrationUnit.create({
      data: {
        ...ctx,
        reportingYear: reqInt(v.reportingYear),
        demoUnitName: reqStr(v.demoUnitName),
        yearOfEstt: reqInt(v.yearOfEstt),
        areaSqMt: reqDec(v.areaSqMt),
        varietyBreed: reqStr(v.varietyBreed),
        produce: reqStr(v.produce),
        qty: reqDec(v.qty),
        costOfInputs: reqDec(v.costOfInputs),
        grossIncome: reqDec(v.grossIncome),
        remarks: reqStr(v.remarks),
        status: str(v.status),
      },
    }),
  "performance/infrastructure-performance/instructional-farm-crops": (v, ctx) =>
    prisma.instructionalFarmCrop.create({
      data: {
        ...ctx,
        reportingYear: reqInt(v.reportingYear),
        cropName: reqStr(v.cropName),
        areaHa: reqDec(v.areaHa),
        season: reqStr(v.season),
        variety: reqStr(v.variety),
        produceType: reqStr(v.produceType),
        qty: reqDec(v.qty),
        costOfInputs: reqDec(v.costOfInputs),
        grossIncome: reqDec(v.grossIncome),
        remarks: reqStr(v.remarks),
      },
    }),
  "performance/infrastructure-performance/production-units": (v, ctx) =>
    prisma.productionUnit.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), productName: reqStr(v.productName), qty: reqDec(v.qty), costOfInputs: reqDec(v.costOfInputs), grossIncome: reqDec(v.grossIncome), remarks: reqStr(v.remarks) },
    }),
  "performance/infrastructure-performance/instructional-farm-livestock": (v, ctx) =>
    prisma.instructionalFarmLivestock.create({
      data: {
        ...ctx,
        reportingYear: reqInt(v.reportingYear),
        animalName: reqStr(v.animalName),
        speciesBreed: reqStr(v.speciesBreed),
        produceType: reqStr(v.produceType),
        qty: reqDec(v.qty),
        costOfInputs: reqDec(v.costOfInputs),
        grossIncome: reqDec(v.grossIncome),
        remarks: reqStr(v.remarks),
      },
    }),
  "performance/infrastructure-performance/hostel-utilization": (v, ctx) =>
    prisma.hostelUtilization.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), months: reqStr(v.months), traineesStayed: reqInt(v.traineesStayed), traineeDays: reqInt(v.traineeDays), reasonForShortFall: reqStr(v.reasonForShortFall) },
    }),
  "performance/infrastructure-performance/staff-quarters-performance": (v, ctx) =>
    prisma.staffQuartersPerformance.create({
      data: {
        ...ctx,
        noOfStaffQuarters: reqInt(v.noOfStaffQuarters),
        dateOfCompletion: date(v.dateOfCompletion),
        remark: reqStr(v.remark),
        whetherCompleted: reqStr(v.whetherCompleted),
        occupancyDetails: reqStr(v.occupancyDetails),
        quarterlyCompletion: quarterlyCompletion(v.quarterlyCompletion),
      },
    }),
  "performance/infrastructure-performance/rain-water-harvesting": (v, ctx) =>
    prisma.rainWaterHarvesting.create({
      data: { ...ctx, trainingProgrammes: reqInt(v.trainingProgrammes), demonstrations: reqInt(v.demonstrations), plantMaterialProduced: reqInt(v.plantMaterialProduced), farmerVisits: reqInt(v.farmerVisits), officialVisits: reqInt(v.officialVisits) },
    }),
  "performance/financial-performance/budget-details": (v, ctx) =>
    prisma.budgetDetail.create({
      data: {
        ...ctx,
        startDate: date(v.startDate),
        endDate: date(v.endDate),
        salaryAllocation: reqDec(v.salaryAllocation),
        salaryExpenditure: reqDec(v.salaryExpenditure),
        generalGrantAllocation: reqDec(v.generalGrantAllocation),
        generalGrantExpenditure: reqDec(v.generalGrantExpenditure),
        capitalGrantAllocation: reqDec(v.capitalGrantAllocation),
        capitalGrantExpenditure: reqDec(v.capitalGrantExpenditure),
        generalTsp: reqDec(v.generalTsp),
        generalTspExpenditure: reqDec(v.generalTspExpenditure),
        generalScsp: reqDec(v.generalScsp),
        generalScspExpenditure: reqDec(v.generalScspExpenditure),
        capitalTsp: reqDec(v.capitalTsp),
        capitalTspExpenditure: reqDec(v.capitalTspExpenditure),
        capitalScsp: reqDec(v.capitalScsp),
        capitalScspExpenditure: reqDec(v.capitalScspExpenditure),
      },
    }),
  "performance/financial-performance/project-wise-budget-performance": (v, ctx) =>
    prisma.projectWiseBudgetPerformance.create({
      data: {
        ...ctx,
        startDate: date(v.startDate),
        endDate: date(v.endDate),
        projectName: reqStr(v.projectName),
        accountNumber: reqStr(v.accountNumber),
        fundingAgency: reqStr(v.fundingAgency),
        budgetEstimate: reqDec(v.budgetEstimate),
        budgetAllocated: reqDec(v.budgetAllocated),
        budgetReleased: reqDec(v.budgetReleased),
        expenditure: reqDec(v.expenditure),
        unspentBalance: reqDec(v.unspentBalance),
      },
    }),
  "performance/financial-performance/revolving-fund": (v, ctx) =>
    prisma.revolvingFund.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), openingBalance: reqDec(v.openingBalance), incomeDuringYear: reqDec(v.incomeDuringYear), expenditureDuringYear: reqDec(v.expenditureDuringYear), closing: reqDec(v.closing), kind: str(v.kind) },
    }),
  "performance/financial-performance/revenue-generation": (v, ctx) =>
    prisma.revenueGeneration.create({
      data: { ...ctx, startDate: date(v.startDate), endDate: date(v.endDate), headName: reqStr(v.headName), income: reqDec(v.income), sponsoringAgency: reqStr(v.sponsoringAgency) },
    }),
  "performance/financial-performance/resource-generation": (v, ctx) =>
    prisma.resourceGeneration.create({
      data: { ...ctx, startDate: date(v.startDate), endDate: date(v.endDate), programmeName: reqStr(v.programmeName), purpose: reqStr(v.purpose), sourcesOfFund: reqStr(v.sourcesOfFund), amountLakhs: reqDec(v.amountLakhs), infrastructureCreated: reqStr(v.infrastructureCreated) },
    }),
  "performance/linkages/functional-linkage": (v, ctx) =>
    prisma.functionalLinkage.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), organizationName: reqStr(v.organizationName), natureOfLinkage: reqStr(v.natureOfLinkage) },
    }),
  "performance/linkages/special-programmes": (v, ctx) =>
    prisma.specialProgramme.create({
      data: { ...ctx, reportingYear: reqInt(v.reportingYear), programmeType: reqStr(v.programmeType), programmeName: reqStr(v.programmeName), purpose: reqStr(v.purpose), fundingAgency: reqStr(v.fundingAgency), amount: reqDec(v.amount), initiationDate: date(v.initiationDate) },
    }),

  // --- Meetings ---
  "meetings/sac-meetings": (v, ctx) =>
    prisma.sacMeeting.create({
      data: { ...ctx, startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), participants: reqInt(v.participants), statutoryMembers: reqInt(v.statutoryMembers), recommendations: str(v.recommendations), actionTaken: str(v.actionTaken), actionCompliance: str(v.actionCompliance), reason: str(v.reason), fileUrl: str(v.file) },
    }),
  "meetings/other-meetings": (v, ctx) =>
    prisma.otherMeeting.create({
      data: { ...ctx, date: reqDate(v.date), meetingType: reqStr(v.meetingType), agenda: str(v.agenda), representativeFromAtari: str(v.representativeFromAtari) },
    }),

  // --- Miscellaneous ---
  "miscellaneous/prevalent-diseases-crops": (v, ctx) =>
    prisma.prevalentDiseaseCrop.create({
      data: { ...ctx, diseaseName: reqStr(v.diseaseName), crop: reqStr(v.crop), outbreakDate: reqDate(v.outbreakDate), areaAffected: reqDec(v.areaAffected), commodityLossPercent: reqDec(v.commodityLossPercent), preventiveMeasures: reqStr(v.preventiveMeasures) },
    }),
  "miscellaneous/prevalent-diseases-livestock": (v, ctx) =>
    prisma.prevalentDiseaseLivestock.create({
      data: {
        ...ctx,
        diseaseName: reqStr(v.diseaseName),
        speciesAffected: reqStr(v.speciesAffected),
        outbreakDate: reqDate(v.outbreakDate),
        mortalityMorbidity: reqStr(v.mortalityMorbidity),
        animalsVaccinated: reqInt(v.animalsVaccinated),
        preventiveMeasures: reqStr(v.preventiveMeasures),
        areaAffected: dec(v.areaAffected),
        commodityLossPercent: dec(v.commodityLossPercent),
      },
    }),
  "miscellaneous/nyk-training": (v, ctx) =>
    prisma.nykTraining.create({
      data: {
        ...ctx,
        programmeTitle: reqStr(v.programmeTitle),
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        ...demographicColumns(v),
        male: demographicSexTotal(v, "Male"),
        female: demographicSexTotal(v, "Female"),
        fundReceived: reqDec(v.fundReceived),
      },
    }),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-training-programme": (v, ctx) =>
    prisma.ppvFraTrainingProgramme.create({
      data: {
        ...ctx,
        date: reqDate(v.date),
        title: reqStr(v.title),
        type: reqStr(v.type),
        venue: reqStr(v.venue),
        resourcePerson: reqStr(v.resourcePerson),
        participants: demographicTotal(v),
        farmersByCategory: farmersByCategory(v),
      },
    }),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-farmer-details": (v, ctx) =>
    prisma.ppvFraFarmerDetail.create({
      data: {
        ...ctx,
        year: reqInt(v.year),
        crop: reqStr(v.crop),
        registrationNo: reqStr(v.registrationNo),
        farmerName: reqStr(v.farmerName),
        block: reqStr(v.block),
        district: reqStr(v.district),
        mobileNo: reqStr(v.mobileNo),
        village: reqStr(v.village),
        characteristics: reqStr(v.characteristics),
      },
    }),
  "miscellaneous/rawe-fet-fit-programme": (v, ctx) => {
    const startDate = reqDate(v.startDate);
    const endDate = reqDate(v.endDate);
    const male = reqInt(v.male);
    const female = reqInt(v.female);
    return prisma.raweFetFitProgramme.create({
      data: {
        ...ctx,
        startDate,
        endDate,
        attachmentType: reqStr(v.attachmentType),
        attachment: str(v.attachment),
        male,
        female,
        numberOfStudents: male + female,
        daysStayed: daysBetween(startDate, endDate),
      },
    });
  },
  "miscellaneous/vip-visitors": (v, ctx) =>
    prisma.vipVisitor.create({
      data: { ...ctx, visitDate: reqDate(v.visitDate), dignitaryType: reqStr(v.dignitaryType), ministerName: reqStr(v.ministerName), observations: reqStr(v.observations) },
    }),
  "miscellaneous/digital-information/digital-mobile-app": (v, ctx) =>
    prisma.digitalMobileApp.create({
      data: { ...ctx, mobileAppsDeveloped: reqInt(v.mobileAppsDeveloped), appName: str(v.appName), appLanguage: str(v.appLanguage), meantFor: str(v.meantFor), timesDownloaded: reqInt(v.timesDownloaded) },
    }),
  "miscellaneous/digital-information/digital-web-portal": (v, ctx) =>
    prisma.digitalWebPortal.create({
      data: { ...ctx, portalName: str(v.portalName), visitors: reqInt(v.visitors), farmersRegistered: reqInt(v.farmersRegistered) },
    }),
  "miscellaneous/digital-information/digital-kisan-sarathi": (v, ctx) =>
    prisma.digitalKisanSarathi.create({
      data: { ...ctx, farmersRegisteredKsp: reqInt(v.farmersRegisteredKsp), phoneCallAddressed: reqInt(v.phoneCallAddressed), answeredCall: reqInt(v.answeredCall) },
    }),
  "miscellaneous/digital-information/digital-kmas": (v, ctx) =>
    prisma.digitalKmas.create({
      data: { ...ctx, farmersCovered: reqInt(v.farmersCovered), advisoriesSent: reqInt(v.advisoriesSent), messagesCrop: bool(v.messagesCrop), messagesLivestock: bool(v.messagesLivestock), messagesWeather: bool(v.messagesWeather), messagesMarketing: bool(v.messagesMarketing), messagesAwareness: bool(v.messagesAwareness), messagesOtherEnterprises: bool(v.messagesOtherEnterprises), messagesAnyOther: str(v.messagesAnyOther) },
    }),
  "miscellaneous/digital-information/digital-other-channels": (v, ctx) =>
    prisma.digitalOtherChannel.create({
      data: {
        ...ctx,
        textAdvisories: reqInt(v.textAdvisories),
        textFarmers: reqInt(v.textFarmers),
        whatsappAdvisories: reqInt(v.whatsappAdvisories),
        whatsappFarmers: reqInt(v.whatsappFarmers),
        socialMediaAdvisories: reqInt(v.socialMediaAdvisories),
        socialMediaFarmers: reqInt(v.socialMediaFarmers),
        weatherBulletinAdvisories: reqInt(v.weatherBulletinAdvisories),
        weatherBulletinFarmers: reqInt(v.weatherBulletinFarmers),
        channel: str(v.channel),
        farmersCovered: int(v.farmersCovered),
        advisoriesSent: int(v.advisoriesSent),
        messagesCrop: int(v.messagesCrop) ?? 0,
        messagesLivestock: int(v.messagesLivestock) ?? 0,
        messagesWeather: int(v.messagesWeather) ?? 0,
        messagesMarketing: int(v.messagesMarketing) ?? 0,
        messagesAwareness: int(v.messagesAwareness) ?? 0,
        messagesOtherEnterprises: int(v.messagesOtherEnterprises) ?? 0,
      },
    }),
};

type DeleteFn = (id: string, ctx: ScopedContext) => Promise<{ count: number }>;

/**
 * Deletes a record together with its own Module Images. Ownership is checked
 * first and the images are only touched once the record is confirmed to
 * belong to the caller - clearing them up front let a KVK wipe another KVK's
 * photos by sending that record's id, even though the record delete itself
 * then came back "not found". The images and the record go in one
 * transaction so neither can be left behind without the other.
 */
async function deleteWithModuleImages(
  id: string,
  owned: () => Promise<unknown>,
  remove: () => Prisma.PrismaPromise<{ count: number }>,
): Promise<{ count: number }> {
  if (!(await owned())) return { count: 0 };
  const [, deleted] = await prisma.$transaction([prisma.moduleImage.deleteMany({ where: { formRecordId: id } }), remove()]);
  return deleted;
}

/**
 * One entry per LEAF_RECORD_REGISTRY key - deletes are scoped to the
 * signed-in KVK Admin's own kvkId, so `count` comes back 0 (treated as
 * not-found/not-authorized by the route, not silently ignored) for any id
 * that doesn't exist or belongs to a different KVK. Most models carry kvkId
 * directly; the handful of child-table leaves (Staff Transferred, Vehicle/
 * Equipment Status, FLD Extension Training/Technical Feedback) verify
 * ownership through their parent relation instead, since they don't have
 * their own kvkId column.
 */
export const LEAF_DELETE_REGISTRY: Record<string, DeleteFn> = {
  "about-kvk/basic/bank-account-details": (id, ctx) => prisma.bankAccount.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "about-kvk/employee/staff-transferred": (id, ctx) => prisma.staffTransfer.deleteMany({ where: { id, ...fromKvkScope(ctx) } }),
  "about-kvk/land-infrastructure/infrastructure-details": (id, ctx) => prisma.infrastructure.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "about-kvk/land-infrastructure/land-details": (id, ctx) => prisma.land.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "about-kvk/land-infrastructure/staff-quarters": (id, ctx) => prisma.staffQuarters.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "about-kvk/vehicles/view-vehicles": (id, ctx) => prisma.vehicle.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "about-kvk/vehicles/vehicle-details": (id, ctx) => prisma.vehicleStatus.deleteMany({ where: { id, vehicle: { ...kvkScope(ctx) } } }),
  "about-kvk/equipments/view-equipments": (id, ctx) => prisma.equipment.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "about-kvk/equipments/equipment-details": (id, ctx) => prisma.equipmentStatus.deleteMany({ where: { id, equipment: { ...kvkScope(ctx) } } }),
  "about-kvk/employee/employee-details": async (id, ctx) => {
    // Staff -> StaffTransfer is a RESTRICT FK, so a staff member who has ever
    // been transferred can't be deleted directly (the transfer flow now
    // creates these rows). Clear their transfer history first, in one txn -
    // and their own Module Images row (the "staff-photo" slot, 2026-09-24),
    // same "no orphaned photos" rule deleteWithModuleImages enforces below.
    const staff = await prisma.staff.findFirst({ where: { id, ...kvkScope(ctx) }, select: { id: true } });
    if (!staff) return { count: 0 };
    await prisma.$transaction([
      prisma.moduleImage.deleteMany({ where: { formRecordId: id, slot: "staff-photo" } }),
      prisma.staffTransfer.deleteMany({ where: { staffId: id } }),
      prisma.staff.deleteMany({ where: { id, ...kvkScope(ctx) } }),
    ]);
    return { count: 1 };
  },

  /** Also clears this record's own Module Images (formRecordId) - otherwise deleting the record would leave orphaned photos behind, contradicting the real "images added/removed should reflect automatically" rule. */
  "achievements/oft": (id, ctx) =>
    deleteWithModuleImages(
      id,
      () => prisma.oft.findFirst({ where: { id, ...kvkScope(ctx) }, select: { id: true } }),
      () => prisma.oft.deleteMany({ where: { id, ...kvkScope(ctx) } }),
    ),
  "achievements/front-line-demonstration/view-fld": (id, ctx) =>
    deleteWithModuleImages(
      id,
      () => prisma.fld.findFirst({ where: { id, ...kvkScope(ctx) }, select: { id: true } }),
      () => prisma.fld.deleteMany({ where: { id, ...kvkScope(ctx) } }),
    ),
  "achievements/front-line-demonstration/fld-extension-training": (id, ctx) => prisma.fldExtensionTraining.deleteMany({ where: { id, fld: { ...kvkScope(ctx) } } }),
  "achievements/front-line-demonstration/fld-technical-feedback": (id, ctx) => prisma.fldTechnicalFeedback.deleteMany({ where: { id, fld: { ...kvkScope(ctx) } } }),
  "achievements/trainings": (id, ctx) =>
    deleteWithModuleImages(
      id,
      () => prisma.training.findFirst({ where: { id, ...kvkScope(ctx) }, select: { id: true } }),
      () => prisma.training.deleteMany({ where: { id, ...kvkScope(ctx) } }),
    ),
  "achievements/extension/extension-activities": (id, ctx) =>
    deleteWithModuleImages(
      id,
      () => prisma.extensionActivity.findFirst({ where: { id, ...kvkScope(ctx) }, select: { id: true } }),
      () => prisma.extensionActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
    ),
  "achievements/extension/other-extension-activities": (id, ctx) => prisma.otherExtensionActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/special-days/celebration-days": (id, ctx) => prisma.celebrationDay.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/swachhta-bharat-abhiyaan/sewa": (id, ctx) => prisma.swachhtaObservance.deleteMany({ where: { id, ...kvkScope(ctx), kind: "SEWA" } }),
  "achievements/swachhta-bharat-abhiyaan/pakhwada": (id, ctx) => prisma.swachhtaObservance.deleteMany({ where: { id, ...kvkScope(ctx), kind: "PAKHWADA" } }),
  "achievements/swachhta-bharat-abhiyaan/budget-expenditure": (id, ctx) => prisma.swachhtaBudgetExpenditure.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/special-days/poshan-maaha": (id, ctx) => prisma.poshanMaaha.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/production-supply": (id, ctx) => prisma.technologyProductProduction.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/soil-water/soil-testing-equipment": (id, ctx) => prisma.soilTestingEquipment.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/soil-water/soil-water-testing": (id, ctx) => prisma.soilWaterPlantAnalysis.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/publications": (id, ctx) => prisma.publication.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/hrd": (id, ctx) => prisma.humanResourceDevelopment.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/awards/kvk": (id, ctx) => prisma.kvkAward.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/awards/scientist": (id, ctx) => prisma.scientistAward.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/awards/farmer": (id, ctx) => prisma.farmerAward.deleteMany({ where: { id, ...kvkScope(ctx) } }),

  /** Deleting the parent alone violates the RESTRICT foreign keys from its Economic/Socio-Economic/Farmers-Perception children (they don't cascade) - clear those first, in one transaction. */
  "projects/cfld/technical-parameter": async (id, ctx) => {
    const existing = await prisma.cfldTechnicalParameter.findFirst({ where: { id, ...kvkScope(ctx) }, select: { id: true } });
    if (!existing) return { count: 0 };
    await prisma.$transaction([
      prisma.cfldEconomicParameter.deleteMany({ where: { cfldTechnicalParameterId: id } }),
      prisma.cfldSocioEconomicImpact.deleteMany({ where: { cfldTechnicalParameterId: id } }),
      prisma.cfldFarmersPerception.deleteMany({ where: { cfldTechnicalParameterId: id } }),
      prisma.cfldTechnicalParameter.deleteMany({ where: { id, ...kvkScope(ctx) } }),
    ]);
    return { count: 1 };
  },
  "projects/cfld/extension-activity-cfld": (id, ctx) => prisma.cfldExtensionActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/cfld/budget-utilization": (id, ctx) => prisma.cfldBudgetUtilization.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/cfld/crop-wise-images": (id, ctx) => prisma.cfldCropWiseImage.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/basic-information": (id, ctx) => prisma.nicraBasicInformation.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/details": (id, ctx) => prisma.nicraDetails.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/training": (id, ctx) => prisma.nicraTraining.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/extension-activity-nicra": (id, ctx) => prisma.nicraExtensionActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/intervention": (id, ctx) => prisma.nicraIntervention.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/revenue-generated": (id, ctx) => prisma.nicraRevenueGenerated.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/custom-hiring-farm-implement": (id, ctx) => prisma.nicraCustomHiringFarmImplement.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/village-wise-vcrmc": (id, ctx) => prisma.nicraVillageWiseVcrmc.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/soil-health-card": (id, ctx) => prisma.nicraSoilHealthCard.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/convergence-programme": (id, ctx) => prisma.nicraConvergenceProgramme.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/dignitaries-visited-nicra-villages": (id, ctx) => prisma.nicraDignitaryVisit.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nicra/others/pi-co-pi-list": (id, ctx) => prisma.nicraPiCoPi.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/arya-safal/arya-safal-current-year": (id, ctx) => prisma.aryaCurrentYearDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/arya-safal/arya-safal-previous-year": (id, ctx) => prisma.aryaPreviousYearEvaluation.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/arya-safal/arya-team": (id, ctx) => prisma.aryaProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-geographical": (id, ctx) => prisma.nfGeographicalInfo.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-physical": (id, ctx) => prisma.nfPhysicalInfo.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-demonstration": (id, ctx) => prisma.nfDemonstrationInfo.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-already-practicing": (id, ctx) => prisma.nfAlreadyPracticing.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-beneficiaries": (id, ctx) => prisma.nfBeneficiary.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-soil-data": (id, ctx) => prisma.nfSoilData.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-budget-expenditure": (id, ctx) => prisma.nfBudgetExpenditure.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/natural-farming/nf-team": (id, ctx) => prisma.nfProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/tsp-scsp/view-sub-plan-activity": (id, ctx) => prisma.subPlanActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/tsp-scsp/tsp-scsp-team": (id, ctx) => prisma.tspScspProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nari/nari-nutrition-garden": (id, ctx) => prisma.nariNutritionGarden.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nari/nari-bio-fortified": (id, ctx) => prisma.nariBioFortified.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nari/nari-value-addition": (id, ctx) => prisma.nariValueAddition.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nari/nari-training": (id, ctx) => prisma.nariTraining.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nari/nari-extension": (id, ctx) => prisma.nariExtension.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/agri-drone/agri-drone-introduction": (id, ctx) => prisma.agriDroneIntroduction.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/agri-drone/agri-drone-demonstration": (id, ctx) => prisma.agriDroneDemonstration.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/agri-drone/agri-drone-team": (id, ctx) => prisma.agriDroneProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/fpo-cbbo/fpo-cbbo-details": (id, ctx) => prisma.fpoCbboDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/fpo-cbbo/fpo-management": (id, ctx) => prisma.fpoManagement.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/fpo-cbbo/fpo-team": (id, ctx) => prisma.fpoProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/drmr/drmr-details": (id, ctx) => prisma.drmrDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/drmr/drmr-activity": (id, ctx) => prisma.drmrActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/drmr/drmr-team": (id, ctx) => prisma.drmrProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/cra/cra-details": (id, ctx) => prisma.craDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/cra/cra-extension-activity": (id, ctx) => prisma.craExtensionActivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/cra/cra-team": (id, ctx) => prisma.craProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/csisa/csisa-details": (id, ctx) => prisma.csisaDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/csisa/csisa-team": (id, ctx) => prisma.csisaProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/cfld/cfld-team": (id, ctx) => prisma.cfldProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/nari/nari-team": (id, ctx) => prisma.nariProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/seed-hub/seed-hub-team": (id, ctx) => prisma.seedHubProjectTeam.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/seed-hub/seed-hub-program": (id, ctx) => prisma.seedHubProgram.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "projects/other-programmes/other-programme": (id, ctx) => prisma.otherProgramme.deleteMany({ where: { id, ...kvkScope(ctx) } }),

  "performance/impact/impact-of-kvk-activities": (id, ctx) => prisma.kvkActivityImpact.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/impact/entrepreneurship-details": (id, ctx) => prisma.entrepreneurshipDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/impact/success-stories": (id, ctx) => prisma.successStory.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/district-level-data": (id, ctx) => prisma.districtLevelData.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/district-crop-productivity": (id, ctx) => prisma.districtCropProductivity.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/district-monthly-weather": (id, ctx) => prisma.districtMonthlyWeather.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/district-livestock-production": (id, ctx) => prisma.districtLivestockProduction.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/operational-area-details": (id, ctx) => prisma.operationalAreaDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/village-adoption-programme": (id, ctx) => prisma.villageAdoptionProgramme.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/district-village-performance/priority-thrust-area": (id, ctx) => prisma.priorityThrustArea.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/demonstration-units": (id, ctx) => prisma.demonstrationUnit.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/instructional-farm-crops": (id, ctx) => prisma.instructionalFarmCrop.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/production-units": (id, ctx) => prisma.productionUnit.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/instructional-farm-livestock": (id, ctx) => prisma.instructionalFarmLivestock.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/hostel-utilization": (id, ctx) => prisma.hostelUtilization.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/staff-quarters-performance": (id, ctx) => prisma.staffQuartersPerformance.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/infrastructure-performance/rain-water-harvesting": (id, ctx) => prisma.rainWaterHarvesting.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/financial-performance/budget-details": (id, ctx) => prisma.budgetDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/financial-performance/project-wise-budget-performance": (id, ctx) => prisma.projectWiseBudgetPerformance.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/financial-performance/revolving-fund": (id, ctx) => prisma.revolvingFund.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/financial-performance/revenue-generation": (id, ctx) => prisma.revenueGeneration.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/financial-performance/resource-generation": (id, ctx) => prisma.resourceGeneration.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/linkages/functional-linkage": (id, ctx) => prisma.functionalLinkage.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "performance/linkages/special-programmes": (id, ctx) => prisma.specialProgramme.deleteMany({ where: { id, ...kvkScope(ctx) } }),

  "meetings/sac-meetings": (id, ctx) => prisma.sacMeeting.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "meetings/other-meetings": (id, ctx) => prisma.otherMeeting.deleteMany({ where: { id, ...kvkScope(ctx) } }),

  "miscellaneous/prevalent-diseases-crops": (id, ctx) => prisma.prevalentDiseaseCrop.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/prevalent-diseases-livestock": (id, ctx) => prisma.prevalentDiseaseLivestock.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/nyk-training": (id, ctx) => prisma.nykTraining.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-training-programme": (id, ctx) => prisma.ppvFraTrainingProgramme.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-farmer-details": (id, ctx) => prisma.ppvFraFarmerDetail.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/rawe-fet-fit-programme": (id, ctx) => prisma.raweFetFitProgramme.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/vip-visitors": (id, ctx) => prisma.vipVisitor.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/digital-information/digital-mobile-app": (id, ctx) => prisma.digitalMobileApp.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/digital-information/digital-web-portal": (id, ctx) => prisma.digitalWebPortal.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/digital-information/digital-kisan-sarathi": (id, ctx) => prisma.digitalKisanSarathi.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/digital-information/digital-kmas": (id, ctx) => prisma.digitalKmas.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "miscellaneous/digital-information/digital-other-channels": (id, ctx) => prisma.digitalOtherChannel.deleteMany({ where: { id, ...kvkScope(ctx) } }),

  "achievements/special-days/technology-week-celebration": (id, ctx) => prisma.technologyWeekCelebration.deleteMany({ where: { id, ...kvkScope(ctx) } }),
  "achievements/special-days/world-soil-day": (id, ctx) => prisma.worldSoilDay.deleteMany({ where: { id, ...kvkScope(ctx) } }),
};

type UpdateFn = (id: string, values: Record<string, string>, ctx: ScopedContext) => Promise<{ count: number }>;

/**
 * One entry per LEAF_RECORD_REGISTRY key - same field parsing as create,
 * targeted at an existing row instead of a new one. `updateMany` (not
 * `update`) so the `kvkId`/parent-relation ownership check is baked into
 * the `where` clause itself: `count: 0` means either the id doesn't exist
 * or belongs to a different KVK, same signal the delete registry uses.
 * Relational child leaves (Staff Transferred, Vehicle/Equipment Status, FLD
 * Extension Training/Technical Feedback) update their own fields only - an
 * edit doesn't re-parent the row to a different KVK/Vehicle/Equipment/FLD.
 */
export const LEAF_UPDATE_REGISTRY: Record<string, UpdateFn> = {
  "about-kvk/basic/bank-account-details": (id, v, ctx) =>
    prisma.bankAccount.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: { accountType: reqStr(v.accountType), accountName: reqStr(v.accountName), bankName: reqStr(v.bankName), location: reqStr(v.location), accountNumber: reqStr(v.accountNumber) },
    }),
  // The bespoke Add form (EmployeeDetailsAddForm) submits `name`/`casteCategory`;
  // the generic Edit form submits the list-column keys `staffName`/`category`.
  // Accept either so an edit doesn't blank the name or drop Position/Category
  // (client report, 2026-09-04: "after entering a Position, the position data
  // is not showing").
  "about-kvk/employee/employee-details": (id, v, ctx) => {
    const resumeUrl = str(v.resume);
    return prisma.staff.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        sanctionedPost: reqStr(v.sanctionedPost),
        name: reqStr(v.name ?? v.staffName),
        position: str(v.position),
        mobile: str(v.mobile),
        email: str(v.email),
        payBand: str(v.payBand),
        payScale: str(v.payScale),
        discipline: str(v.discipline),
        dateOfBirth: date(v.dateOfBirth),
        dateOfJoining: date(v.dateOfJoining),
        jobType: str(v.jobType),
        allowances: str(v.allowances),
        category: str(v.casteCategory ?? v.category),
        transferStatus: str(v.transferStatus),
        photoUrl: str(v.photo),
        resumeUrl,
      },
    });
  },
  "about-kvk/land-infrastructure/infrastructure-details": (id, v, ctx) =>
    prisma.infrastructure.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        infrastructureName: reqStr(v.infraMasterName),
        notYetStarted: bool(v.notYetStarted),
        completedPlinthLevel: bool(v.completedPlinthLevel),
        completedLintelLevel: bool(v.completedLintelLevel),
        completedRoofLevel: bool(v.completedRoofLevel),
        totallyCompleted: bool(v.totallyCompleted),
        plinthAreaSqM: dec(v.plinthAreaSqM),
        underUse: bool(v.underUse),
        sourceOfFunding: str(v.sourceOfFunding),
        // fundingAgencyName has no form input (not on the reference) - the
        // column keeps its schema default and existing values are untouched.
      },
    }),
  "about-kvk/land-infrastructure/land-details": (id, v, ctx) =>
    prisma.land.updateMany({ where: { id, ...kvkScope(ctx) }, data: { item: reqStr(v.item), areaHa: reqDec(v.areaHa) } }),
  "about-kvk/land-infrastructure/staff-quarters": (id, v, ctx) =>
    prisma.staffQuarters.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: { numberOfQuarters: reqInt(v.noOfStaffQuarters), dateOfCompletion: date(v.dateOfCompletion), remark: str(v.remark) },
    }),
  "about-kvk/vehicles/view-vehicles": (id, v, ctx) =>
    prisma.vehicle.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        vehicleType: str(v.vehicleType),
        name: reqStr(v.vehicleName),
        registrationNo: reqStr(v.registrationNo),
        yearOfPurchase: reqInt(v.yearOfPurchase),
        cost: reqDec(v.totalCost),
        totalRun: dec(v.totalRun),
        presentStatus: str(v.presentStatus),
        repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
        sourceOfFunding: str(v.sourceOfFunding),
      },
    }),
  "about-kvk/vehicles/vehicle-details": async (id, v, ctx) => {
    const existingStatus = await prisma.vehicleStatus.findFirst({
      where: { id, vehicle: { ...kvkScope(ctx) } },
      select: { vehicleId: true, vehicle: { select: { kvkId: true, name: true } } },
    });
    if (!existingStatus) return { count: 0 };
    /**
     * Re-point to a different vehicle only within the row's OWN KVK, never by
     * a bare zone-wide name match - vehicle names repeat across KVKs (e.g.
     * "Bolero" is a real name in 29 different KVKs' fleets), so a Super
     * Admin editing a status row used to risk `vehicle.findFirst` picking an
     * arbitrary same-named vehicle from a *different* KVK and silently
     * re-parenting this row onto it. No lookup at all when the name is
     * unchanged (the common case), so a normal edit behaves exactly as before.
     */
    const name = reqStr(v.vehicleName);
    let vehicleId = existingStatus.vehicleId;
    if (name && name !== existingStatus.vehicle.name) {
      const target = await prisma.vehicle.findFirst({ where: { kvkId: existingStatus.vehicle.kvkId, name } });
      if (!target) throw new Error("Vehicle not found");
      vehicleId = target.id;
    }
    return prisma.vehicleStatus.updateMany({
      where: { id, vehicle: { ...kvkScope(ctx) } },
      data: {
        vehicleId,
        reportingYear: reqInt(v.reportingYear),
        totalRunKmHrs: dec(v.totalRunKms),
        presentStatus: str(v.presentStatus),
        fundingSource: str(v.fundingSource),
        repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
      },
    });
  },
  "about-kvk/equipments/view-equipments": (id, v, ctx) =>
    prisma.equipment.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        equipmentType: str(v.equipmentType),
        name: reqStr(v.equipmentName),
        yearOfPurchase: reqInt(v.yearOfPurchase),
        cost: reqDec(v.totalCost),
        presentStatus: str(v.presentStatus),
        repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
        sourceOfFund: str(v.sourceOfFund),
      },
    }),
  "about-kvk/equipments/equipment-details": (id, v, ctx) =>
    prisma.equipmentStatus.updateMany({
      where: { id, equipment: { ...kvkScope(ctx) } },
      data: {
        reportingYear: reqInt(v.reportingYear),
        presentStatus: str(v.presentStatus),
        repairingCost: v.presentStatus === "Repairing" ? dec(v.repairingCost) : null,
      },
    }),
  "about-kvk/employee/staff-transferred": (id, v, ctx) =>
    prisma.staffTransfer.updateMany({
      where: { id, ...fromKvkScope(ctx) },
      data: { transferDate: reqDate(v.transferDate) },
    }),

  "achievements/oft": async (id, v, ctx) => {
    const result = await prisma.oft.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: reqInt(v.reportingYear),
        season: str(v.season),
        oftSubject: str(v.oftSubject),
        discipline: reqStr(v.discipline),
        staff: reqStr(v.staff),
        thematicArea: reqStr(v.thematicArea),
        trialOnForm: reqStr(v.trialOnForm),
        problemDiagnosed: str(v.problemDiagnosed),
        sourceOfTechnology: str(v.sourceOfTechnology),
        sourceOfFunding: str(v.sourceOfFunding),
        productionSystem: str(v.productionSystem),
        performanceIndicators: str(v.performanceIndicators),
        finalRecommendation: str(v.finalRecommendation),
        constraintsIdentified: str(v.constraintsIdentified),
        farmersParticipationProcess: str(v.farmersParticipationProcess),
        quantity: dec(v.quantity),
        unit: str(v.unit),
        noOfLocation: int(v.noOfLocation),
        noOfTrialReplicationFarmer: int(v.noOfTrialReplicationFarmer),
        startMonth: date(v.startMonth),
        endMonth: date(v.endMonth),
        criticalInput: str(v.criticalInput),
        costOfOft: dec(v.costOfOft),
        fundingAgency: str(v.fundingAgency),
        status: v.status?.toLowerCase().includes("complet") ? "COMPLETED" : "ONGOING",
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    });
    if (result.count > 0) {
      const technologyOptions = parseTechnologyOptions(v.technologyOptions);
      await prisma.oftTechnologyOption.deleteMany({ where: { oftId: id } });
      if (technologyOptions.length > 0) {
        await prisma.oftTechnologyOption.createMany({
          data: technologyOptions.map((t) => ({ oftId: id, zoneId: ctx.zoneId, label: t.label, description: t.description })),
        });
      }
      const owner = await prisma.oft.findUnique({ where: { id }, select: { kvkId: true } });
      if (owner) {
        await syncModuleImages(v.moduleImages, {
          kvkId: owner.kvkId,
          zoneId: ctx.zoneId,
          categoryPath: "achievements/oft",
          categoryLabel: "Achievements - OFT",
          reportingYear: reqInt(v.reportingYear),
          activityDate: date(v.startMonth) ?? new Date(),
          formRecordId: id,
        });
      }
    }
    return result;
  },
  "achievements/front-line-demonstration/view-fld": async (id, v, ctx) => {
    const result = await prisma.fld.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: reqInt(v.reportingYear),
        startDate: date(v.startDate),
        endDate: date(v.endDate),
        staff: str(v.staff),
        season: str(v.season),
        sector: str(v.sector),
        thematicArea: str(v.thematicArea),
        category: reqStr(v.category),
        subCategory: reqStr(v.subCategory),
        cropAnimalEnterprise: str(v.cropAnimalEnterprise),
        technologyDemonstrated: reqStr(v.technologyDemonstrated),
        noOfDemonstration: int(v.noOfDemonstration),
        unit: str(v.unit),
        quantity: dec(v.quantity),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
        status: v.status?.toLowerCase().includes("complet") ? "COMPLETED" : "ONGOING",
      },
    });
    if (result.count > 0) {
      const owner = await prisma.fld.findUnique({ where: { id }, select: { kvkId: true } });
      if (owner) {
        await syncModuleImages(v.moduleImages, {
          kvkId: owner.kvkId,
          zoneId: ctx.zoneId,
          categoryPath: "achievements/front-line-demonstration/view-fld",
          categoryLabel: "Achievements - Front Line Demonstrations (FLD)",
          reportingYear: reqInt(v.reportingYear),
          activityDate: date(v.startDate) ?? new Date(),
          formRecordId: id,
        });
      }
    }
    return result;
  },
  "achievements/front-line-demonstration/fld-extension-training": (id, v, ctx) => {
    const participantCountMale = reqInt(v.participantCountMale);
    const participantCountFemale = reqInt(v.participantCountFemale);
    return prisma.fldExtensionTraining.updateMany({
      where: { id, fld: { ...kvkScope(ctx) } },
      data: { activity: reqStr(v.activity), date: reqDate(v.date), activityCount: reqInt(v.activityCount), participantCountMale, participantCountFemale, participantCount: participantCountMale + participantCountFemale, remark: str(v.remark) },
    });
  },
  "achievements/front-line-demonstration/fld-technical-feedback": (id, v, ctx) =>
    prisma.fldTechnicalFeedback.updateMany({
      where: { id, fld: { ...kvkScope(ctx) } },
      data: { crop: reqStr(v.crop), feedback: reqStr(v.feedback) },
    }),
  "achievements/trainings": async (id, v, ctx) => {
    const result = await prisma.training.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: (date(v.startDate) ?? new Date()).getFullYear(),
        startDate: date(v.startDate), endDate: date(v.endDate),
        title: reqStr(v.title), venue: str(v.venue),
        trainingDiscipline: str(v.trainingDiscipline), thematicArea: str(v.thematicArea), clientele: str(v.clientele),
        trainingType: str(v.trainingType), trainingArea: str(v.trainingArea), onCampusOffCampus: str(v.onCampusOffCampus),
        courseCoordinator: str(v.courseCoordinator), fundingSource: str(v.fundingSource), fundingAgencyName: str(v.fundingAgencyName),
        ...demographicColumns(v),
      },
    });
    if (result.count > 0) {
      const owner = await prisma.training.findUnique({ where: { id }, select: { kvkId: true } });
      if (owner) {
        await syncModuleImages(v.moduleImages, {
          kvkId: owner.kvkId,
          zoneId: ctx.zoneId,
          categoryPath: "achievements/trainings",
          categoryLabel: "Achievements - Trainings",
          reportingYear: reqInt(v.reportingYear),
          activityDate: date(v.startDate) ?? new Date(),
          formRecordId: id,
        });
      }
    }
    return result;
  },
  "achievements/extension/extension-activities": async (id, v, ctx) => {
    const farmers = demographicColumns(v, "farmers");
    const officials = demographicColumns(v, "officials");
    const reportingYear = (date(v.startDate) ?? new Date()).getFullYear();
    const result = await prisma.extensionActivity.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear,
        startDate: date(v.startDate), endDate: date(v.endDate),
        natureOfExtensionActivity: reqStr(v.natureOfExtensionActivity), noOfActivities: reqInt(v.noOfActivities),
        noOfParticipants: Object.values({ ...farmers, ...officials }).reduce((sum, n) => sum + n, 0),
        staff: str(v.staff),
        ...farmers,
        ...officials,
      },
    });
    if (result.count > 0) {
      const owner = await prisma.extensionActivity.findUnique({ where: { id }, select: { kvkId: true } });
      if (owner) {
        await syncModuleImages(v.moduleImages, {
          kvkId: owner.kvkId,
          zoneId: ctx.zoneId,
          categoryPath: "achievements/extension/extension-activities",
          categoryLabel: "Achievements - Extension Activities",
          reportingYear,
          activityDate: date(v.startDate) ?? new Date(),
          formRecordId: id,
        });
      }
    }
    return result;
  },
  "achievements/extension/other-extension-activities": (id, v, ctx) =>
    prisma.otherExtensionActivity.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: (date(v.startDate) ?? new Date()).getFullYear(),
        natureOfExtensionActivity: reqStr(v.natureOfExtensionActivity), noOfActivities: reqInt(v.noOfActivities),
        staff: str(v.staff), startDate: date(v.startDate), endDate: date(v.endDate),
      },
    }),
  "achievements/special-days/celebration-days": (id, v, ctx) =>
    prisma.celebrationDay.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        importantDay: reqStr(v.importantDay), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), noOfActivities: reqInt(v.noOfActivities),
        ...demographicColumns(v, "farmers"),
        ...demographicColumns(v, "officials"),
        ...demographicColumns(v, "vip"),
        vipNameDesignationAddress: str(v.vipNameDesignationAddress),
      },
    }),
  /** Mirrors app/api/event-demographic/[id]/route.ts's own former PUT logic - see the matching create-side comment above. */
  "achievements/special-days/technology-week-celebration": (id, v, ctx) => {
    const demographics = demographicColumns(v);
    return prisma.technologyWeekCelebration.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        startDate: reqDate(v.startDate), endDate: reqDate(v.endDate),
        typeOfActivities: reqStr(v.typeOfActivities), noOfActivities: reqInt(v.noOfActivities),
        relatedCropTechnology: str(v.relatedCropTechnology),
        numberOfParticipants: Object.values(demographics).reduce((sum, n) => sum + n, 0),
        ...demographics,
      },
    });
  },
  "achievements/special-days/world-soil-day": (id, v, ctx) =>
    prisma.worldSoilDay.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: int(v.reportingYear),
        noOfActivitiesConducted: reqInt(v.noOfActivitiesConducted),
        soilHealthCardsDistributed: reqInt(v.soilHealthCardsDistributed),
        noOfVip: countVips(v.vipNames),
        vipNames: str(v.vipNames),
        totalParticipants: demographicTotal(v),
        ...demographicColumns(v),
      },
    }),
  "achievements/swachhta-bharat-abhiyaan/sewa": (id, v, ctx) =>
    prisma.swachhtaObservance.updateMany({
      where: { id, ...kvkScope(ctx), kind: "SEWA" },
      data: { fromDate: reqDate(v.fromDate), toDate: reqDate(v.toDate), totalNoOfActivitiesUndertaken: reqInt(v.totalNoOfActivitiesUndertaken), noOfStaffs: reqInt(v.noOfStaffs), noOfFarmers: reqInt(v.noOfFarmers), noOfOthers: reqInt(v.noOfOthers) },
    }),
  "achievements/swachhta-bharat-abhiyaan/pakhwada": (id, v, ctx) =>
    prisma.swachhtaObservance.updateMany({
      where: { id, ...kvkScope(ctx), kind: "PAKHWADA" },
      data: { fromDate: reqDate(v.fromDate), toDate: reqDate(v.toDate), totalNoOfActivitiesUndertaken: reqInt(v.totalNoOfActivitiesUndertaken), noOfStaffs: reqInt(v.noOfStaffs), noOfFarmers: reqInt(v.noOfFarmers), noOfOthers: reqInt(v.noOfOthers) },
    }),
  "achievements/swachhta-bharat-abhiyaan/budget-expenditure": (id, v, ctx) =>
    prisma.swachhtaBudgetExpenditure.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: reqInt(v.reportingYear),
        vermicompostingVillagesCovered: reqInt(v.vermicompostingVillagesCovered),
        vermicompostingTotalExpenditure: reqDec(v.vermicompostingTotalExpenditure),
        otherVillagesCovered: int(v.otherVillagesCovered),
        otherTotalExpenditure: dec(v.otherTotalExpenditure),
      },
    }),
  "achievements/special-days/poshan-maaha": (id, v, ctx) => {
    const participants = {
      participantsGirls: reqInt(v.participantsGirls),
      participantsPublicRepresentatives: reqInt(v.participantsPublicRepresentatives),
      participantsFarmWoman: reqInt(v.participantsFarmWoman),
      participantsFarmers: reqInt(v.participantsFarmers),
      participantsAganwadiWorkers: reqInt(v.participantsAganwadiWorkers),
      participantsGovtOfficials: reqInt(v.participantsGovtOfficials),
    };
    return prisma.poshanMaaha.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        activityDate: reqDate(v.activityDate),
        activitiesConducted: reqStr(v.activitiesConducted),
        eventName: reqStr(v.eventName),
        saplingsPlanted: reqInt(v.saplingsPlanted),
        vegetableKits: reqInt(v.vegetableKits),
        ...participants,
        totalParticipants: Object.values(participants).reduce((sum, n) => sum + n, 0),
      },
    });
  },
  "achievements/production-supply": (id, v, ctx) =>
    prisma.technologyProductProduction.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingDate: date(v.reportingDate),
        /** Server-computed, never trusted from the client - same precedent as Trainings/Extension Activities' own Reporting Year. */
        reportingYear: (date(v.reportingDate) ?? new Date()).getFullYear(),
        productCategory: str(v.productCategory),
        productType: str(v.productType),
        product: str(v.product),
        variety: reqStr(v.variety),
        unit: str(v.unit),
        quantity: reqDec(v.quantity),
        value: dec(v.value),
        quantitySupplied: dec(v.quantitySupplied),
        supplyValue: dec(v.supplyValue),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    }),
  "achievements/soil-water/soil-testing-equipment": (id, v, ctx) =>
    prisma.soilTestingEquipment.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: int(v.reportingYear),
        analysis: reqStr(v.analysis),
        equipmentName: reqStr(v.equipmentName),
        quantity: reqInt(v.quantity),
      },
    }),
  "achievements/soil-water/soil-water-testing": (id, v, ctx) =>
    prisma.soilWaterPlantAnalysis.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        analysis: reqStr(v.analysis),
        samplesAnalyzedThrough: str(v.samplesAnalyzedThrough),
        noOfSamplesAnalyzed: reqInt(v.noOfSamplesAnalyzed),
        noOfVillagesCovered: reqInt(v.noOfVillagesCovered),
        amountRealized: reqDec(v.amountRealized),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    }),
  "achievements/publications": (id, v, ctx) =>
    prisma.publication.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingDate: date(v.reportingDate), itemName: reqStr(v.itemName), title: reqStr(v.title), authorName: reqStr(v.authorName), journalName: str(v.journalName), publisherName: str(v.publisherName), isbnNumber: str(v.isbnNumber), pageNumber: str(v.pageNumber), naasRating: str(v.naasRating) } }),
  "achievements/hrd": (id, v, ctx) =>
    prisma.humanResourceDevelopment.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: { staff: reqStr(v.staff), course: reqStr(v.course), startDate: date(v.startDate), endDate: date(v.endDate), venue: str(v.venue), organizer: str(v.organizer) },
    }),
  "achievements/awards/kvk": (id, v, ctx) =>
    prisma.kvkAward.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingDate: date(v.reportingDate), award: reqStr(v.award), amount: reqDec(v.amount), achievement: str(v.achievement), conferringAuthority: str(v.conferringAuthority) } }),
  "achievements/awards/scientist": (id, v, ctx) =>
    prisma.scientistAward.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingDate: date(v.reportingDate), headScientist: reqStr(v.headScientist), award: reqStr(v.award), amount: reqDec(v.amount), achievement: str(v.achievement), conferringAuthority: str(v.conferringAuthority) } }),
  "achievements/awards/farmer": (id, v, ctx) =>
    prisma.farmerAward.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingDate: date(v.reportingDate), farmerName: reqStr(v.farmerName), address: str(v.address), contactNumber: str(v.contactNumber), award: reqStr(v.award), amount: reqDec(v.amount), achievement: str(v.achievement), conferringAuthority: str(v.conferringAuthority) } }),

  "projects/cfld/extension-activity-cfld": (id, v, ctx) =>
    prisma.cfldExtensionActivity.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        season: reqStr(v.season),
        activityName: reqStr(v.activityName),
        activitiesOrganized: reqInt(v.activitiesOrganized),
        date: reqDate(v.date),
        placeOfActivity: reqStr(v.placeOfActivity),
        generalMale: int(v.generalMale) ?? 0,
        generalFemale: int(v.generalFemale) ?? 0,
        obcMale: int(v.obcMale) ?? 0,
        obcFemale: int(v.obcFemale) ?? 0,
        scMale: int(v.scMale) ?? 0,
        scFemale: int(v.scFemale) ?? 0,
        stMale: int(v.stMale) ?? 0,
        stFemale: int(v.stFemale) ?? 0,
      },
    }),
  "projects/cfld/budget-utilization": (id, v, ctx) => {
    const receivedKeys = ["criticalInputReceived", "extensionReceived", "publicationReceived", "taDaReceived"];
    const utilizationKeys = ["criticalInputUtilization", "extensionUtilization", "publicationUtilization", "taDaUtilization"];
    return prisma.cfldBudgetUtilization.updateMany({ where: { id, ...kvkScope(ctx) }, data: { crop: reqStr(v.crop), season: reqStr(v.season), overallFundAllocation: reqDec(v.overallFundAllocation), areaAllotedHa: dec(v.areaAllotedHa), areaAchievedHa: dec(v.areaAchievedHa), criticalInputReceived: dec(v.criticalInputReceived), criticalInputUtilization: dec(v.criticalInputUtilization), criticalInputBalance: diff(v, ["criticalInputReceived"], ["criticalInputUtilization"]), extensionReceived: dec(v.extensionReceived), extensionUtilization: dec(v.extensionUtilization), extensionBalance: diff(v, ["extensionReceived"], ["extensionUtilization"]), publicationReceived: dec(v.publicationReceived), publicationUtilization: dec(v.publicationUtilization), publicationBalance: diff(v, ["publicationReceived"], ["publicationUtilization"]), taDaReceived: dec(v.taDaReceived), taDaUtilization: dec(v.taDaUtilization), taDaBalance: diff(v, ["taDaReceived"], ["taDaUtilization"]), overallFundReceived: sum(v, receivedKeys), overallFundUtilized: sum(v, utilizationKeys), overallBalance: diff(v, receivedKeys, utilizationKeys) } });
  },
  "projects/cfld/crop-wise-images": (id, v, ctx) => {
    const imageUrl = reqStr(v.image);
    if (!imageUrl) throw new Error("An image is required.");
    return prisma.cfldCropWiseImage.updateMany({ where: { id, ...kvkScope(ctx) }, data: { crop: reqStr(v.crop), imageUrl } });
  },
  "projects/nicra/basic-information": (id, v, ctx) =>
    prisma.nicraBasicInformation.updateMany({ where: { id, ...kvkScope(ctx) }, data: { rfDistrictNormal: dec(v.rfDistrictNormal), rfDistrictReceived: dec(v.rfDistrictReceived), maxTemperature: dec(v.maxTemperature), minTemperature: dec(v.minTemperature), drySpell10Days: int(v.drySpell10Days), drySpell15Days: int(v.drySpell15Days), drySpell20Days: int(v.drySpell20Days), nicraAdoptedVillages: int(v.nicraAdoptedVillages), floodIntensiveRainMm: dec(v.floodIntensiveRainMm), floodWaterDepthCm: dec(v.floodWaterDepthCm), floodDurationDays: int(v.floodDurationDays), reportingDate: date(v.reportingDate), startDate: date(v.startDate), endDate: date(v.endDate) } }),
  "projects/nicra/details": (id, v, ctx) =>
    prisma.nicraDetails.updateMany({ where: { id, ...kvkScope(ctx) }, data: { cropName: reqStr(v.cropName), seasonName: reqStr(v.seasonName), technologyDemonstration: reqStr(v.technologyDemonstration), noOfFarmers: demographicTotal(v), category: str(v.category), subCategory: str(v.subCategory), areaOrUnit: dec(v.areaOrUnit), netReturn: dec(v.netReturn), month: str(v.month), yield: dec(v.yield), grossCost: dec(v.grossCost), grossReturn: dec(v.grossReturn), bcr: dec(v.bcr), ...demographicColumns(v) } }),
  "projects/nicra/training": (id, v, ctx) =>
    prisma.nicraTraining.updateMany({ where: { id, ...kvkScope(ctx) }, data: { title: reqStr(v.title), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), farmersAttended: demographicTotal(v), duration: str(v.duration), trainingType: str(v.trainingType), ...demographicColumns(v) } }),
  "projects/nicra/extension-activity-nicra": (id, v, ctx) =>
    prisma.nicraExtensionActivity.updateMany({ where: { id, ...kvkScope(ctx) }, data: { activityName: reqStr(v.activityName), places: reqStr(v.places), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), farmersAttended: demographicTotal(v), ...demographicColumns(v) } }),
  "projects/nicra/others/intervention": (id, v, ctx) =>
    prisma.nicraIntervention.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), seedBankFodderBank: reqStr(v.seedBankFodderBank), crop: reqStr(v.crop), variety: reqStr(v.variety), quantityQuintal: reqDec(v.quantity) } }),
  "projects/nicra/others/revenue-generated": (id, v, ctx) =>
    prisma.nicraRevenueGenerated.updateMany({ where: { id, ...kvkScope(ctx) }, data: { year: reqInt(v.year), revenue: reqDec(v.revenue), total: reqDec(v.total) } }),
  "projects/nicra/others/custom-hiring-farm-implement": (id, v, ctx) =>
    prisma.nicraCustomHiringFarmImplement.updateMany({ where: { id, ...kvkScope(ctx) }, data: { farmImplementName: reqStr(v.farmImplementName), farmersUsed: demographicTotal(v), areaCovered: reqDec(v.areaCovered), hoursUsed: reqDec(v.hoursUsed), revenueGenerated: reqDec(v.revenueGenerated), repairExpenditure: reqDec(v.repairExpenditure), ...demographicColumns(v) } }),
  "projects/nicra/others/village-wise-vcrmc": (id, v, ctx) =>
    prisma.nicraVillageWiseVcrmc.updateMany({ where: { id, ...kvkScope(ctx) }, data: { villageName: reqStr(v.villageName), constitutionDate: date(v.constitutionDate), members: reqInt(v.members), meetingsOrganized: reqInt(v.meetingsOrganized), meetingDate: date(v.meetingDate), secretaryName: str(v.secretaryName), membersMale: int(v.membersMale), membersFemale: int(v.membersFemale), presidentName: str(v.presidentName), majorDecision: str(v.majorDecision) } }),
  "projects/nicra/others/soil-health-card": (id, v, ctx) =>
    prisma.nicraSoilHealthCard.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), samplesCollected: reqInt(v.samplesCollected), samplesAnalysed: reqInt(v.samplesAnalysed), shcIssued: reqInt(v.shcIssued), farmersBenefitted: demographicTotal(v), ...demographicColumns(v) } }),
  "projects/nicra/others/convergence-programme": (id, v, ctx) =>
    prisma.nicraConvergenceProgramme.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), scheme: reqStr(v.scheme), natureOfWork: reqStr(v.natureOfWork), amount: reqDec(v.amount) } }),
  "projects/nicra/others/dignitaries-visited-nicra-villages": (id, v, ctx) =>
    prisma.nicraDignitaryVisit.updateMany({ where: { id, ...kvkScope(ctx) }, data: { vipExperts: reqStr(v.vipExperts), name: reqStr(v.name), dateOfVisit: reqDate(v.dateOfVisit), remark: str(v.remark) } }),
  "projects/nicra/others/pi-co-pi-list": (id, v, ctx) =>
    prisma.nicraPiCoPi.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), piCoPi: reqStr(v.piCoPi), name: reqStr(v.name) } }),
  "projects/arya-safal/arya-safal-current-year": (id, v, ctx) =>
    prisma.aryaCurrentYearDetail.updateMany({ where: { id, ...kvkScope(ctx) }, data: { enterprise: reqStr(v.enterprise), viableUnits: reqInt(v.viableUnits), closedUnits: reqInt(v.closedUnits), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), groupsFormed: reqInt(v.groupsFormed), groupsActive: reqInt(v.groupsActive), trainingsConducted: int(v.trainingsConducted), unitsEstablished: int(v.unitsEstablished), ruralYouthMale: int(v.ruralYouthMale), ruralYouthFemale: int(v.ruralYouthFemale), avgUnitSize: dec(v.avgUnitSize), productionPerUnit: dec(v.productionPerUnit), costPerUnit: dec(v.costPerUnit), saleValue: dec(v.saleValue), economicGainsPerUnit: dec(v.economicGainsPerUnit), employmentMandaysMale: int(v.employmentMandaysMale), employmentMandaysFemale: int(v.employmentMandaysFemale) } }),
  "projects/arya-safal/arya-safal-previous-year": (id, v, ctx) =>
    prisma.aryaPreviousYearEvaluation.updateMany({ where: { id, ...kvkScope(ctx) }, data: { enterprise: reqStr(v.enterprise), totalClosed: reqInt(v.totalClosed), closingDate: date(v.closingDate), totalRestarted: reqInt(v.totalRestarted), restartedDate: date(v.restartedDate), unitsEstablishedProgressive: int(v.unitsEstablishedProgressive), sizeMale: int(v.sizeMale), sizeFemale: int(v.sizeFemale), sizeNoOfUnit: int(v.sizeNoOfUnit), sizeUnitCapacity: dec(v.sizeUnitCapacity), costFixed: dec(v.costFixed), costVariable: dec(v.costVariable), totalProductionPerUnitYear: dec(v.totalProductionPerUnitYear), grossCostPerUnitYear: dec(v.grossCostPerUnitYear), grossReturnPerUnitYear: dec(v.grossReturnPerUnitYear), netBenefitPerUnitYear: dec(v.netBenefitPerUnitYear), employmentFamily: int(v.employmentFamily), employmentOtherThanFamily: int(v.employmentOtherThanFamily), personsVisited: int(v.personsVisited) } }),
  "projects/arya-safal/arya-team": (id, v, ctx) =>
    prisma.aryaProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/natural-farming/nf-geographical": (id, v, ctx) =>
    prisma.nfGeographicalInfo.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), agroClimaticZone: reqStr(v.agroClimaticZone), farmingSituation: reqStr(v.farmingSituation), latitude: reqDec(v.latitude), longitude: reqDec(v.longitude) } }),
  "projects/natural-farming/nf-physical": (id, v, ctx) =>
    prisma.nfPhysicalInfo.updateMany({ where: { id, ...kvkScope(ctx) }, data: { activityName: reqStr(v.activityName), trainingTitle: reqStr(v.trainingTitle), trainingDate: reqDate(v.trainingDate), venue: reqStr(v.venue), participants: demographicTotal(v), ...demographicColumns(v), remarks: str(v.remarks) } }),
  "projects/natural-farming/nf-demonstration": (id, v, ctx) =>
    prisma.nfDemonstrationInfo.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        farmerName: reqStr(v.farmerName),
        activityName: reqStr(v.activityName),
        crop: reqStr(v.crop),
        variety: reqStr(v.variety),
        farmerAddress: str(v.farmerAddress),
        farmerContact: str(v.farmerContact),
        agroClimaticZone: str(v.agroClimaticZone),
        croppingPattern: str(v.croppingPattern),
        farmingSituation: str(v.farmingSituation),
        latitude: dec(v.latitude),
        longitude: dec(v.longitude),
        season: str(v.season),
        technologyDemonstrated: str(v.technologyDemonstrated),
        areaHa: dec(v.areaHa),
        farmerPracticeDetail: str(v.farmerPracticeDetail),
        farmerFeedback: str(v.farmerFeedback),
        parameters: parseNfParameters(v.parameters),
      },
    }),
  "projects/natural-farming/nf-already-practicing": (id, v, ctx) =>
    prisma.nfAlreadyPracticing.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        farmerName: reqStr(v.farmerName),
        address: str(v.address),
        normalCropsGrown: str(v.normalCropsGrown),
        practicingYear: reqInt(v.practicingYear),
        contactNumber: str(v.contactNumber),
        activityName: str(v.activityName),
        crop: str(v.crop),
        technologyDemonstrated: str(v.technologyDemonstrated),
        areaHa: dec(v.areaHa),
        farmerFeedback: str(v.farmerFeedback),
        parameters: parseNfParameters(v.parameters),
      },
    }),
  "projects/natural-farming/nf-beneficiaries": (id, v, ctx) =>
    prisma.nfBeneficiary.updateMany({ where: { id, ...kvkScope(ctx) }, data: { numberOfBlock: reqInt(v.numberOfBlock), numberOfVillage: reqInt(v.numberOfVillage), numberOfTraining: reqInt(v.numberOfTraining), farmersInfluenced: reqInt(v.farmersInfluenced), reportingYear: int(v.reportingYear), farmersEngagedAllSeason: int(v.farmersEngagedAllSeason), farmersEngagedOneSeason: int(v.farmersEngagedOneSeason), remarks: str(v.remarks) } }),
  "projects/natural-farming/nf-soil-data": (id, v, ctx) =>
    prisma.nfSoilData.updateMany({ where: { id, ...kvkScope(ctx) }, data: { season: reqStr(v.season), type: reqStr(v.type), crop: reqStr(v.crop), beforePh: reqDec(v.beforePh), beforeEc: reqDec(v.beforeEc), beforeEcOc: reqDec(v.beforeEcOc), beforeN: dec(v.beforeN), beforeP: dec(v.beforeP), beforeK: dec(v.beforeK), beforeMicrobes: dec(v.beforeMicrobes), afterPh: reqDec(v.afterPh), afterEc: reqDec(v.afterEc), afterEcOc: reqDec(v.afterEcOc), afterN: dec(v.afterN), afterP: dec(v.afterP), afterK: dec(v.afterK), afterMicrobes: dec(v.afterMicrobes) } }),
  "projects/natural-farming/nf-budget-expenditure": (id, v, ctx) =>
    prisma.nfBudgetExpenditure.updateMany({ where: { id, ...kvkScope(ctx) }, data: { activityName: reqStr(v.activityName), activitiesOrganised: reqInt(v.activitiesOrganised), budgetSanction: reqDec(v.budgetSanction), budgetExpenditure: reqDec(v.budgetExpenditure), totalBudgetExpenditure: reqDec(v.totalBudgetExpenditure), balance: diff(v, ["budgetSanction"], ["budgetExpenditure"]) } }),
  "projects/natural-farming/nf-team": (id, v, ctx) =>
    prisma.nfProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/tsp-scsp/view-sub-plan-activity": (id, v, ctx) =>
    prisma.subPlanActivity.updateMany({ where: { id, ...kvkScope(ctx) }, data: { type: v.type?.toUpperCase() === "SCSP" ? "SCSP" : "TSP", activities: reqStr(v.activities), noOfTraining: reqInt(v.noOfTraining), beneficiaries: reqInt(v.beneficiaries), fundReceivedLakh: dec(v.fundReceivedLakh), physicalOutcomeNote: str(v.physicalOutcomeNote) } }),
  "projects/tsp-scsp/tsp-scsp-team": (id, v, ctx) =>
    prisma.tspScspProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/nari/nari-nutrition-garden": (id, v, ctx) =>
    prisma.nariNutritionGarden.updateMany({ where: { id, ...kvkScope(ctx) }, data: { nutriSmartVillage: reqStr(v.nutriSmartVillage), typeOfNutritionalGarden: reqStr(v.typeOfNutritionalGarden), numbers: reqInt(v.numbers), areaSqm: reqDec(v.areaSqm), activity: v.activity ? reqStr(v.activity) : "Not Specified", ...nariCaste(v) } }),
  "projects/nari/nari-bio-fortified": (id, v, ctx) =>
    prisma.nariBioFortified.updateMany({ where: { id, ...kvkScope(ctx) }, data: { nutriSmartVillage: reqStr(v.nutriSmartVillage), season: reqStr(v.season), activity: reqStr(v.activity), categoryOfCrop: reqStr(v.categoryOfCrop), numberOfCrops: int(v.numberOfCrops) ?? 0, cropName: str(v.cropName), variety: str(v.variety), areaHa: dec(v.areaHa), ...nariCaste(v) } }),
  "projects/nari/nari-value-addition": (id, v, ctx) =>
    prisma.nariValueAddition.updateMany({ where: { id, ...kvkScope(ctx) }, data: { nutriSmartVillage: reqStr(v.nutriSmartVillage), cropName: reqStr(v.cropName), valueAddedProduct: reqStr(v.valueAddedProduct), activity: reqStr(v.activity), numberOfProducts: int(v.numberOfProducts) ?? 0, ...nariCaste(v) } }),
  "projects/nari/nari-training": (id, v, ctx) =>
    prisma.nariTraining.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        nutriSmartVillage: reqStr(v.nutriSmartVillage),
        areaOfTraining: reqStr(v.areaOfTraining),
        activity: reqStr(v.activity),
        titleOfTraining: reqStr(v.titleOfTraining),
        numberOfCourses: int(v.numberOfCourses) ?? 0,
        onOffCampus: str(v.onOffCampus),
        venue: str(v.venue),
        ...nariCaste(v),
      },
    }),
  "projects/nari/nari-extension": (id, v, ctx) =>
    prisma.nariExtension.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        nutriSmartVillage: reqStr(v.nutriSmartVillage),
        activity: reqStr(v.activity),
        nameOfActivity: reqStr(v.nameOfActivity),
        noOfActivities: reqInt(v.noOfActivities),
        ...nariCaste(v),
      },
    }),
  "projects/agri-drone/agri-drone-introduction": (id, v, ctx) =>
    prisma.agriDroneIntroduction.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        year: reqInt(v.year),
        centreName: reqStr(v.centreName),
        companyOfDrone: reqStr(v.companyOfDrone),
        modelOfDrone: reqStr(v.modelOfDrone),
        dronesSanctioned: reqInt(v.dronesSanctioned),
        dronesPurchased: reqInt(v.dronesPurchased),
        amountSanctioned: reqDec(v.amountSanctioned),
        costPerDrone: dec(v.costPerDrone),
        pilotNameContact: str(v.pilotNameContact),
        targetAreaHa: dec(v.targetAreaHa),
        amountSanctionedDemo: dec(v.amountSanctionedDemo),
        amountUtilisedDemo: dec(v.amountUtilisedDemo),
        areaCoveredDemoHa: dec(v.areaCoveredDemoHa),
        operationType: str(v.operationType),
        farmersParticipated: int(v.farmersParticipated),
        advantages: str(v.advantages),
      },
    }),
  "projects/agri-drone/agri-drone-demonstration": (id, v, ctx) =>
    prisma.agriDroneDemonstration.updateMany({ where: { id, ...kvkScope(ctx) }, data: { centreName: reqStr(v.centreName), district: reqStr(v.district), dateOfDemos: reqDate(v.dateOfDemos), placeOfDemos: reqStr(v.placeOfDemos), cropName: reqStr(v.cropName), noOfDemos: reqInt(v.noOfDemos), areaCovered: reqDec(v.areaCovered), noOfFarmers: demographicTotal(v), ...demographicColumns(v) } }),
  "projects/agri-drone/agri-drone-team": (id, v, ctx) =>
    prisma.agriDroneProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/fpo-cbbo/fpo-cbbo-details": (id, v, ctx) =>
    prisma.fpoCbboDetail.updateMany({ where: { id, ...kvkScope(ctx) }, data: { noOfBlocksAllocated: reqInt(v.noOfBlocksAllocated), noOfFposRegistered: reqInt(v.noOfFposRegistered), trainingReceived: str(v.trainingReceived), businessPlanPrepared: bool(v.businessPlanPrepared), noOfFposDoingBusiness: reqInt(v.noOfFposDoingBusiness), avgMembersPerFpo: int(v.avgMembersPerFpo), noOfFpoManagementCost: int(v.noOfFpoManagementCost), noOfFpoEquityGrant: int(v.noOfFpoEquityGrant), techBackstoppingFpos: int(v.techBackstoppingFpos), noOfTrainingProgrammes: int(v.noOfTrainingProgrammes), assistanceEconomicActivities: int(v.assistanceEconomicActivities), businessPlanWithoutCbbo: bool(v.businessPlanWithoutCbbo) } }),
  "projects/fpo-cbbo/fpo-management": (id, v, ctx) =>
    prisma.fpoManagement.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        registrationNo: reqStr(v.registrationNo),
        dateOfRegistration: reqDate(v.dateOfRegistration),
        fpoName: reqStr(v.fpoName),
        fpoAddress: str(v.fpoAddress),
        totalBomMembers: reqInt(v.totalBomMembers),
        financialPosition: str(v.financialPosition),
        proposedActivity: str(v.proposedActivity),
        commodityIdentified: str(v.commodityIdentified),
        areaHa: dec(v.areaHa),
        totalFarmersAttached: int(v.totalFarmersAttached),
        successIndicator: str(v.successIndicator),
      },
    }),
  "projects/fpo-cbbo/fpo-team": (id, v, ctx) =>
    prisma.fpoProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/drmr/drmr-details": (id, v, ctx) =>
    prisma.drmrDetail.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        varietiesUsedInIp: reqStr(v.varietiesUsedInIp),
        situations: reqStr(v.situations),
        varietiesUsedInFp: reqStr(v.varietiesUsedInFp),
        netReturnImprovedPractice: reqDec(v.netReturnImprovedPractice),
        netReturnFarmerPractice: reqDec(v.netReturnFarmerPractice),
        yieldKgHaIp: dec(v.yieldKgHaIp),
        yieldKgHaFp: dec(v.yieldKgHaFp),
        yiofpPercentIp: dec(v.yiofpPercentIp),
        yiofpPercentFp: dec(v.yiofpPercentFp),
        cocRsHaIp: dec(v.cocRsHaIp),
        cocRsHaFp: dec(v.cocRsHaFp),
        gmrRsHaIp: dec(v.gmrRsHaIp),
        gmrRsHaFp: dec(v.gmrRsHaFp),
        anmrRsHaIp: dec(v.anmrRsHaIp),
        anmrRsHaFp: dec(v.anmrRsHaFp),
        bcRatioIp: dec(v.bcRatioIp),
        bcRatioFp: dec(v.bcRatioFp),
      },
    }),
  "projects/drmr/drmr-activity": async (id, v, ctx) => {
    const res = await prisma.drmrActivity.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        training: str(v.training),
        flds: str(v.flds),
        awarenessCamps: str(v.awarenessCamps),
        distributionOfLiterature: str(v.distributionOfLiterature),
        itemActivity: str(v.itemActivity),
        unit: str(v.unit),
        quantity: dec(v.quantity),
        farmersByCategory: farmersByCategory(v),
      },
    });
    const item = drmrItemData(v, ctx.zoneId);
    if (res.count > 0 && item) {
      // Replace just this Item/Activity's row on the submission.
      await prisma.drmrActivityItem.deleteMany({ where: { drmrActivityId: id, itemKey: item.itemKey } });
      await prisma.drmrActivityItem.create({ data: { ...item, drmrActivityId: id } });
    }
    return res;
  },
  "projects/drmr/drmr-team": (id, v, ctx) =>
    prisma.drmrProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/cra/cra-details": (id, v, ctx) =>
    prisma.craDetail.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        season: reqStr(v.season),
        technologyDemonstrated: reqStr(v.technologyDemonstrated),
        croppingSystem: reqStr(v.croppingSystem),
        areaHa: reqDec(v.areaHa),
        noOfFarmer: demographicTotal(v),
        farmingSystem: str(v.farmingSystem),
        crop: str(v.crop),
        cropYieldQha: dec(v.cropYieldQha),
        systemProductivityQha: dec(v.systemProductivityQha),
        totalReturnRsHa: dec(v.totalReturnRsHa),
        yieldFarmerPracticeQha: dec(v.yieldFarmerPracticeQha),
        farmersByCategory: farmersByCategory(v),
      },
    }),
  "projects/cra/cra-extension-activity": (id, v, ctx) =>
    prisma.craExtensionActivity.updateMany({ where: { id, ...kvkScope(ctx) }, data: { extensionActivity: reqStr(v.extensionActivity), startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), withinOrWithoutState: str(v.withinOrWithoutState), exposureVisits: reqInt(v.exposureVisits), farmersUnderExposure: demographicTotal(v), farmersByCategory: farmersByCategory(v) } }),
  "projects/cra/cra-team": (id, v, ctx) =>
    prisma.craProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/csisa/csisa-details": (id, v, ctx) =>
    prisma.csisaDetail.updateMany({ where: { id, ...kvkScope(ctx) }, data: {
      season: reqStr(v.season), villageCovered: reqInt(v.villageCovered), blockCovered: reqInt(v.blockCovered), districtCovered: reqInt(v.districtCovered),
      respondent: int(v.respondent), trailName: str(v.trailName), areaCoveredHa: dec(v.areaCoveredHa), cropName: str(v.cropName),
      techOptions: str(v.techOptions), varietyName: str(v.varietyName), durationDays: int(v.durationDays),
      sowingDate: date(v.sowingDate), harvestingDate: date(v.harvestingDate), maturityDays: int(v.maturityDays),
      grainYieldQha: dec(v.grainYieldQha), costOfCultivationRsHa: dec(v.costOfCultivationRsHa),
      grossReturnRsHa: dec(v.grossReturnRsHa), netReturnRsHa: dec(v.netReturnRsHa), bcr: ratio(v, "grossReturnRsHa", "costOfCultivationRsHa"),
    } }),
  "projects/csisa/csisa-team": (id, v, ctx) =>
    prisma.csisaProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/cfld/cfld-team": (id, v, ctx) =>
    prisma.cfldProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/nari/nari-team": (id, v, ctx) =>
    prisma.nariProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/seed-hub/seed-hub-team": (id, v, ctx) =>
    prisma.seedHubProjectTeam.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), projectTeam: reqStr(v.projectTeam), name: reqStr(v.name) } }),
  "projects/seed-hub/seed-hub-program": (id, v, ctx) =>
    prisma.seedHubProgram.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        season: reqStr(v.season),
        cropName: reqStr(v.cropName),
        variety: reqStr(v.variety),
        areaHa: reqDec(v.areaHa),
        yieldHa: reqDec(v.yieldHa),
        qtySeedProducedQ: dec(v.qtySeedProducedQ),
        qtySeedSaleOutQ: dec(v.qtySeedSaleOutQ),
        farmersPurchased: int(v.farmersPurchased),
        qtySeedSaleOutToFarmersQ: dec(v.qtySeedSaleOutToFarmersQ),
        villagesCovered: int(v.villagesCovered),
        qtySeedSaleOutOtherOrgQ: dec(v.qtySeedSaleOutOtherOrgQ),
        amountGeneratedLakh: dec(v.amountGeneratedLakh),
        totalAmountInProjectLakh: dec(v.totalAmountInProjectLakh),
      },
    }),
  "projects/other-programmes/other-programme": (id, v, ctx) =>
    prisma.otherProgramme.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        programmeName: reqStr(v.programmeName),
        programmeDate: reqDate(v.programmeDate),
        venue: str(v.venue),
        purpose: str(v.purpose),
        participants: demographicTotal(v),
        farmersByCategory: farmersByCategory(v),
      },
    }),

  "performance/impact/impact-of-kvk-activities": (id, v, ctx) =>
    prisma.kvkActivityImpact.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: int(v.reportingYear), specificArea: reqStr(v.specificArea), briefDetails: str(v.briefDetails), farmersBenefitted: reqInt(v.farmersBenefitted), horizontalSpread: str(v.horizontalSpread), adoptionPercent: reqDec(v.adoptionPercent), impactSubjective: str(v.impactSubjective), impactObjective: str(v.impactObjective), incomeBefore: dec(v.incomeBefore), incomeAfter: dec(v.incomeAfter) } }),
  "performance/impact/entrepreneurship-details": (id, v, ctx) =>
    prisma.entrepreneurshipDetail.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: int(v.reportingYear),
        entrepreneurOrEnterprise: reqStr(v.entrepreneurOrEnterprise),
        registeredAddress: str(v.registeredAddress),
        enterpriseType: reqStr(v.enterpriseType),
        yearOfEstablishment: int(v.yearOfEstablishment),
        registrationDetails: str(v.registrationDetails),
        membersAssociated: reqInt(v.membersAssociated),
        technicalComponents: str(v.technicalComponents),
        annualIncome: reqDec(v.annualIncome),
        roleOfKvk: str(v.roleOfKvk),
        periodTimeline: str(v.periodTimeline),
        economicSocialStatus: str(v.economicSocialStatus),
        presentWorkingCondition: str(v.presentWorkingCondition),
        majorAchievements: str(v.majorAchievements),
        majorConstraints: str(v.majorConstraints),
      },
    }),
  "performance/impact/success-stories": (id, v, ctx) =>
    prisma.successStory.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: int(v.reportingYear),
        farmerOrEntrepreneur: reqStr(v.farmerOrEntrepreneur),
        dateOfBirth: date(v.dateOfBirth),
        education: str(v.education),
        experience: str(v.experience),
        cellNoEmail: str(v.cellNoEmail),
        fullAddress: str(v.fullAddress),
        professionalMembership: str(v.professionalMembership),
        majorAchievement: reqStr(v.majorAchievement),
        awardsReceived: str(v.awardsReceived),
        storyTitle: reqStr(v.storyTitle),
        situationAnalysis: str(v.situationAnalysis),
        planImplementSupport: str(v.planImplementSupport),
        detailsOfPractices: str(v.detailsOfPractices),
        resultsOutput: str(v.resultsOutput),
        impactOutcome: str(v.impactOutcome),
        futurePlans: str(v.futurePlans),
        enterprise: str(v.enterprise),
        grossIncome: dec(v.grossIncome),
        netIncome: dec(v.netIncome),
        costBenefitRatio: dec(v.costBenefitRatio),
      },
    }),
  "performance/district-village-performance/district-level-data": (id, v, ctx) =>
    prisma.districtLevelData.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), items: reqStr(v.items), information: str(v.information) } }),
  "performance/district-village-performance/district-crop-productivity": (id, v, ctx) =>
    prisma.districtCropProductivity.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        season: reqStr(v.season),
        type: reqStr(v.type),
        cropName: reqStr(v.cropName),
        areaHa: reqDec(v.areaHa),
        productionMt: reqDec(v.productionMt),
        productivityQha: reqDec(v.productivityQha),
        remarks: str(v.remarks),
      },
    }),
  "performance/district-village-performance/district-monthly-weather": (id, v, ctx) =>
    prisma.districtMonthlyWeather.updateMany({ where: { id, ...kvkScope(ctx) }, data: {
      month: reqStr(v.month), rainfallMm: dec(v.rainfallMm), maxTempC: dec(v.maxTempC), minTempC: dec(v.minTempC),
      maxRhPct: dec(v.maxRhPct), minRhPct: dec(v.minRhPct), remarks: str(v.remarks),
    } }),
  "performance/district-village-performance/district-livestock-production": (id, v, ctx) =>
    prisma.districtLivestockProduction.updateMany({ where: { id, ...kvkScope(ctx) }, data: { livestockName: reqStr(v.livestockName), number: reqDec(v.number), remarks: str(v.remarks) } }),
  "performance/district-village-performance/operational-area-details": (id, v, ctx) =>
    prisma.operationalAreaDetail.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), taluk: str(v.taluk), block: reqStr(v.block), village: reqStr(v.village), majorCrops: str(v.majorCrops), majorProblems: str(v.majorProblems), thrustAreas: str(v.thrustAreas) } }),
  "performance/district-village-performance/village-adoption-programme": (id, v, ctx) =>
    prisma.villageAdoptionProgramme.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), village: reqStr(v.village), block: reqStr(v.block), actionTaken: str(v.actionTaken) } }),
  "performance/district-village-performance/priority-thrust-area": (id, v, ctx) =>
    prisma.priorityThrustArea.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), thrustArea: reqStr(v.thrustArea), majorFocus: str(v.majorFocus), achievement: str(v.achievement) } }),
  "performance/infrastructure-performance/demonstration-units": (id, v, ctx) =>
    prisma.demonstrationUnit.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: reqInt(v.reportingYear),
        demoUnitName: reqStr(v.demoUnitName),
        yearOfEstt: reqInt(v.yearOfEstt),
        areaSqMt: reqDec(v.areaSqMt),
        varietyBreed: reqStr(v.varietyBreed),
        produce: reqStr(v.produce),
        qty: reqDec(v.qty),
        costOfInputs: reqDec(v.costOfInputs),
        grossIncome: reqDec(v.grossIncome),
        remarks: reqStr(v.remarks),
        status: str(v.status),
      },
    }),
  "performance/infrastructure-performance/instructional-farm-crops": (id, v, ctx) =>
    prisma.instructionalFarmCrop.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: reqInt(v.reportingYear),
        cropName: reqStr(v.cropName),
        areaHa: reqDec(v.areaHa),
        season: reqStr(v.season),
        variety: reqStr(v.variety),
        produceType: reqStr(v.produceType),
        qty: reqDec(v.qty),
        costOfInputs: reqDec(v.costOfInputs),
        grossIncome: reqDec(v.grossIncome),
        remarks: reqStr(v.remarks),
      },
    }),
  "performance/infrastructure-performance/production-units": (id, v, ctx) =>
    prisma.productionUnit.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), productName: reqStr(v.productName), qty: reqDec(v.qty), costOfInputs: reqDec(v.costOfInputs), grossIncome: reqDec(v.grossIncome), remarks: reqStr(v.remarks) } }),
  "performance/infrastructure-performance/instructional-farm-livestock": (id, v, ctx) =>
    prisma.instructionalFarmLivestock.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        reportingYear: reqInt(v.reportingYear),
        animalName: reqStr(v.animalName),
        speciesBreed: reqStr(v.speciesBreed),
        produceType: reqStr(v.produceType),
        qty: reqDec(v.qty),
        costOfInputs: reqDec(v.costOfInputs),
        grossIncome: reqDec(v.grossIncome),
        remarks: reqStr(v.remarks),
      },
    }),
  "performance/infrastructure-performance/hostel-utilization": (id, v, ctx) =>
    prisma.hostelUtilization.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), months: reqStr(v.months), traineesStayed: reqInt(v.traineesStayed), traineeDays: reqInt(v.traineeDays), reasonForShortFall: reqStr(v.reasonForShortFall) } }),
  "performance/infrastructure-performance/staff-quarters-performance": (id, v, ctx) =>
    prisma.staffQuartersPerformance.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        noOfStaffQuarters: reqInt(v.noOfStaffQuarters),
        dateOfCompletion: date(v.dateOfCompletion),
        remark: reqStr(v.remark),
        whetherCompleted: reqStr(v.whetherCompleted),
        occupancyDetails: reqStr(v.occupancyDetails),
        quarterlyCompletion: quarterlyCompletion(v.quarterlyCompletion),
      },
    }),
  "performance/infrastructure-performance/rain-water-harvesting": (id, v, ctx) =>
    prisma.rainWaterHarvesting.updateMany({ where: { id, ...kvkScope(ctx) }, data: { trainingProgrammes: reqInt(v.trainingProgrammes), demonstrations: reqInt(v.demonstrations), plantMaterialProduced: reqInt(v.plantMaterialProduced), farmerVisits: reqInt(v.farmerVisits), officialVisits: reqInt(v.officialVisits) } }),
  "performance/financial-performance/budget-details": (id, v, ctx) =>
    prisma.budgetDetail.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        startDate: date(v.startDate),
        endDate: date(v.endDate),
        salaryAllocation: reqDec(v.salaryAllocation),
        salaryExpenditure: reqDec(v.salaryExpenditure),
        generalGrantAllocation: reqDec(v.generalGrantAllocation),
        generalGrantExpenditure: reqDec(v.generalGrantExpenditure),
        capitalGrantAllocation: reqDec(v.capitalGrantAllocation),
        capitalGrantExpenditure: reqDec(v.capitalGrantExpenditure),
        generalTsp: reqDec(v.generalTsp),
        generalTspExpenditure: reqDec(v.generalTspExpenditure),
        generalScsp: reqDec(v.generalScsp),
        generalScspExpenditure: reqDec(v.generalScspExpenditure),
        capitalTsp: reqDec(v.capitalTsp),
        capitalTspExpenditure: reqDec(v.capitalTspExpenditure),
        capitalScsp: reqDec(v.capitalScsp),
        capitalScspExpenditure: reqDec(v.capitalScspExpenditure),
      },
    }),
  "performance/financial-performance/project-wise-budget-performance": (id, v, ctx) =>
    prisma.projectWiseBudgetPerformance.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        startDate: date(v.startDate),
        endDate: date(v.endDate),
        projectName: reqStr(v.projectName),
        accountNumber: reqStr(v.accountNumber),
        fundingAgency: reqStr(v.fundingAgency),
        budgetEstimate: reqDec(v.budgetEstimate),
        budgetAllocated: reqDec(v.budgetAllocated),
        budgetReleased: reqDec(v.budgetReleased),
        expenditure: reqDec(v.expenditure),
        unspentBalance: reqDec(v.unspentBalance),
      },
    }),
  "performance/financial-performance/revolving-fund": (id, v, ctx) =>
    prisma.revolvingFund.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), openingBalance: reqDec(v.openingBalance), incomeDuringYear: reqDec(v.incomeDuringYear), expenditureDuringYear: reqDec(v.expenditureDuringYear), closing: reqDec(v.closing), kind: str(v.kind) } }),
  "performance/financial-performance/revenue-generation": (id, v, ctx) =>
    prisma.revenueGeneration.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: date(v.startDate), endDate: date(v.endDate), headName: reqStr(v.headName), income: reqDec(v.income), sponsoringAgency: reqStr(v.sponsoringAgency) } }),
  "performance/financial-performance/resource-generation": (id, v, ctx) =>
    prisma.resourceGeneration.updateMany({ where: { id, ...kvkScope(ctx) }, data: { startDate: date(v.startDate), endDate: date(v.endDate), programmeName: reqStr(v.programmeName), purpose: reqStr(v.purpose), sourcesOfFund: reqStr(v.sourcesOfFund), amountLakhs: reqDec(v.amountLakhs), infrastructureCreated: reqStr(v.infrastructureCreated) } }),
  "performance/linkages/functional-linkage": (id, v, ctx) =>
    prisma.functionalLinkage.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), organizationName: reqStr(v.organizationName), natureOfLinkage: reqStr(v.natureOfLinkage) } }),
  "performance/linkages/special-programmes": (id, v, ctx) =>
    prisma.specialProgramme.updateMany({ where: { id, ...kvkScope(ctx) }, data: { reportingYear: reqInt(v.reportingYear), programmeType: reqStr(v.programmeType), programmeName: reqStr(v.programmeName), purpose: reqStr(v.purpose), fundingAgency: reqStr(v.fundingAgency), amount: reqDec(v.amount), initiationDate: date(v.initiationDate) } }),

  "meetings/sac-meetings": (id, v, ctx) =>
    prisma.sacMeeting.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: { startDate: reqDate(v.startDate), endDate: reqDate(v.endDate), participants: reqInt(v.participants), statutoryMembers: reqInt(v.statutoryMembers), recommendations: str(v.recommendations), actionTaken: str(v.actionTaken), actionCompliance: str(v.actionCompliance), reason: str(v.reason), fileUrl: str(v.file) },
    }),
  "meetings/other-meetings": (id, v, ctx) =>
    prisma.otherMeeting.updateMany({ where: { id, ...kvkScope(ctx) }, data: { date: reqDate(v.date), meetingType: reqStr(v.meetingType), agenda: str(v.agenda), representativeFromAtari: str(v.representativeFromAtari) } }),

  "miscellaneous/prevalent-diseases-crops": (id, v, ctx) =>
    prisma.prevalentDiseaseCrop.updateMany({ where: { id, ...kvkScope(ctx) }, data: { diseaseName: reqStr(v.diseaseName), crop: reqStr(v.crop), outbreakDate: reqDate(v.outbreakDate), areaAffected: reqDec(v.areaAffected), commodityLossPercent: reqDec(v.commodityLossPercent), preventiveMeasures: reqStr(v.preventiveMeasures) } }),
  "miscellaneous/prevalent-diseases-livestock": (id, v, ctx) =>
    prisma.prevalentDiseaseLivestock.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        diseaseName: reqStr(v.diseaseName),
        speciesAffected: reqStr(v.speciesAffected),
        outbreakDate: reqDate(v.outbreakDate),
        mortalityMorbidity: reqStr(v.mortalityMorbidity),
        animalsVaccinated: reqInt(v.animalsVaccinated),
        preventiveMeasures: reqStr(v.preventiveMeasures),
        areaAffected: dec(v.areaAffected),
        commodityLossPercent: dec(v.commodityLossPercent),
      },
    }),
  "miscellaneous/nyk-training": (id, v, ctx) =>
    prisma.nykTraining.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        programmeTitle: reqStr(v.programmeTitle),
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        ...demographicColumns(v),
        male: demographicSexTotal(v, "Male"),
        female: demographicSexTotal(v, "Female"),
        fundReceived: reqDec(v.fundReceived),
      },
    }),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-training-programme": (id, v, ctx) =>
    prisma.ppvFraTrainingProgramme.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        date: reqDate(v.date),
        title: reqStr(v.title),
        type: reqStr(v.type),
        venue: reqStr(v.venue),
        resourcePerson: reqStr(v.resourcePerson),
        participants: demographicTotal(v),
        farmersByCategory: farmersByCategory(v),
      },
    }),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-farmer-details": (id, v, ctx) =>
    prisma.ppvFraFarmerDetail.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        year: reqInt(v.year),
        crop: reqStr(v.crop),
        registrationNo: reqStr(v.registrationNo),
        farmerName: reqStr(v.farmerName),
        block: reqStr(v.block),
        district: reqStr(v.district),
        mobileNo: reqStr(v.mobileNo),
        village: reqStr(v.village),
        characteristics: reqStr(v.characteristics),
      },
    }),
  "miscellaneous/rawe-fet-fit-programme": (id, v, ctx) => {
    const startDate = reqDate(v.startDate);
    const endDate = reqDate(v.endDate);
    const male = reqInt(v.male);
    const female = reqInt(v.female);
    return prisma.raweFetFitProgramme.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        startDate,
        endDate,
        attachmentType: reqStr(v.attachmentType),
        attachment: str(v.attachment),
        male,
        female,
        numberOfStudents: male + female,
        daysStayed: daysBetween(startDate, endDate),
      },
    });
  },
  "miscellaneous/vip-visitors": (id, v, ctx) =>
    prisma.vipVisitor.updateMany({ where: { id, ...kvkScope(ctx) }, data: { visitDate: reqDate(v.visitDate), dignitaryType: reqStr(v.dignitaryType), ministerName: reqStr(v.ministerName), observations: reqStr(v.observations) } }),
  "miscellaneous/digital-information/digital-mobile-app": (id, v, ctx) =>
    prisma.digitalMobileApp.updateMany({ where: { id, ...kvkScope(ctx) }, data: { mobileAppsDeveloped: reqInt(v.mobileAppsDeveloped), appName: str(v.appName), appLanguage: str(v.appLanguage), meantFor: str(v.meantFor), timesDownloaded: reqInt(v.timesDownloaded) } }),
  "miscellaneous/digital-information/digital-web-portal": (id, v, ctx) =>
    prisma.digitalWebPortal.updateMany({ where: { id, ...kvkScope(ctx) }, data: { portalName: str(v.portalName), visitors: reqInt(v.visitors), farmersRegistered: reqInt(v.farmersRegistered) } }),
  "miscellaneous/digital-information/digital-kisan-sarathi": (id, v, ctx) =>
    prisma.digitalKisanSarathi.updateMany({ where: { id, ...kvkScope(ctx) }, data: { farmersRegisteredKsp: reqInt(v.farmersRegisteredKsp), phoneCallAddressed: reqInt(v.phoneCallAddressed), answeredCall: reqInt(v.answeredCall) } }),
  "miscellaneous/digital-information/digital-kmas": (id, v, ctx) =>
    prisma.digitalKmas.updateMany({ where: { id, ...kvkScope(ctx) }, data: { farmersCovered: reqInt(v.farmersCovered), advisoriesSent: reqInt(v.advisoriesSent), messagesCrop: bool(v.messagesCrop), messagesLivestock: bool(v.messagesLivestock), messagesWeather: bool(v.messagesWeather), messagesMarketing: bool(v.messagesMarketing), messagesAwareness: bool(v.messagesAwareness), messagesOtherEnterprises: bool(v.messagesOtherEnterprises), messagesAnyOther: str(v.messagesAnyOther) } }),
  "miscellaneous/digital-information/digital-other-channels": (id, v, ctx) =>
    prisma.digitalOtherChannel.updateMany({
      where: { id, ...kvkScope(ctx) },
      data: {
        textAdvisories: reqInt(v.textAdvisories),
        textFarmers: reqInt(v.textFarmers),
        whatsappAdvisories: reqInt(v.whatsappAdvisories),
        whatsappFarmers: reqInt(v.whatsappFarmers),
        socialMediaAdvisories: reqInt(v.socialMediaAdvisories),
        socialMediaFarmers: reqInt(v.socialMediaFarmers),
        weatherBulletinAdvisories: reqInt(v.weatherBulletinAdvisories),
        weatherBulletinFarmers: reqInt(v.weatherBulletinFarmers),
        channel: str(v.channel),
        farmersCovered: int(v.farmersCovered),
        advisoriesSent: int(v.advisoriesSent),
        messagesCrop: int(v.messagesCrop) ?? 0,
        messagesLivestock: int(v.messagesLivestock) ?? 0,
        messagesWeather: int(v.messagesWeather) ?? 0,
        messagesMarketing: int(v.messagesMarketing) ?? 0,
        messagesAwareness: int(v.messagesAwareness) ?? 0,
        messagesOtherEnterprises: int(v.messagesOtherEnterprises) ?? 0,
      },
    }),
};
