import "server-only";
import { prisma } from "@/lib/prisma";
import type { MasterListType } from "@/lib/generated/prisma/enums";

export type MasterRow = Record<string, string>;
type ListFn = (zoneId: string) => Promise<MasterRow[]>;
type CreateFn = (values: Record<string, string>, zoneId: string) => Promise<unknown>;
type UpdateFn = (id: string, values: Record<string, string>, zoneId: string) => Promise<{ count: number }>;
type DeleteFn = (id: string, zoneId: string) => Promise<{ count: number }>;

/** Same coercion convention as lib/leaf-record-registry.ts. */
const reqStr = (v: string | undefined) => v?.trim() ?? "";
const bool = (v: string | undefined) =>
  v?.trim().toLowerCase() === "yes" || v?.trim().toLowerCase() === "true";
const int = (v: string | undefined) => (v?.trim() ? parseInt(v, 10) : undefined);

/**
 * Every single-column "Name" master (Job Type, Season, NICRA Dignitary Type,
 * ...) shares the exact same MasterListItem-backed shape - one factory
 * instead of ~40 near-identical entries. `columnKey` is the leaf's own
 * confirmed column key (lib/navigation.ts) since it isn't always literally
 * "name" (e.g. "activityName", "clientele", "eventName", "itemName").
 */
function simpleMasterList(type: MasterListType, columnKey: string) {
  return {
    list: (async (zoneId: string) => {
      const items = await prisma.masterListItem.findMany({
        where: { zoneId, type },
        orderBy: { name: "asc" },
      });
      // `_isOther` lets a Form Management dropdown mark this row as its "Other"
      // choice (see the "Mark as Other option" checkbox on the create form).
      return items.map((i) => ({ id: i.id, [columnKey]: i.name, _isOther: i.isOther ? "1" : "" }));
    }) as ListFn,
    create: (async (values, zoneId) => {
      const name = reqStr(values[columnKey]);
      if (!name) throw new Error(`${columnKey} is required.`);
      return prisma.masterListItem.create({
        data: { type, name, zoneId, isOther: bool(values.__markAsOther__) },
      });
    }) as CreateFn,
    update: (async (id, values, zoneId) => {
      const name = reqStr(values[columnKey]);
      if (!name) throw new Error(`${columnKey} is required.`);
      return prisma.masterListItem.updateMany({
        where: { id, zoneId, type },
        data: { name, isOther: bool(values.__markAsOther__) },
      });
    }) as UpdateFn,
    delete: ((id, zoneId) =>
      prisma.masterListItem.deleteMany({ where: { id, zoneId, type } })) as DeleteFn,
  };
}

/** Shared by kvk-master's create/update: resolve State -> District (scoped to that state) -> Host Org by exact name within the zone, same "typing an unknown name returns a clear 400" convention used everywhere else in this registry. */
async function resolveKvkParents(v: Record<string, string>, zoneId: string) {
  const name = reqStr(v.kvk);
  const stateName = reqStr(v.stateName);
  const districtName = reqStr(v.districtName);
  const hostOrgName = reqStr(v.hostOrg);
  if (!name || !stateName || !districtName || !hostOrgName) {
    throw new Error("KVK, State Name, District Name and Host Org are required.");
  }
  const state = await prisma.state.findFirst({ where: { zoneId, name: stateName } });
  if (!state) throw new Error(`Unknown state: ${stateName}`);
  const district = await prisma.district.findFirst({ where: { stateId: state.id, name: districtName } });
  if (!district) throw new Error(`Unknown district: ${districtName}`);
  const hostOrg = await prisma.hostOrganization.findFirst({ where: { zoneId, name: hostOrgName } });
  if (!hostOrg) throw new Error(`Unknown host organization: ${hostOrgName}`);
  /** Institute is optional (client request, 2026-08-27) - unlike State/District/Host Org, a KVK doesn't have to carry one. */
  const instituteName = reqStr(v.instituteName);
  const institute = instituteName ? await prisma.institute.findFirst({ where: { zoneId, name: instituteName } }) : null;
  if (instituteName && !institute) throw new Error(`Unknown institute: ${instituteName}`);
  return { name, stateId: state.id, districtId: district.id, hostOrgId: hostOrg.id, instituteId: institute?.id ?? null };
}

const SIMPLE_MASTERS: Record<string, { type: MasterListType; column: string }> = {
  "training-clientele": { type: "TRAINING_CLIENTELE", column: "clientele" },
  "funding-source": { type: "TRAINING_FUNDING_SOURCE", column: "fundingSource" },
  "extension-activity": { type: "EXTENSION_ACTIVITY_MASTER", column: "activityName" },
  "other-extension-activity": { type: "OTHER_EXTENSION_ACTIVITY_MASTER", column: "activityName" },
  "events-master": { type: "EVENTS_MASTER", column: "eventName" },
  activity: { type: "FLD_ACTIVITY", column: "name" },
  "product-category": { type: "PRODUCT_CATEGORY", column: "name" },
  "arya-enterprise": { type: "ARYA_ENTERPRISE", column: "name" },
  "tsp-scsp-type": { type: "TSP_SCSP_TYPE", column: "name" },
  "tsp-scsp-activity": { type: "TSP_SCSP_ACTIVITY", column: "name" },
  "natural-farming-activity": { type: "NATURAL_FARMING_ACTIVITY", column: "name" },
  "soil-parameter": { type: "NATURAL_FARMING_SOIL_PARAMETER", column: "name" },
  "demonstrations-on": { type: "AGRI_DRONE_DEMONSTRATIONS_ON", column: "name" },
  "publication-items": { type: "PUBLICATION_ITEM", column: "itemName" },
  "staff-category": { type: "STAFF_CATEGORY", column: "name" },
  "job-type": { type: "JOB_TYPE", column: "name" },
  "pay-level": { type: "PAY_LEVEL", column: "name" },
  "pay-scale": { type: "PAY_SCALE", column: "name" },
  "sanctioned-post": { type: "SANCTIONED_POST", column: "name" },
  discipline: { type: "DISCIPLINE", column: "name" },
  "bank-account-type": { type: "BANK_ACCOUNT_TYPE", column: "name" },
  season: { type: "SEASON", column: "name" },
  unit: { type: "UNIT", column: "name" },
  "crop-type": { type: "CROP_TYPE", column: "name" },
  "important-day": { type: "IMPORTANT_DAY", column: "name" },
  infrastructure: { type: "INFRASTRUCTURE_TYPE", column: "name" },
  "soil-water": { type: "SOIL_WATER_ANALYSIS_TYPE", column: "name" },
  "equipment-type": { type: "EQUIPMENT_TYPE", column: "name" },
  "vehicle-type": { type: "VEHICLE_TYPE", column: "name" },
  "asset-funding-source": { type: "ASSET_FUNDING_SOURCE", column: "name" },
  "nari-activity": { type: "NARI_ACTIVITY", column: "name" },
  "nari-nutrition-garden-type": { type: "NARI_NUTRITION_GARDEN_TYPE", column: "name" },
  "nari-crop-category": { type: "NARI_CROP_CATEGORY", column: "name" },
  "nicra-seed-fodder-bank": { type: "NICRA_SEED_FODDER_BANK", column: "name" },
  "nicra-dignitary-type": { type: "NICRA_DIGNITARY_TYPE", column: "name" },
  "nicra-pi-co-pi-type": { type: "NICRA_PI_CO_PI_TYPE", column: "name" },
  "impact-specific-area": { type: "IMPACT_SPECIFIC_AREA", column: "name" },
  "type-of-enterprise": { type: "ENTERPRISE_TYPE", column: "name" },
  "account-type": { type: "ACCOUNT_TYPE", column: "name" },
  "programme-type": { type: "PROGRAMME_TYPE", column: "name" },
  "ppv-fra-training-type": { type: "PPV_FRA_TRAINING_TYPE", column: "name" },
  "vip-dignitary": { type: "VIP_DIGNITARY", column: "name" },
};

type MasterLeafEntry = { list: ListFn; create: CreateFn; update: UpdateFn; delete: DeleteFn };

const generated: Record<string, MasterLeafEntry> = {};
for (const [slug, { type, column }] of Object.entries(SIMPLE_MASTERS)) {
  generated[slug] = simpleMasterList(type, column);
}

/**
 * Every remaining All Masters leaf whose real shape is a dedicated model
 * (a hierarchy, or more than one meaningful column) rather than the generic
 * MasterListItem shape above. Parent columns (e.g. "sectorName" on Category
 * Master) arrive as the plain text the user typed - resolved against the
 * real parent table by exact name within the zone, same pattern already
 * used for Host Org/State/District lookups elsewhere in this app. KVK
 * Master is wired directly in masters/[...slug]/page.tsx (first module done,
 * this session) and isn't part of this registry.
 */
const dedicated: Record<string, MasterLeafEntry> = {
  // --- Basic Masters ---
  "zone-master": {
    list: async () => {
      const zones = await prisma.zone.findMany({ orderBy: { name: "asc" } });
      return zones.map((z) => ({ id: z.id, zoneName: z.name }));
    },
    create: async (v) => {
      const name = reqStr(v.zoneName);
      if (!name) throw new Error("Zone name is required.");
      return prisma.zone.create({ data: { name } });
    },
    update: async (id, v) => {
      const name = reqStr(v.zoneName);
      if (!name) throw new Error("Zone name is required.");
      return prisma.zone.updateMany({ where: { id }, data: { name } });
    },
    delete: (id) => prisma.zone.deleteMany({ where: { id } }),
  },
  "state-master": {
    list: async (zoneId) => {
      const states = await prisma.state.findMany({ where: { zoneId }, include: { zone: true }, orderBy: { name: "asc" } });
      return states.map((s) => ({ id: s.id, zoneName: s.zone.name, stateName: s.name }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.stateName);
      if (!name) throw new Error("State name is required.");
      return prisma.state.create({ data: { name, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.stateName);
      if (!name) throw new Error("State name is required.");
      return prisma.state.updateMany({ where: { id, zoneId }, data: { name } });
    },
    delete: (id, zoneId) => prisma.state.deleteMany({ where: { id, zoneId } }),
  },
  "district-master": {
    list: async (zoneId) => {
      const districts = await prisma.district.findMany({
        where: { zoneId },
        include: { state: { include: { zone: true } } },
        orderBy: { name: "asc" },
      });
      return districts.map((d) => ({ id: d.id, zoneName: d.state.zone.name, stateName: d.state.name, districtName: d.name }));
    },
    create: async (v, zoneId) => {
      const stateName = reqStr(v.stateName);
      const districtName = reqStr(v.districtName);
      if (!stateName || !districtName) throw new Error("State and district name are required.");
      const state = await prisma.state.findFirst({ where: { zoneId, name: stateName } });
      if (!state) throw new Error(`Unknown state: ${stateName}`);
      return prisma.district.create({ data: { name: districtName, stateId: state.id, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const stateName = reqStr(v.stateName);
      const districtName = reqStr(v.districtName);
      if (!stateName || !districtName) throw new Error("State and district name are required.");
      const state = await prisma.state.findFirst({ where: { zoneId, name: stateName } });
      if (!state) throw new Error(`Unknown state: ${stateName}`);
      return prisma.district.updateMany({ where: { id, zoneId }, data: { name: districtName, stateId: state.id } });
    },
    delete: (id, zoneId) => prisma.district.deleteMany({ where: { id, zoneId } }),
  },
  "institute-master": {
    list: async (zoneId) => {
      const rows = await prisma.institute.findMany({
        where: { zoneId },
        include: { zone: true, state: true, district: true },
        orderBy: { name: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        instituteName: r.name,
        zoneName: r.zone.name,
        stateName: r.state?.name ?? "",
        districtName: r.district?.name ?? "",
      }));
    },
    /** State/District brought back (2026-08-31, real reference finally showed them - see lib/navigation.ts) - Institute already carried optional stateId/districtId in the schema for exactly this. */
    create: async (v, zoneId) => {
      const name = reqStr(v.instituteName);
      const stateName = reqStr(v.stateName);
      const districtName = reqStr(v.districtName);
      if (!name) throw new Error("Institute name is required.");
      if (!stateName || !districtName) throw new Error("State and district are required.");
      const state = await prisma.state.findFirst({ where: { zoneId, name: stateName } });
      if (!state) throw new Error(`Unknown state: ${stateName}`);
      const district = await prisma.district.findFirst({ where: { zoneId, stateId: state.id, name: districtName } });
      if (!district) throw new Error(`Unknown district: ${districtName}`);
      return prisma.institute.create({ data: { name, zoneId, stateId: state.id, districtId: district.id } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.instituteName);
      const stateName = reqStr(v.stateName);
      const districtName = reqStr(v.districtName);
      if (!name) throw new Error("Institute name is required.");
      if (!stateName || !districtName) throw new Error("State and district are required.");
      const state = await prisma.state.findFirst({ where: { zoneId, name: stateName } });
      if (!state) throw new Error(`Unknown state: ${stateName}`);
      const district = await prisma.district.findFirst({ where: { zoneId, stateId: state.id, name: districtName } });
      if (!district) throw new Error(`Unknown district: ${districtName}`);
      return prisma.institute.updateMany({ where: { id, zoneId }, data: { name, stateId: state.id, districtId: district.id } });
    },
    delete: (id, zoneId) => prisma.institute.deleteMany({ where: { id, zoneId } }),
  },
  /** List/Edit/Delete only - Create goes through the bespoke HostMasterAddForm -> /api/host-orgs (real Zone/State/District/Institute cascade the generic 4-column form can't represent). */
  "host-master": {
    list: async (zoneId) => {
      const rows = await prisma.hostOrganization.findMany({ where: { zoneId }, orderBy: { name: "asc" } });
      return rows.map((r) => ({
        id: r.id,
        hostName: r.name,
        directorExtension: r.directorExtension ?? "",
        address: r.address ?? "",
        phone: r.officePhone ?? "",
        mobile: r.mobilePhone ?? "",
        fax: r.fax ?? "",
        email: r.email ?? "",
      }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.hostName);
      if (!name) throw new Error("Host name is required.");
      return prisma.hostOrganization.create({
        data: {
          name,
          directorExtension: reqStr(v.directorExtension) || undefined,
          address: reqStr(v.address) || undefined,
          officePhone: reqStr(v.phone) || undefined,
          mobilePhone: reqStr(v.mobile) || undefined,
          fax: reqStr(v.fax) || undefined,
          email: reqStr(v.email) || undefined,
          zoneId,
        },
      });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.hostName);
      if (!name) throw new Error("Host name is required.");
      return prisma.hostOrganization.updateMany({
        where: { id, zoneId },
        data: {
          name,
          directorExtension: reqStr(v.directorExtension) || undefined,
          address: reqStr(v.address) || undefined,
          officePhone: reqStr(v.phone) || undefined,
          mobilePhone: reqStr(v.mobile) || undefined,
          fax: reqStr(v.fax) || undefined,
          email: reqStr(v.email) || undefined,
        },
      });
    },
    delete: (id, zoneId) => prisma.hostOrganization.deleteMany({ where: { id, zoneId } }),
  },
  /** List/Edit/Delete only - Create goes through the bespoke KvkMasterAddForm -> /api/kvks (real Zone/State/District/Host Org cascade the generic 9-column form can't represent). Delete relies on the DB's own FK constraints to refuse a KVK that still has staff/users/trial records - deliberately not cascaded, a wrong delete here would silently erase a KVK's whole history. */
  "kvk-master": {
    list: async (zoneId) => {
      const kvks = await prisma.kvk.findMany({
        where: { zoneId },
        include: { state: true, district: true, hostOrg: true, zone: true, institute: true },
        orderBy: { name: "asc" },
      });
      return kvks.map((k) => ({
        id: k.id,
        zoneName: k.zone.name,
        stateName: k.state.name,
        hostOrg: k.hostOrg.name,
        districtName: k.district.name,
        instituteName: k.institute?.name ?? "",
        kvk: k.name,
        mobile: k.officePhone ?? "-",
        landline: k.landline ?? "",
        fax: k.fax ?? "-",
        email: k.email ?? "",
        address: k.address ?? "",
        sanctionYear: k.sanctionYear ? String(k.sanctionYear) : "",
      }));
    },
    create: async (v, zoneId) => {
      const { name, stateId, districtId, hostOrgId, instituteId } = await resolveKvkParents(v, zoneId);
      return prisma.kvk.create({
        data: {
          name,
          zoneId,
          stateId,
          districtId,
          hostOrgId,
          instituteId,
          officePhone: reqStr(v.mobile) || undefined,
          fax: reqStr(v.fax) || undefined,
          email: reqStr(v.email) || undefined,
          address: reqStr(v.address) || undefined,
          sanctionYear: int(v.sanctionYear),
        },
      });
    },
    update: async (id, v, zoneId) => {
      const { name, stateId, districtId, hostOrgId, instituteId } = await resolveKvkParents(v, zoneId);
      return prisma.kvk.updateMany({
        where: { id, zoneId },
        data: {
          name,
          stateId,
          districtId,
          hostOrgId,
          instituteId,
          officePhone: reqStr(v.mobile) || undefined,
          fax: reqStr(v.fax) || undefined,
          email: reqStr(v.email) || undefined,
          address: reqStr(v.address) || undefined,
          sanctionYear: int(v.sanctionYear),
        },
      });
    },
    delete: (id, zoneId) => prisma.kvk.deleteMany({ where: { id, zoneId } }),
  },

  // --- OFT & FLD Masters ---
  subject: {
    list: async (zoneId) => {
      const rows = await prisma.oftSubject.findMany({ where: { zoneId }, include: { _count: { select: { thematicAreas: true } } }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, subjectName: r.name, thematicAreasCount: String(r._count.thematicAreas), _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.subjectName);
      if (!name) throw new Error("Subject name is required.");
      return prisma.oftSubject.create({ data: { name, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.subjectName);
      if (!name) throw new Error("Subject name is required.");
      return prisma.oftSubject.updateMany({ where: { id, zoneId }, data: { name, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.oftSubject.deleteMany({ where: { id, zoneId } }),
  },
  "oft-thematic-area": {
    list: async (zoneId) => {
      const rows = await prisma.oftThematicAreaMaster.findMany({ where: { zoneId }, include: { subject: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, thematicArea: r.name, subjectName: r.subject.name, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const subject = await prisma.oftSubject.findFirst({ where: { zoneId, name: reqStr(v.subjectName) } });
      if (!subject) throw new Error(`Unknown subject: ${v.subjectName}`);
      const name = reqStr(v.thematicArea);
      if (!name) throw new Error("Thematic area name is required.");
      return prisma.oftThematicAreaMaster.create({ data: { name, subjectId: subject.id, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const subject = await prisma.oftSubject.findFirst({ where: { zoneId, name: reqStr(v.subjectName) } });
      if (!subject) throw new Error(`Unknown subject: ${v.subjectName}`);
      const name = reqStr(v.thematicArea);
      if (!name) throw new Error("Thematic area name is required.");
      return prisma.oftThematicAreaMaster.updateMany({ where: { id, zoneId }, data: { name, subjectId: subject.id, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.oftThematicAreaMaster.deleteMany({ where: { id, zoneId } }),
  },
  sector: {
    list: async (zoneId) => {
      const rows = await prisma.fldSector.findMany({ where: { zoneId }, include: { _count: { select: { categories: true } } }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, sectorName: r.name, categoriesCount: String(r._count.categories), _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.sectorName);
      if (!name) throw new Error("Sector name is required.");
      return prisma.fldSector.create({ data: { name, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.sectorName);
      if (!name) throw new Error("Sector name is required.");
      return prisma.fldSector.updateMany({ where: { id, zoneId }, data: { name, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.fldSector.deleteMany({ where: { id, zoneId } }),
  },
  "fld-thematic-area": {
    list: async (zoneId) => {
      const rows = await prisma.fldThematicAreaMaster.findMany({ where: { zoneId }, include: { sector: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, thematicAreaName: r.name, sectorName: r.sector.name, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const name = reqStr(v.thematicAreaName);
      if (!name) throw new Error("Thematic area name is required.");
      return prisma.fldThematicAreaMaster.create({ data: { name, sectorId: sector.id, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const name = reqStr(v.thematicAreaName);
      if (!name) throw new Error("Thematic area name is required.");
      return prisma.fldThematicAreaMaster.updateMany({ where: { id, zoneId }, data: { name, sectorId: sector.id, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.fldThematicAreaMaster.deleteMany({ where: { id, zoneId } }),
  },
  category: {
    list: async (zoneId) => {
      const rows = await prisma.fldCategoryMaster.findMany({
        where: { zoneId },
        include: { sector: true, _count: { select: { subCategories: true } } },
        orderBy: { name: "asc" },
      });
      return rows.map((r) => ({ id: r.id, categoryName: r.name, sectorName: r.sector.name, subCategoriesCount: String(r._count.subCategories), _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const name = reqStr(v.categoryName);
      if (!name) throw new Error("Category name is required.");
      return prisma.fldCategoryMaster.create({ data: { name, sectorId: sector.id, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const name = reqStr(v.categoryName);
      if (!name) throw new Error("Category name is required.");
      return prisma.fldCategoryMaster.updateMany({ where: { id, zoneId }, data: { name, sectorId: sector.id, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.fldCategoryMaster.deleteMany({ where: { id, zoneId } }),
  },
  "sub-category": {
    list: async (zoneId) => {
      const rows = await prisma.fldSubCategoryMaster.findMany({
        where: { zoneId },
        include: { category: { include: { sector: true } }, _count: { select: { crops: true } } },
        orderBy: { name: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        subCategoryName: r.name,
        categoryName: r.category.name,
        sectorName: r.category.sector.name,
        cropsCount: String(r._count.crops),
        _isOther: r.isOther ? "1" : "",
      }));
    },
    create: async (v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const category = await prisma.fldCategoryMaster.findFirst({ where: { sectorId: sector.id, name: reqStr(v.categoryName) } });
      if (!category) throw new Error(`Unknown category: ${v.categoryName}`);
      const name = reqStr(v.subCategoryName);
      if (!name) throw new Error("Sub category name is required.");
      return prisma.fldSubCategoryMaster.create({ data: { name, categoryId: category.id, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const category = await prisma.fldCategoryMaster.findFirst({ where: { sectorId: sector.id, name: reqStr(v.categoryName) } });
      if (!category) throw new Error(`Unknown category: ${v.categoryName}`);
      const name = reqStr(v.subCategoryName);
      if (!name) throw new Error("Sub category name is required.");
      return prisma.fldSubCategoryMaster.updateMany({ where: { id, zoneId }, data: { name, categoryId: category.id, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.fldSubCategoryMaster.deleteMany({ where: { id, zoneId } }),
  },
  /** Sector brought back to this leaf's form (2026-08-31, real reference) - same role as Sub-category Master's own Sector field: narrows Category, validated server-side via sector->category lookup, not stored as its own column (Crop's category already implies a sector through its own real relation). */
  crop: {
    list: async (zoneId) => {
      const rows = await prisma.cropMaster.findMany({
        where: { zoneId },
        include: { subCategory: { include: { category: { include: { sector: true } } } } },
        orderBy: { name: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        cropName: r.name,
        subCategoryName: r.subCategory.name,
        category: r.subCategory.category.name,
        sectorName: r.subCategory.category.sector.name,
        quantityRequired: String(r.quantityRequired),
        _isOther: r.isOther ? "1" : "",
      }));
    },
    create: async (v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const category = await prisma.fldCategoryMaster.findFirst({ where: { sectorId: sector.id, name: reqStr(v.category) } });
      if (!category) throw new Error(`Unknown category: ${v.category}`);
      const subCategory = await prisma.fldSubCategoryMaster.findFirst({ where: { categoryId: category.id, name: reqStr(v.subCategoryName) } });
      if (!subCategory) throw new Error(`Unknown sub category: ${v.subCategoryName}`);
      const name = reqStr(v.cropName);
      if (!name) throw new Error("Crop name is required.");
      // quantityRequired dropped from the form/list/report (client 2026-09-04) - not written here anymore so an edit can't clobber an existing value; new rows take the schema default (false).
      return prisma.cropMaster.create({
        data: {
          name,
          subCategoryId: subCategory.id,
          zoneId,
          isOther: bool(v.__markAsOther__),
        },
      });
    },
    update: async (id, v, zoneId) => {
      const sector = await prisma.fldSector.findFirst({ where: { zoneId, name: reqStr(v.sectorName) } });
      if (!sector) throw new Error(`Unknown sector: ${v.sectorName}`);
      const category = await prisma.fldCategoryMaster.findFirst({ where: { sectorId: sector.id, name: reqStr(v.category) } });
      if (!category) throw new Error(`Unknown category: ${v.category}`);
      const subCategory = await prisma.fldSubCategoryMaster.findFirst({ where: { categoryId: category.id, name: reqStr(v.subCategoryName) } });
      if (!subCategory) throw new Error(`Unknown sub category: ${v.subCategoryName}`);
      const name = reqStr(v.cropName);
      if (!name) throw new Error("Crop name is required.");
      return prisma.cropMaster.updateMany({
        where: { id, zoneId },
        data: {
          name,
          subCategoryId: subCategory.id,
          isOther: bool(v.__markAsOther__),
        },
      });
    },
    delete: (id, zoneId) => prisma.cropMaster.deleteMany({ where: { id, zoneId } }),
  },
  "cfld-crop": {
    list: async (zoneId) => {
      const rows = await prisma.cfldCropMaster.findMany({ where: { zoneId }, orderBy: { cropName: "asc" } });
      return rows.map((r) => ({ id: r.id, season: r.season, type: r.type, cropName: r.cropName }));
    },
    create: async (v, zoneId) => {
      const cropName = reqStr(v.cropName);
      if (!cropName) throw new Error("Crop name is required.");
      return prisma.cfldCropMaster.create({ data: { season: reqStr(v.season), type: reqStr(v.type), cropName, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const cropName = reqStr(v.cropName);
      if (!cropName) throw new Error("Crop name is required.");
      return prisma.cfldCropMaster.updateMany({ where: { id, zoneId }, data: { season: reqStr(v.season), type: reqStr(v.type), cropName } });
    },
    delete: (id, zoneId) => prisma.cfldCropMaster.deleteMany({ where: { id, zoneId } }),
  },

  // --- Training Master ---
  "training-type": {
    list: async (zoneId) => {
      const rows = await prisma.trainingTypeMaster.findMany({ where: { zoneId }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, trainingType: r.name, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.trainingType);
      if (!name) throw new Error("Training type is required.");
      return prisma.trainingTypeMaster.create({ data: { name, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.trainingType);
      if (!name) throw new Error("Training type is required.");
      return prisma.trainingTypeMaster.updateMany({ where: { id, zoneId }, data: { name, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.trainingTypeMaster.deleteMany({ where: { id, zoneId } }),
  },
  "training-area": {
    list: async (zoneId) => {
      const rows = await prisma.trainingAreaMaster.findMany({ where: { zoneId }, include: { trainingType: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, trainingType: r.trainingType.name, trainingAreaName: r.name, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const type = await prisma.trainingTypeMaster.findFirst({ where: { zoneId, name: reqStr(v.trainingType) } });
      if (!type) throw new Error(`Unknown training type: ${v.trainingType}`);
      const name = reqStr(v.trainingAreaName);
      if (!name) throw new Error("Training area name is required.");
      return prisma.trainingAreaMaster.create({ data: { name, trainingTypeId: type.id, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const type = await prisma.trainingTypeMaster.findFirst({ where: { zoneId, name: reqStr(v.trainingType) } });
      if (!type) throw new Error(`Unknown training type: ${v.trainingType}`);
      const name = reqStr(v.trainingAreaName);
      if (!name) throw new Error("Training area name is required.");
      return prisma.trainingAreaMaster.updateMany({ where: { id, zoneId }, data: { name, trainingTypeId: type.id, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.trainingAreaMaster.deleteMany({ where: { id, zoneId } }),
  },
  "training-thematic-area": {
    list: async (zoneId) => {
      const rows = await prisma.trainingThematicAreaMaster.findMany({ where: { zoneId }, include: { trainingArea: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, trainingAreaName: r.trainingArea.name, thematicArea: r.name, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const area = await prisma.trainingAreaMaster.findFirst({ where: { zoneId, name: reqStr(v.trainingAreaName) } });
      if (!area) throw new Error(`Unknown training area: ${v.trainingAreaName}`);
      const name = reqStr(v.thematicArea);
      if (!name) throw new Error("Thematic area is required.");
      return prisma.trainingThematicAreaMaster.create({ data: { name, trainingAreaId: area.id, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const area = await prisma.trainingAreaMaster.findFirst({ where: { zoneId, name: reqStr(v.trainingAreaName) } });
      if (!area) throw new Error(`Unknown training area: ${v.trainingAreaName}`);
      const name = reqStr(v.thematicArea);
      if (!name) throw new Error("Thematic area is required.");
      return prisma.trainingThematicAreaMaster.updateMany({ where: { id, zoneId }, data: { name, trainingAreaId: area.id, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.trainingThematicAreaMaster.deleteMany({ where: { id, zoneId } }),
  },

  // --- Production Masters ---
  "product-type": {
    list: async (zoneId) => {
      const rows = await prisma.productTypeMaster.findMany({ where: { zoneId }, orderBy: { categoryName: "asc" } });
      return rows.map((r) => ({ id: r.id, productCategoryName: r.categoryName, productCategoryType: r.typeName, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const categoryName = reqStr(v.productCategoryName);
      const typeName = reqStr(v.productCategoryType);
      if (!categoryName || !typeName) throw new Error("Product category name and type are required.");
      return prisma.productTypeMaster.create({ data: { categoryName, typeName, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const categoryName = reqStr(v.productCategoryName);
      const typeName = reqStr(v.productCategoryType);
      if (!categoryName || !typeName) throw new Error("Product category name and type are required.");
      return prisma.productTypeMaster.updateMany({ where: { id, zoneId }, data: { categoryName, typeName, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.productTypeMaster.deleteMany({ where: { id, zoneId } }),
  },
  products: {
    list: async (zoneId) => {
      const rows = await prisma.productMaster.findMany({ where: { zoneId }, include: { productTypeMaster: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({
        id: r.id,
        productCategoryName: r.productTypeMaster.categoryName,
        productCategoryType: r.productTypeMaster.typeName,
        productName: r.name,
        quantityRequired: String(r.quantityRequired),
        _isOther: r.isOther ? "1" : "",
      }));
    },
    create: async (v, zoneId) => {
      const type = await prisma.productTypeMaster.findFirst({
        where: { zoneId, categoryName: reqStr(v.productCategoryName), typeName: reqStr(v.productCategoryType) },
      });
      if (!type) throw new Error(`Unknown product type: ${v.productCategoryName} / ${v.productCategoryType}`);
      const name = reqStr(v.productName);
      if (!name) throw new Error("Product name is required.");
      // Unit / Quantity Data Type were never persisted; quantityRequired dropped from the form/list/report (client 2026-09-04) - not written here anymore.
      return prisma.productMaster.create({
        data: {
          name,
          productTypeMasterId: type.id,
          zoneId,
          isOther: bool(v.__markAsOther__),
        },
      });
    },
    update: async (id, v, zoneId) => {
      const type = await prisma.productTypeMaster.findFirst({
        where: { zoneId, categoryName: reqStr(v.productCategoryName), typeName: reqStr(v.productCategoryType) },
      });
      if (!type) throw new Error(`Unknown product type: ${v.productCategoryName} / ${v.productCategoryType}`);
      const name = reqStr(v.productName);
      if (!name) throw new Error("Product name is required.");
      return prisma.productMaster.updateMany({
        where: { id, zoneId },
        data: {
          name,
          productTypeMasterId: type.id,
          isOther: bool(v.__markAsOther__),
        },
      });
    },
    delete: (id, zoneId) => prisma.productMaster.deleteMany({ where: { id, zoneId } }),
  },
  "cropping-system": {
    list: async (zoneId) => {
      const rows = await prisma.croppingSystemMaster.findMany({ where: { zoneId }, orderBy: { cropName: "asc" } });
      return rows.map((r) => ({ id: r.id, season: r.season, cropName: r.cropName, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const cropName = reqStr(v.cropName);
      if (!cropName) throw new Error("Crop name is required.");
      return prisma.croppingSystemMaster.create({ data: { season: reqStr(v.season), cropName, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const cropName = reqStr(v.cropName);
      if (!cropName) throw new Error("Crop name is required.");
      return prisma.croppingSystemMaster.updateMany({ where: { id, zoneId }, data: { season: reqStr(v.season), cropName, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.croppingSystemMaster.deleteMany({ where: { id, zoneId } }),
  },
  "farming-system": {
    list: async (zoneId) => {
      const rows = await prisma.farmingSystemMaster.findMany({ where: { zoneId }, orderBy: { farmingSystemName: "asc" } });
      return rows.map((r) => ({ id: r.id, season: r.season, farmingSystemName: r.farmingSystemName, _isOther: r.isOther ? "1" : "" }));
    },
    create: async (v, zoneId) => {
      const farmingSystemName = reqStr(v.farmingSystemName);
      if (!farmingSystemName) throw new Error("Farming system name is required.");
      return prisma.farmingSystemMaster.create({ data: { season: reqStr(v.season), farmingSystemName, zoneId, isOther: bool(v.__markAsOther__) } });
    },
    update: async (id, v, zoneId) => {
      const farmingSystemName = reqStr(v.farmingSystemName);
      if (!farmingSystemName) throw new Error("Farming system name is required.");
      return prisma.farmingSystemMaster.updateMany({ where: { id, zoneId }, data: { season: reqStr(v.season), farmingSystemName, isOther: bool(v.__markAsOther__) } });
    },
    delete: (id, zoneId) => prisma.farmingSystemMaster.deleteMany({ where: { id, zoneId } }),
  },

  // --- Other Masters: Resource ---
  "vehicle-present-status": {
    list: async (zoneId) => {
      const rows = await prisma.presentStatusOption.findMany({ where: { zoneId, kind: "VEHICLE" }, orderBy: { statusCode: "asc" } });
      // "Yes"/"No" (not "true"/"false") so the Edit dialog's dropdown pre-fills against the same real option list the Create form now uses (client report, 2026-08-31).
      return rows.map((r) => ({ id: r.id, statusCode: r.statusCode, statusLabel: r.statusLabel, hideInNextYear: r.hideInNextYear ? "Yes" : "No", isActive: r.isActive ? "Yes" : "No" }));
    },
    create: async (v, zoneId) => {
      const statusCode = reqStr(v.statusCode);
      if (!statusCode) throw new Error("Status code is required.");
      return prisma.presentStatusOption.create({
        data: { kind: "VEHICLE", statusCode, statusLabel: reqStr(v.statusLabel), hideInNextYear: bool(v.hideInNextYear), isActive: bool(v.isActive), zoneId },
      });
    },
    update: async (id, v, zoneId) => {
      const statusCode = reqStr(v.statusCode);
      if (!statusCode) throw new Error("Status code is required.");
      return prisma.presentStatusOption.updateMany({
        where: { id, zoneId, kind: "VEHICLE" },
        data: { statusCode, statusLabel: reqStr(v.statusLabel), hideInNextYear: bool(v.hideInNextYear), isActive: bool(v.isActive) },
      });
    },
    delete: (id, zoneId) => prisma.presentStatusOption.deleteMany({ where: { id, zoneId, kind: "VEHICLE" } }),
  },
  "equipment-present-status": {
    list: async (zoneId) => {
      const rows = await prisma.presentStatusOption.findMany({ where: { zoneId, kind: "EQUIPMENT" }, orderBy: { statusCode: "asc" } });
      // "Yes"/"No" (not "true"/"false") so the Edit dialog's dropdown pre-fills against the same real option list the Create form now uses (client report, 2026-08-31).
      return rows.map((r) => ({ id: r.id, statusCode: r.statusCode, statusLabel: r.statusLabel, hideInNextYear: r.hideInNextYear ? "Yes" : "No", isActive: r.isActive ? "Yes" : "No" }));
    },
    create: async (v, zoneId) => {
      const statusCode = reqStr(v.statusCode);
      if (!statusCode) throw new Error("Status code is required.");
      return prisma.presentStatusOption.create({
        data: { kind: "EQUIPMENT", statusCode, statusLabel: reqStr(v.statusLabel), hideInNextYear: bool(v.hideInNextYear), isActive: bool(v.isActive), zoneId },
      });
    },
    update: async (id, v, zoneId) => {
      const statusCode = reqStr(v.statusCode);
      if (!statusCode) throw new Error("Status code is required.");
      return prisma.presentStatusOption.updateMany({
        where: { id, zoneId, kind: "EQUIPMENT" },
        data: { statusCode, statusLabel: reqStr(v.statusLabel), hideInNextYear: bool(v.hideInNextYear), isActive: bool(v.isActive) },
      });
    },
    delete: (id, zoneId) => prisma.presentStatusOption.deleteMany({ where: { id, zoneId, kind: "EQUIPMENT" } }),
  },
  equipment: {
    list: async (zoneId) => {
      const rows = await prisma.equipmentMaster.findMany({ where: { zoneId }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, name: r.name, equipmentType: r.equipmentType }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.name);
      if (!name) throw new Error("Equipment name is required.");
      return prisma.equipmentMaster.create({ data: { name, equipmentType: reqStr(v.equipmentType), zoneId } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.name);
      if (!name) throw new Error("Equipment name is required.");
      return prisma.equipmentMaster.updateMany({ where: { id, zoneId }, data: { name, equipmentType: reqStr(v.equipmentType) } });
    },
    delete: (id, zoneId) => prisma.equipmentMaster.deleteMany({ where: { id, zoneId } }),
  },

  // --- Other Masters: NICRA ---
  "nicra-category": {
    list: async (zoneId) => {
      const rows = await prisma.nicraCategoryMaster.findMany({ where: { zoneId }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.name);
      if (!name) throw new Error("Category name is required.");
      return prisma.nicraCategoryMaster.create({ data: { name, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.name);
      if (!name) throw new Error("Category name is required.");
      return prisma.nicraCategoryMaster.updateMany({ where: { id, zoneId }, data: { name } });
    },
    delete: (id, zoneId) => prisma.nicraCategoryMaster.deleteMany({ where: { id, zoneId } }),
  },
  "nicra-sub-category": {
    list: async (zoneId) => {
      const rows = await prisma.nicraSubCategoryMaster.findMany({ where: { zoneId }, include: { category: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, subCategoryName: r.name, categoryName: r.category.name }));
    },
    create: async (v, zoneId) => {
      const category = await prisma.nicraCategoryMaster.findFirst({ where: { zoneId, name: reqStr(v.categoryName) } });
      if (!category) throw new Error(`Unknown category: ${v.categoryName}`);
      const name = reqStr(v.subCategoryName);
      if (!name) throw new Error("Sub category name is required.");
      return prisma.nicraSubCategoryMaster.create({ data: { name, categoryId: category.id, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const category = await prisma.nicraCategoryMaster.findFirst({ where: { zoneId, name: reqStr(v.categoryName) } });
      if (!category) throw new Error(`Unknown category: ${v.categoryName}`);
      const name = reqStr(v.subCategoryName);
      if (!name) throw new Error("Sub category name is required.");
      return prisma.nicraSubCategoryMaster.updateMany({ where: { id, zoneId }, data: { name, categoryId: category.id } });
    },
    delete: (id, zoneId) => prisma.nicraSubCategoryMaster.deleteMany({ where: { id, zoneId } }),
  },

  // --- Other Masters: Project Wise Budget ---
  "funding-agency": {
    list: async (zoneId) => {
      const rows = await prisma.fundingAgencyMaster.findMany({ where: { zoneId }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
    create: async (v, zoneId) => {
      const name = reqStr(v.name);
      if (!name) throw new Error("Agency name is required.");
      return prisma.fundingAgencyMaster.create({ data: { name, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const name = reqStr(v.name);
      if (!name) throw new Error("Agency name is required.");
      return prisma.fundingAgencyMaster.updateMany({ where: { id, zoneId }, data: { name } });
    },
    delete: (id, zoneId) => prisma.fundingAgencyMaster.deleteMany({ where: { id, zoneId } }),
  },
  "financial-project": {
    list: async (zoneId) => {
      const rows = await prisma.financialProjectMaster.findMany({ where: { zoneId }, include: { fundingAgency: true }, orderBy: { projectName: "asc" } });
      return rows.map((r) => ({ id: r.id, projectName: r.projectName, agencyName: r.fundingAgency.name }));
    },
    create: async (v, zoneId) => {
      const agency = await prisma.fundingAgencyMaster.findFirst({ where: { zoneId, name: reqStr(v.agencyName) } });
      if (!agency) throw new Error(`Unknown funding agency: ${v.agencyName}`);
      const projectName = reqStr(v.projectName);
      if (!projectName) throw new Error("Project name is required.");
      return prisma.financialProjectMaster.create({ data: { projectName, fundingAgencyId: agency.id, zoneId } });
    },
    update: async (id, v, zoneId) => {
      const agency = await prisma.fundingAgencyMaster.findFirst({ where: { zoneId, name: reqStr(v.agencyName) } });
      if (!agency) throw new Error(`Unknown funding agency: ${v.agencyName}`);
      const projectName = reqStr(v.projectName);
      if (!projectName) throw new Error("Project name is required.");
      return prisma.financialProjectMaster.updateMany({ where: { id, zoneId }, data: { projectName, fundingAgencyId: agency.id } });
    },
    delete: (id, zoneId) => prisma.financialProjectMaster.deleteMany({ where: { id, zoneId } }),
  },
};

export const MASTER_LEAF_REGISTRY: Record<string, MasterLeafEntry> = { ...generated, ...dedicated };

export const MASTER_LIST_REGISTRY: Record<string, ListFn> = Object.fromEntries(
  Object.entries(MASTER_LEAF_REGISTRY).map(([slug, entry]) => [slug, entry.list]),
);
export const MASTER_CREATE_REGISTRY: Record<string, CreateFn> = Object.fromEntries(
  Object.entries(MASTER_LEAF_REGISTRY).map(([slug, entry]) => [slug, entry.create]),
);
export const MASTER_UPDATE_REGISTRY: Record<string, UpdateFn> = Object.fromEntries(
  Object.entries(MASTER_LEAF_REGISTRY).map(([slug, entry]) => [slug, entry.update]),
);
export const MASTER_DELETE_REGISTRY: Record<string, DeleteFn> = Object.fromEntries(
  Object.entries(MASTER_LEAF_REGISTRY).map(([slug, entry]) => [slug, entry.delete]),
);
