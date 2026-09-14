import "server-only";
import { prisma } from "@/lib/prisma";
import { NF_COMPARISON_PARAMETERS, applyListFilter } from "./report-types";
import { parseResultTables } from "./oft-result-tables";

/**
 * The report shapes and pure helpers live in the dependency-free
 * lib/report-types.ts so the client preview and the browser-bundle
 * renderers can use them without pulling in this `server-only` module.
 * Re-exported here so existing server-side `@/lib/report-data` imports keep
 * resolving.
 */
export {
  isRedundantTableHeading,
  reportTableRowCount,
  type ReportScope,
  type ReportCell,
  type ReportColumn,
  type ReportGrid,
  type ReportPairList,
  type ReportBlockPart,
  type ReportBlock,
  type ReportTable,
  type ReportImage,
  type ReportSubsection,
  type ReportSection,
} from "./report-types";

import type { ReportBlock, ReportBlockPart, ReportColumn, ReportGrid, ReportImage, ReportScope, ReportSection, ReportTable } from "./report-types";
import { REPORT_SUBSECTION_BY_LEAF, reportSubsectionForLeaf, subsectionMatchesRef } from "./report-section-map";

function humanize(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object" && "toFixed" in (v as Record<string, unknown>)) return String(v);
  return String(v);
}

/**
 * Explicit real field list per model - mechanically extracted from
 * prisma/schema.prisma's own scalar fields (id/kvkId/zoneId/createdAt/
 * updatedAt/relations excluded), not guessed. Column ORDER here is field
 * declaration order in the schema, which is itself the order the client's
 * real report tends to follow for these same fields.
 */
const MODEL_FIELDS: Record<string, string[]> = {
  kvk: ["name", "address", "officePhone", "fax", "email", "sanctionYear"],
  bankAccount: ["accountType", "accountName", "bankName", "location", "accountNumber"],
  staff: ["sanctionedPost", "name", "dateOfBirth", "discipline", "payBand", "payScale", "dateOfJoining", "category", "jobType", "position", "mobile", "email", "allowances", "transferStatus"],
  staffTransfer: ["transferDate", "numberOfTransfers"],
  infrastructure: ["infrastructureName", "notYetStarted", "completedPlinthLevel", "completedLintelLevel", "completedRoofLevel", "totallyCompleted", "plinthAreaSqM", "underUse", "sourceOfFunding"],
  land: ["item", "description", "areaHa"],
  staffQuarters: ["dateOfCompletion", "whetherCompleted", "numberOfQuarters", "occupancyDetails", "remark"],
  vehicle: ["name", "registrationNo", "yearOfPurchase", "cost", "totalRun", "presentStatus", "repairingCost", "sourceOfFunding"],
  vehicleStatus: ["reportingYear", "totalRunKmHrs", "presentStatus", "repairingCost", "fundingSource", "fundingAgency"],
  equipment: ["name", "yearOfPurchase", "cost", "presentStatus", "sourceOfFund", "repairingCost"],
  equipmentStatus: ["reportingYear", "sourceOfFund", "fundingAgency", "presentStatus", "repairingCost"],
  technicalAchievementSummaryEntry: ["reportingYear", "sectionCode", "metricCode", "casteCategory", "value"],
  oft: ["reportingYear", "discipline", "staff", "thematicArea", "trialOnForm", "problemDiagnosed", "sourceOfTechnology", "productionSystem", "performanceIndicators", "finalRecommendation", "constraintsIdentified", "farmersParticipationProcess", "quantity", "unit", "noOfTrialReplicationFarmer", "startMonth", "endMonth", "criticalInput", "costOfOft", "fundingAgency", "resultSummary", "status", "generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"],
  fld: ["reportingYear", "startDate", "endDate", "category", "subCategory", "technologyDemonstrated", "status"],
  fldExtensionTraining: ["activity", "date", "activityCount", "participantCountMale", "participantCountFemale", "participantCount", "remark"],
  fldTechnicalFeedback: ["crop", "feedback"],
  training: ["reportingYear", "startDate", "endDate", "program", "title", "venue", "trainingDiscipline", "thematicArea", "clientele", "trainingType", "trainingArea", "onCampusOffCampus", "courseCoordinator", "fundingSource", "fundingAgencyName", "generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"],
  extensionActivity: ["reportingYear", "startDate", "endDate", "natureOfExtensionActivity", "noOfActivities", "noOfParticipants", "staff", "farmersGeneralMale", "farmersGeneralFemale", "farmersObcMale", "farmersObcFemale", "farmersScMale", "farmersScFemale", "farmersStMale", "farmersStFemale", "officialsGeneralMale", "officialsGeneralFemale", "officialsObcMale", "officialsObcFemale", "officialsScMale", "officialsScFemale", "officialsStMale", "officialsStFemale"],
  otherExtensionActivity: ["reportingYear", "natureOfExtensionActivity", "noOfActivities", "staff", "startDate", "endDate"],
  technologyWeekCelebration: ["startDate", "endDate", "typeOfActivities", "noOfActivities", "relatedCropTechnology", "numberOfParticipants", "generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"],
  celebrationDay: ["importantDay", "eventDate", "noOfActivities", "farmersGeneralMale", "farmersGeneralFemale", "farmersObcMale", "farmersObcFemale", "farmersScMale", "farmersScFemale", "farmersStMale", "farmersStFemale", "officialsGeneralMale", "officialsGeneralFemale", "officialsObcMale", "officialsObcFemale", "officialsScMale", "officialsScFemale", "officialsStMale", "officialsStFemale"],
  worldSoilDay: ["reportingYear", "noOfActivitiesConducted", "soilHealthCardsDistributed", "noOfVip", "vipNames", "totalParticipants", "generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"],
  poshanMaaha: ["activityDate", "activitiesConducted", "eventName", "saplingsPlanted", "vegetableKits", "participantsGirls", "participantsPublicRepresentatives", "participantsFarmWoman", "participantsFarmers", "participantsAganwadiWorkers", "participantsGovtOfficials", "totalParticipants"],
  swachhtaObservance: ["kind", "fromDate", "toDate", "totalNoOfActivitiesUndertaken", "noOfStaffs", "noOfFarmers"],
  swachhtaBudgetExpenditure: ["reportingYear", "vermicompostingVillagesCovered", "vermicompostingTotalExpenditure"],
  technologyProductProduction: ["category", "variety", "quantity"],
  soilWaterPlantAnalysis: ["startDate", "endDate", "analysis", "noOfSamplesAnalyzed", "noOfVillagesCovered", "amountRealized"],
  publication: ["itemName", "title", "authorName", "journalName"],
  humanResourceDevelopment: ["staff", "course", "startDate", "endDate", "venue", "organizer"],
  kvkAward: ["award", "amount", "achievement", "conferringAuthority"],
  scientistAward: ["headScientist", "award", "amount", "achievement", "conferringAuthority"],
  farmerAward: ["farmerName", "address", "contactNumber", "award", "amount", "achievement", "conferringAuthority"],
  cfldTechnicalParameter: ["reportingYear", "month", "season", "crop", "cropDemonstrated", "areaHa", "numberOfFarmers", "detailOfTechnologyDemonstrated", "existingFarmerPractice", "yieldFarmerFieldQha", "yieldDemoMaxQha", "yieldDemoMinQha", "yieldDemoAvgQha", "yieldGapKgHaDistrict", "yieldGapKgHaState", "yieldGapKgHaPotential", "yieldGapMinimizedPercentDistrict", "yieldGapMinimizedPercentState", "yieldGapMinimizedPercentPotential", "percentIncrease", "districtYield", "stateYield", "potentialYield", "status"],
  cfldExtensionActivity: ["season", "activitiesOrganized", "date", "placeOfActivity", "generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"],
  cfldBudgetUtilization: ["crop", "season", "overallFundAllocation"],
  cfldSocioEconomicImpact: ["cropDemonstrated", "totalProduceObtainedKg", "produceSoldKgPerHousehold", "sellingRatePerKg", "produceUsedOwnFarmKg", "produceDistributedToOthersKg", "purposeOfIncomeUtilized", "employmentGeneratedMandays"],
  nicraBasicInformation: ["rfDistrictNormal", "rfDistrictReceived", "maxTemperature", "minTemperature"],
  nicraDetails: ["cropName", "seasonName", "technologyDemonstration", "noOfFarmers"],
  nicraTraining: ["title", "startDate", "endDate", "farmersAttended"],
  nicraExtensionActivity: ["activityName", "places", "startDate", "endDate", "farmersAttended"],
  nicraIntervention: ["startDate", "endDate", "seedBankFodderBank", "crop", "variety", "quantityQuintal"],
  nicraRevenueGenerated: ["year", "revenue", "total"],
  nicraCustomHiringFarmImplement: ["farmImplementName", "farmersUsed", "areaCovered", "hoursUsed", "revenueGenerated", "repairExpenditure"],
  nicraVillageWiseVcrmc: ["villageName", "constitutionDate", "members", "meetingsOrganized", "meetingDate", "secretaryName"],
  nicraSoilHealthCard: ["startDate", "endDate", "samplesCollected", "samplesAnalysed", "shcIssued", "farmersBenefitted"],
  nicraConvergenceProgramme: ["startDate", "endDate", "scheme", "natureOfWork", "amount"],
  nicraDignitaryVisit: ["vipExperts", "name", "dateOfVisit"],
  nicraPiCoPi: ["startDate", "endDate", "piCoPi", "name"],
  aryaCurrentYearDetail: ["enterprise", "viableUnits", "closedUnits", "startDate", "endDate", "groupsFormed", "groupsActive"],
  aryaPreviousYearEvaluation: ["enterprise", "totalClosed", "closingDate", "totalRestarted", "restartedDate"],
  nfGeographicalInfo: ["startDate", "endDate", "agroClimaticZone", "farmingSituation", "latitude", "longitude"],
  nfPhysicalInfo: ["activityName", "trainingTitle", "trainingDate", "venue", "participants"],
  nfDemonstrationInfo: ["farmerName", "activityName", "crop", "variety", "farmerAddress", "farmerContact", "agroClimaticZone", "croppingPattern", "farmingSituation", "latitude", "longitude", "season", "technologyDemonstrated", "areaHa", "farmerPracticeDetail", "farmerFeedback"],
  nfAlreadyPracticing: ["farmerName", "address", "normalCropsGrown", "practicingYear", "contactNumber", "activityName", "crop", "technologyDemonstrated", "areaHa", "farmerFeedback"],
  nfBeneficiary: ["numberOfBlock", "numberOfVillage", "numberOfTraining", "farmersInfluenced"],
  nfSoilData: ["season", "type", "crop", "beforePh", "beforeEc", "beforeEcOc", "afterPh", "afterEc", "afterEcOc"],
  nfBudgetExpenditure: ["activityName", "activitiesOrganised", "budgetSanction", "budgetExpenditure", "totalBudgetExpenditure"],
  subPlanActivity: ["type", "activities", "noOfTraining", "beneficiaries"],
  nariNutritionGarden: ["nutriSmartVillage", "typeOfNutritionalGarden", "numbers", "areaSqm", "activity", "male", "female"],
  nariBioFortified: ["nutriSmartVillage", "season", "activity", "categoryOfCrop", "numberOfCrops", "male", "female"],
  nariValueAddition: ["nutriSmartVillage", "cropName", "valueAddedProduct", "activity", "numberOfProducts", "male", "female"],
  nariTraining: ["nutriSmartVillage", "areaOfTraining", "activity", "titleOfTraining", "numberOfCourses", "male", "female"],
  nariExtension: ["nutriSmartVillage", "activity", "nameOfActivity", "noOfActivities", "male", "female"],
  agriDroneIntroduction: ["year", "centreName", "companyOfDrone", "modelOfDrone", "dronesSanctioned", "dronesPurchased", "amountSanctioned", "costPerDrone", "pilotNameContact", "targetAreaHa", "amountSanctionedDemo", "amountUtilisedDemo", "areaCoveredDemoHa", "operationType", "farmersParticipated", "advantages"],
  agriDroneDemonstration: ["centreName", "district", "dateOfDemos", "placeOfDemos", "cropName", "noOfDemos", "areaCovered", "noOfFarmers"],
  fpoCbboDetail: ["noOfBlocksAllocated", "noOfFposRegistered", "trainingReceived", "businessPlanPrepared", "noOfFposDoingBusiness"],
  fpoManagement: ["registrationNo", "dateOfRegistration", "fpoName", "fpoAddress", "totalBomMembers", "financialPosition", "proposedActivity", "commodityIdentified", "areaHa", "totalFarmersAttached", "successIndicator"],
  drmrDetail: ["varietiesUsedInIp", "situations", "varietiesUsedInFp", "netReturnImprovedPractice", "netReturnFarmerPractice", "yieldKgHaIp", "yieldKgHaFp", "yiofpPercentIp", "yiofpPercentFp", "cocRsHaIp", "cocRsHaFp", "gmrRsHaIp", "gmrRsHaFp", "anmrRsHaIp", "anmrRsHaFp", "bcRatioIp", "bcRatioFp"],
  drmrActivity: ["startDate", "endDate", "training", "flds", "awarenessCamps", "distributionOfLiterature", "itemActivity", "unit", "quantity"],
  craDetail: ["season", "technologyDemonstrated", "croppingSystem", "areaHa", "noOfFarmer", "farmingSystem", "crop", "cropYieldQha", "systemProductivityQha", "totalReturnRsHa", "yieldFarmerPracticeQha"],
  craExtensionActivity: ["extensionActivity", "startDate", "endDate", "withinOrWithoutState", "exposureVisits", "farmersUnderExposure"],
  csisaDetail: ["season", "villageCovered", "blockCovered", "districtCovered", "respondent", "trailName", "areaCoveredHa", "cropName", "techOptions", "varietyName", "durationDays", "sowingDate", "harvestingDate", "maturityDays", "grainYieldQha", "costOfCultivationRsHa", "grossReturnRsHa", "netReturnRsHa", "bcr"],
  seedHubProgram: ["season", "cropName", "variety", "areaHa", "yieldHa", "qtySeedProducedQ", "qtySeedSaleOutQ", "farmersPurchased", "qtySeedSaleOutToFarmersQ", "villagesCovered", "qtySeedSaleOutOtherOrgQ", "amountGeneratedLakh", "totalAmountInProjectLakh"],
  otherProgramme: ["programmeName", "programmeDate", "venue", "purpose", "participants"],
  kvkActivityImpact: ["specificArea", "briefDetails", "farmersBenefitted", "horizontalSpread", "adoptionPercent"],
  entrepreneurshipDetail: ["entrepreneurOrEnterprise", "enterpriseType", "membersAssociated", "annualIncome"],
  successStory: ["farmerOrEntrepreneur", "experience", "majorAchievement", "storyTitle"],
  districtLevelData: ["reportingYear", "items", "information"],
  districtCropProductivity: ["season", "type", "cropName", "areaHa", "productionMt", "productivityQha", "remarks"],
  districtLivestockProduction: ["livestockName", "number", "remarks"],
  operationalAreaDetail: ["reportingYear", "taluk", "block", "village", "majorCrops", "majorProblems", "thrustAreas"],
  villageAdoptionProgramme: ["reportingYear", "village", "block", "actionTaken"],
  priorityThrustArea: ["reportingYear", "thrustArea"],
  demonstrationUnit: ["demoUnitName", "yearOfEstt", "areaSqMt", "varietyBreed", "produce", "qty", "costOfInputs", "grossIncome", "remarks"],
  instructionalFarmCrop: ["cropName", "areaHa", "season", "variety", "produceType", "qty", "costOfInputs", "grossIncome", "remarks"],
  productionUnit: ["productName", "qty", "costOfInputs", "grossIncome", "remarks"],
  instructionalFarmLivestock: ["animalName", "speciesBreed", "produceType", "qty", "costOfInputs", "grossIncome", "remarks"],
  hostelUtilization: ["months", "traineesStayed", "traineeDays", "reasonForShortFall"],
  rainWaterHarvesting: ["trainingProgrammes", "demonstrations", "plantMaterialProduced", "farmerVisits", "officialVisits"],
  budgetDetail: ["salaryAllocation", "salaryExpenditure", "generalGrantAllocation", "generalGrantExpenditure", "capitalGrantAllocation", "capitalGrantExpenditure", "generalMainGrant", "generalTsp", "generalScsp", "capitalMainGrant", "capitalTsp", "capitalScsp"],
  projectWiseBudgetPerformance: ["projectName", "accountNumber", "fundingAgency", "budgetEstimate", "budgetAllocated", "budgetReleased", "expenditure", "unspentBalance"],
  revolvingFund: ["reportingYear", "openingBalance", "incomeDuringYear", "expenditureDuringYear", "closing", "kind"],
  revenueGeneration: ["headName", "income", "sponsoringAgency"],
  resourceGeneration: ["programmeName", "purpose", "sourcesOfFund", "amountLakhs", "infrastructureCreated"],
  functionalLinkage: ["organizationName", "natureOfLinkage"],
  prevalentDiseaseCrop: ["diseaseName", "crop", "outbreakDate", "areaAffected", "commodityLossPercent", "preventiveMeasures"],
  prevalentDiseaseLivestock: ["diseaseName", "speciesAffected", "outbreakDate", "mortalityMorbidity", "animalsVaccinated", "preventiveMeasures", "areaAffected", "commodityLossPercent"],
  ppvFraTrainingProgramme: ["date", "title", "type", "venue", "resourcePerson", "participants"],
  ppvFraFarmerDetail: ["year", "crop", "registrationNo", "farmerName", "block", "district", "mobileNo", "village", "characteristics"],
  raweFetFitProgramme: ["startDate", "endDate", "attachmentType", "numberOfStudents", "daysStayed"],
  vipVisitor: ["visitDate", "dignitaryType", "ministerName", "observations"],
  digitalMobileApp: ["mobileAppsDeveloped", "appName", "appLanguage", "meantFor", "timesDownloaded"],
  digitalWebPortal: ["visitors", "farmersRegistered"],
  digitalKisanSarathi: ["farmersRegisteredKsp", "phoneCallAddressed", "answeredCall"],
  digitalKmas: ["farmersCovered", "advisoriesSent", "messagesCrop", "messagesLivestock", "messagesWeather", "messagesMarketing", "messagesAwareness", "messagesOtherEnterprises", "messagesAnyOther"],
  digitalOtherChannel: ["channel", "farmersCovered", "advisoriesSent", "messagesCrop", "messagesLivestock", "messagesWeather", "messagesMarketing", "messagesAwareness", "messagesOtherEnterprises"],
  sacMeeting: ["startDate", "endDate", "participants", "statutoryMembers", "recommendations", "actionTaken", "actionCompliance", "reason"],
  otherMeeting: ["date", "meetingType", "agenda", "representativeFromAtari"],
};

/**
 * Reporting-year Int column per model - mechanically read from
 * prisma/schema.prisma (`<field> Int` named `reportingYear` / `year` /
 * `practicingYear`), not guessed. When the report has a period bound and a
 * model appears here, its rows are filtered to that year (or `{ in: [...] }`
 * for a multi-year span). Year wins over `MODEL_PERIOD_DATE_FIELDS` because
 * it is the client's own explicit "annual reporting" key.
 */
const MODEL_PERIOD_YEAR_FIELD: Record<string, string> = {
  target: "reportingYear",
  vehicleStatus: "reportingYear",
  equipmentStatus: "reportingYear",
  technicalAchievementSummaryEntry: "reportingYear",
  oft: "reportingYear",
  fld: "reportingYear",
  training: "reportingYear",
  extensionActivity: "reportingYear",
  otherExtensionActivity: "reportingYear",
  swachhtaBudgetExpenditure: "reportingYear",
  worldSoilDay: "reportingYear",
  cfldTechnicalParameter: "reportingYear",
  nicraRevenueGenerated: "year",
  nfAlreadyPracticing: "practicingYear",
  nfBeneficiary: "reportingYear",
  agriDroneIntroduction: "year",
  districtLevelData: "reportingYear",
  operationalAreaDetail: "reportingYear",
  villageAdoptionProgramme: "reportingYear",
  priorityThrustArea: "reportingYear",
  revolvingFund: "reportingYear",
  ppvFraFarmerDetail: "year",
};

/**
 * Activity-date column(s) per model - schema-extracted `DateTime` fields,
 * with roster / point-in-time dates deliberately left out (a Staff member's
 * date of joining, a quarter's date of completion, an FPO's registration
 * date: those tables show current state, the reference never date-bounds
 * them). Where a model has both a start and an end date the bound matches on
 * either (`OR`), same as the list toolbar's From/To behaviour.
 */
const MODEL_PERIOD_DATE_FIELDS: Record<string, string[]> = {
  staffTransfer: ["transferDate"],
  oft: ["startMonth", "endMonth"],
  fld: ["startDate", "endDate"],
  fldExtensionTraining: ["date"],
  training: ["startDate", "endDate"],
  extensionActivity: ["startDate", "endDate"],
  otherExtensionActivity: ["startDate", "endDate"],
  technologyWeekCelebration: ["startDate", "endDate"],
  celebrationDay: ["eventDate"],
  poshanMaaha: ["activityDate"],
  technologyProductProduction: ["reportingDate"],
  soilWaterPlantAnalysis: ["startDate", "endDate"],
  publication: ["reportingDate"],
  humanResourceDevelopment: ["startDate", "endDate"],
  kvkAward: ["reportingDate"],
  scientistAward: ["reportingDate"],
  farmerAward: ["reportingDate"],
  cfldTechnicalParameter: ["reportingDate"],
  cfldExtensionActivity: ["date"],
  nicraBasicInformation: ["reportingDate", "startDate", "endDate"],
  nicraTraining: ["startDate", "endDate"],
  nicraExtensionActivity: ["startDate", "endDate"],
  nicraIntervention: ["startDate", "endDate"],
  nicraVillageWiseVcrmc: ["meetingDate"],
  nicraSoilHealthCard: ["startDate", "endDate"],
  nicraConvergenceProgramme: ["startDate", "endDate"],
  nicraDignitaryVisit: ["dateOfVisit"],
  nicraPiCoPi: ["startDate", "endDate"],
  aryaCurrentYearDetail: ["startDate", "endDate"],
  aryaPreviousYearEvaluation: ["closingDate", "restartedDate"],
  nfGeographicalInfo: ["startDate", "endDate"],
  nfPhysicalInfo: ["trainingDate"],
  agriDroneDemonstration: ["dateOfDemos"],
  drmrActivity: ["startDate", "endDate"],
  craExtensionActivity: ["startDate", "endDate"],
  csisaDetail: ["sowingDate", "harvestingDate"],
  otherProgramme: ["programmeDate"],
  specialProgramme: ["initiationDate"],
  sacMeeting: ["startDate", "endDate"],
  otherMeeting: ["date"],
  prevalentDiseaseCrop: ["outbreakDate"],
  prevalentDiseaseLivestock: ["outbreakDate"],
  nykTraining: ["startDate", "endDate"],
  ppvFraTrainingProgramme: ["date"],
  raweFetFitProgramme: ["startDate", "endDate"],
  vipVisitor: ["visitDate"],
  moduleImage: ["activityDate"],
};

/**
 * Every real calendar year this scope (one KVK, or the whole zone) has data
 * for, across every model the report engine period-bounds - the exact same
 * `MODEL_PERIOD_YEAR_FIELD` / `MODEL_PERIOD_DATE_FIELDS` maps `periodClause`
 * already uses, so this can never drift out of sync with what "Reporting
 * Year" actually filters. Backs the Reports / Form Management "Reporting
 * Year" checkbox list (`/api/reports/years`).
 *
 * Real bug, 2026-09-13: that checklist used to be a hardcoded "current year
 * back 5" constant (REPORT_YEAR_LIST) - any real record outside that fixed
 * window (older than 5 years, or dated into the future) could never be
 * checked, so the report would silently look like it had no data for that
 * year even though the year simply wasn't offered as an option at all.
 */
/**
 * A handful of models in the two maps above have no direct `kvkId` column -
 * they belong to a KVK only through a parent record (a Vehicle, an
 * Equipment, an Fld) or, for StaffTransfer, through a differently-named
 * column. Real bug, 2026-09-13: querying these the same way as every other
 * model (`{ kvkId }`) is an unknown-argument Prisma error, not a harmless
 * no-op - it 500'd this whole endpoint the first time a KVK Admin (who is
 * always kvkId-scoped) opened Reports. Mirrors each model's own existing
 * report-builder scope exactly (buildVehicleStatus, buildEquipmentStatus,
 * buildStaffTransferred, buildFldExtensionTraining below).
 */
const KVK_WHERE_OVERRIDE: Record<string, (kvkId: string) => Record<string, unknown>> = {
  vehicleStatus: (kvkId) => ({ vehicle: { kvkId } }),
  equipmentStatus: (kvkId) => ({ equipment: { kvkId } }),
  staffTransfer: (kvkId) => ({ fromKvkId: kvkId }),
  fldExtensionTraining: (kvkId) => ({ fld: { kvkId } }),
};

function kvkOrZoneWhere(model: string, scope: { kvkId?: string; zoneId: string }): Record<string, unknown> {
  if (!scope.kvkId) return { zoneId: scope.zoneId };
  return (KVK_WHERE_OVERRIDE[model] ?? ((kvkId: string) => ({ kvkId })))(scope.kvkId);
}

/**
 * Client report, 2026-09-13: every "Reporting Year" dropdown fed by this
 * function (OFT/FLD's own bespoke forms, every generic staticOptions
 * Reporting Year field, the Reports checkbox) visibly took a moment to fill
 * in after the rest of the form had already rendered - real, not just
 * perceived: this function fires ~69 parallel `findMany` calls (one per
 * model in the two maps above) on every single call, and this app's Neon
 * database sits in Singapore while its functions run in iad1 (US) until the
 * project is on Vercel Pro (Hobby plan ignores the app's own preferredRegion
 * setting) - every one of those 69 round trips pays that cross-region
 * latency. A short in-memory cache
 * (60s, per scope) means only the FIRST dropdown opened in a KVK's session
 * pays the full cost; every other Reporting Year field opened shortly after
 * - on the same page or a different one - resolves instantly from memory.
 * Module-level `Map`, so it only helps within one warm serverless instance
 * (Fluid Compute reuses those across requests) and never serves stale data
 * across deployments (a fresh instance starts with an empty cache); it
 * never blocks a genuinely new year from a record already being edited
 * (that value is always merged in separately by the caller, not sourced
 * from here) - the only real tradeoff is a brand-new year, from a record
 * saved less than 60s ago, taking up to that long to appear in a
 * *different* dropdown than the one that just saved it.
 */
const REPORTING_YEARS_CACHE = new Map<string, { years: string[]; expiresAt: number }>();
const REPORTING_YEARS_CACHE_TTL_MS = 60_000;

export async function distinctReportingYears(scope: {
  kvkId?: string;
  zoneId: string;
  /**
   * Client direction, 2026-09-13: a specific "Reporting Year" field (OFT's
   * own, Budget Expenditure's own, ...) should only ever offer years THAT
   * model actually has data in, not every year this KVK has entered
   * anything, anywhere, in the whole app - the two got conflated because
   * every per-model Reporting Year field and the Reports page's own
   * cross-model "which years have any data" checklist all called this same
   * function the same way. Pass the Prisma model name (matching
   * MODEL_PERIOD_YEAR_FIELD/MODEL_PERIOD_DATE_FIELDS' own keys) to scope to
   * just that model; omit it for the Reports checklist's real "union across
   * everything" need. Scoping also means far fewer round trips (one model
   * instead of ~69), so a scoped call also just runs faster.
   */
  model?: string;
}): Promise<string[]> {
  const cacheKey = `${scope.kvkId ?? `zone:${scope.zoneId}`}:${scope.model ?? "*"}`;
  const cached = REPORTING_YEARS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.years;

  const years = await computeDistinctReportingYears(scope);
  REPORTING_YEARS_CACHE.set(cacheKey, { years, expiresAt: Date.now() + REPORTING_YEARS_CACHE_TTL_MS });
  return years;
}

async function computeDistinctReportingYears(scope: {
  kvkId?: string;
  zoneId: string;
  model?: string;
}): Promise<string[]> {
  const years = new Set<number>();

  // A model with a real reporting-year column wins over its date fields too
  // (same precedence `periodClause` itself applies), so a model listed in
  // both maps below is only ever queried once, via its year column.
  const yearFieldModels = Object.entries(MODEL_PERIOD_YEAR_FIELD).filter(
    ([model]) => !scope.model || model === scope.model,
  );
  const dateFieldModels = Object.entries(MODEL_PERIOD_DATE_FIELDS).filter(
    ([model]) => !MODEL_PERIOD_YEAR_FIELD[model] && (!scope.model || model === scope.model),
  );

  await Promise.all([
    ...yearFieldModels.map(async ([model, field]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (prisma as any)[model];
      if (!delegate?.findMany) return;
      const rows: Record<string, number | null>[] = await delegate.findMany({
        where: kvkOrZoneWhere(model, scope),
        distinct: [field],
        select: { [field]: true },
      });
      for (const row of rows) {
        const y = row[field];
        if (typeof y === "number" && Number.isFinite(y)) years.add(y);
      }
    }),
    ...dateFieldModels.map(async ([model, fields]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (prisma as any)[model];
      if (!delegate?.findMany) return;
      const select: Record<string, boolean> = {};
      for (const f of fields) select[f] = true;
      const rows: Record<string, Date | null>[] = await delegate.findMany({
        where: kvkOrZoneWhere(model, scope),
        select,
      });
      for (const row of rows) {
        for (const f of fields) {
          const d = row[f];
          if (d instanceof Date) years.add(d.getFullYear());
        }
      }
    }),
  ]);

  return Array.from(years)
    .sort((a, b) => b - a)
    .map(String);
}

/** Calendar years touched by an inclusive [from, to] range (either bound may be absent). */
function yearsInRange(fromDate?: string, toDate?: string): number[] {
  const y1 = fromDate ? Number(fromDate.slice(0, 4)) : undefined;
  const y2 = toDate ? Number(toDate.slice(0, 4)) : undefined;
  const lo = y1 ?? y2;
  const hi = y2 ?? y1;
  if (lo == null || hi == null || Number.isNaN(lo) || Number.isNaN(hi)) return [];
  const out: number[] = [];
  for (let y = Math.min(lo, hi); y <= Math.max(lo, hi); y++) out.push(y);
  return out;
}

/**
 * The Prisma `where` fragment that bounds a model's rows to the report's
 * reporting period. Empty object when the report has no period set, or the
 * model has neither a reporting-year nor an activity-date column (roster /
 * master tables just return their full contents, as the reference does).
 */
function periodClause(scope: ReportScope, model: string): Record<string, unknown> {
  const yearField = MODEL_PERIOD_YEAR_FIELD[model];
  const dateFields = MODEL_PERIOD_DATE_FIELDS[model];

  // "Reporting Year" checkbox multi-select - an explicit, possibly
  // non-contiguous set of calendar years. Wins over fromDate/toDate.
  if (scope.years && scope.years.length > 0) {
    const years = scope.years;
    if (yearField) {
      return years.length === 1 ? { [yearField]: years[0] } : { [yearField]: { in: years } };
    }
    if (!dateFields || dateFields.length === 0) return {};
    const ors = years.flatMap((y) =>
      dateFields.map((f) => ({
        [f]: {
          gte: new Date(`${y}-01-01T00:00:00.000Z`),
          lte: new Date(`${y}-12-31T23:59:59.999Z`),
        },
      })),
    );
    return ors.length === 1 ? ors[0] : { OR: ors };
  }

  if (!scope.fromDate && !scope.toDate) return {};

  if (yearField) {
    const years = yearsInRange(scope.fromDate, scope.toDate);
    if (years.length === 1) return { [yearField]: years[0] };
    if (years.length > 1) return { [yearField]: { in: years } };
    return {};
  }

  if (!dateFields || dateFields.length === 0) return {};
  const range: Record<string, Date> = {};
  if (scope.fromDate) range.gte = new Date(`${scope.fromDate}T00:00:00.000Z`);
  if (scope.toDate) range.lte = new Date(`${scope.toDate}T23:59:59.999Z`);
  return dateFields.length === 1
    ? { [dateFields[0]]: range }
    : { OR: dateFields.map((f) => ({ [f]: range })) };
}

/**
 * The standard "this one KVK, or the whole zone" report filter, plus the
 * reporting-period bound. Drop-in replacement for the bare
 * `scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId }` ternary
 * that every list-style builder used, so the Reports / Form Management
 * From-To filter actually reaches the data.
 */
function scopeAndPeriod(scope: ReportScope, model: string): Record<string, unknown> {
  return {
    ...(scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId }),
    ...periodClause(scope, model),
  };
}

type ScopeMode = "direct" | { via: string };

/**
 * `custom` covers the tables whose real shape (super-v2-prod.pdf) is a
 * State/KVK-grouped aggregate rather than a flat per-record dump of one
 * model's own columns - `model`/`scope` are unused for these (kept required
 * on the type only so every other entry stays a plain object literal).
 */
/**
 * A custom builder may return just `columns`/`rows` (the common case) or,
 * for the reference layouts that aren't a flat grid, `totalRow` /
 * `noSerial` / `blocks` (repeating per-entity) / `pairs` (numbered
 * label/value list). `fetchTable` fills the rest of the ReportTable in.
 */
type CustomTableResult = {
  columns?: ReportColumn[];
  rows?: Record<string, string>[];
  totalRow?: Record<string, string>;
  noSerial?: boolean;
  keepEmpty?: boolean;
  caption?: string;
  blocks?: ReportBlock[];
  pairs?: { num?: string; label: string; value: string }[];
};

/**
 * `groupCode`/`groupTitle`, when set, become the ReportTable's intermediate
 * heading (e.g. "1.1.A KVKs Details" above sub-tables "1.1.A.1" / "1.1.A.2")
 * and the TOC links there instead of to each sub-table. `model`/`scope` are
 * unused for `custom` entries (kept required on the type so every other
 * entry stays a plain object literal).
 */
type Entry = {
  code: string;
  title: string;
  groupCode?: string;
  groupTitle?: string;
  model: string;
  scope: ScopeMode;
  custom?: (scope: ReportScope) => Promise<CustomTableResult>;
};

/**
 * The 5 OFT sector groups of "2.1. State wise details" (super-v2-prod.pdf
 * p.21-24). `db` is the OftSubject master row name (used to resolve that
 * group's thematic areas); `letter` + `title` are the reference's own
 * A)-E) section headers, which differ from the master names in wording.
 */
const OFT_SUBJECTS = [
  { letter: "A", db: "Technologies Assessed under Various Crops by KVKs (Crop Production)", title: "Technologies Assessed under Various Crops by KVKs (Crop Production)" },
  { letter: "B", db: "Technologies assessed under livestock and fisheries", title: "Technologies Assessed under Livestock and Fisheries by KVKs" },
  { letter: "C", db: "Technologies assessed under various enterprises", title: "Technologies Assessed under various Enterprises by KVKs" },
  { letter: "D", db: "Technologies assessed under women empowerment (Home science)", title: "Technologies Assessed under various Enterprises for Women Empowerment" },
  { letter: "E", db: "Technologies assessed under various crops (Horticulture crops)", title: "Technologies Assessed under various Crops (Horticulture crops.)" },
];
const OFT_SUBJECT_ORDER = OFT_SUBJECTS.map((s) => s.db);
const OFT_METRIC_LABELS = ["No. of technologies assessed", "No. of Locations", "No. of Trial/Replications"] as const;

/**
 * "2.2.A OFT Summary" in the real report (super-v2-prod.pdf p.21-24) is a
 * State x Sector x Thematic Area pivot ("Technology Assessed by KVK"), not a
 * flat dump of Oft's own columns - confirmed directly against that PDF, not
 * guessed. The A-E sector grouping comes from OftSubject/
 * OftThematicAreaMaster, whose seeded names match the real report's A)-E)
 * groups thematic-area-for-thematic-area.
 *
 * Caveat (flagged, not asserted as certain): the real report never defines
 * "No. of technologies assessed" / "Locations" / "Trial/Replications"
 * precisely. This reads them as: technologies assessed = count of Oft
 * records in that thematic area, Locations = distinct KVKs, Trial/
 * Replications = sum of noOfTrialReplicationFarmer. Worth checking against
 * the client's own numbers once real OFT data exists in both states.
 */
async function buildOftTechnologySummary(scope: ReportScope): Promise<CustomTableResult> {
  const [subjects, oftRows, states] = await Promise.all([
    prisma.oftSubject.findMany({
      where: { zoneId: scope.zoneId, name: { in: OFT_SUBJECT_ORDER } },
      // super-v2-prod.pdf lists the thematic-area rows alphabetically within each A-E block.
      include: { thematicAreas: { orderBy: { name: "asc" } } },
    }),
    prisma.oft.findMany({
      where: scopeAndPeriod(scope, "oft"),
      select: {
        thematicArea: true,
        discipline: true,
        noOfTrialReplicationFarmer: true,
        kvkId: true,
        kvk: { select: { name: true, state: { select: { name: true } } } },
        reportingYear: true,
        staff: true,
        trialOnForm: true,
        problemDiagnosed: true,
        status: true,
      },
    }),
    prisma.state.findMany({ where: { zoneId: scope.zoneId }, orderBy: { name: "asc" } }),
  ]);

  const stateNames = states.map((s) => s.name);
  // Real bug fix, 2026-09-14 - this state x thematic-area matrix is one of
  // 3 tables the OFT list's own download narrows to (2.2.A/B/C, all tagged
  // model:"oft"), but only 2.2.C (KVK Wise Details) pre-filtered its raw
  // records - selecting one OFT and downloading still showed this summary
  // matrix built from every OFT record. Same field keys as buildOftKvkWiseDetails.
  const filteredOftRows = applyListFilter(oftRows, scope, {
    kvk: (r) => r.kvk?.name ?? "",
    reportingYear: (r) => String(r.reportingYear),
    staff: (r) => r.staff,
    trialOnForm: (r) => r.trialOnForm,
    problemDiagnosed: (r) => r.problemDiagnosed ?? "",
    status: (r) => (r.status === "COMPLETED" ? "Completed" : r.status === "TRANSFERRED" ? "Transferred to Next Year" : "Ongoing"),
  });
  type Row = (typeof oftRows)[number];

  /** "No. of technologies assessed" = count of OFT records; "Locations" = distinct KVKs; "Trial/Replications" = sum of noOfTrialReplicationFarmer (the reference never defines these - flagged). */
  const metricsFor = (rows: Row[]): [number, number, number] => [
    rows.length,
    new Set(rows.map((r) => r.kvkId)).size,
    rows.reduce((sum, r) => sum + (r.noOfTrialReplicationFarmer ?? 0), 0),
  ];

  /**
   * Single-KVK report (kvk-report...pdf p.12-14): the same A-E thematic
   * matrix but no state split, 3 plain columns, "SubTotal" / "Grand Total"
   * and no separate discipline block. Super Admin keeps the state x metric
   * groups + "Sub Total (X)" / "Grand Total (F)" + discipline block.
   */
  const singleKvk = !!scope.kvkId;
  const groupNames = singleKvk ? ["Total"] : [...stateNames, "Total"];

  const matrixColumns: ReportColumn[] = singleKvk
    ? [
        { key: "sector", label: "Sector wise Thematic Area" },
        { key: "Total|0", label: "No. of technologies assessed" },
        { key: "Total|1", label: "No. of Locations" },
        { key: "Total|2", label: "No. of Trial/Replication/Farmer" },
      ]
    : [
        { key: "sector", label: "Sector wise Thematic Area" },
        ...groupNames.flatMap((group) =>
          OFT_METRIC_LABELS.map((label, mi) => ({ key: `${group}|${mi}`, label, groups: [group] })),
        ),
      ];
  const keysFor = (rows: Row[]) => {
    const out: Record<string, string> = {};
    for (const group of groupNames) {
      const scoped = group === "Total" ? rows : rows.filter((r) => r.kvk.state.name === group);
      metricsFor(scoped).forEach((v, mi) => (out[`${group}|${mi}`] = String(v)));
    }
    return out;
  };
  const addInto = (acc: Record<string, number>, row: Record<string, string>) => {
    for (const group of groupNames) OFT_METRIC_LABELS.forEach((_, mi) => (acc[`${group}|${mi}`] = (acc[`${group}|${mi}`] ?? 0) + Number(row[`${group}|${mi}`])));
  };
  const numToStr = (acc: Record<string, number>, label: string) => ({
    sector: label,
    ...Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, String(v)])),
  });

  // The thematic-area master carries one placeholder row ("Others Thematic
  // Area Upload By ATARI") that both reference PDFs print simply as "Others,
  // if any".
  const thematicLabel = (name: string) =>
    name.trim() === "Others Thematic Area Upload By ATARI" ? "Others, if any" : name;

  const matrixRows: Record<string, string>[] = [];
  const grand: Record<string, number> = {};
  for (const { letter, db, title } of OFT_SUBJECTS) {
    const subject = subjects.find((s) => s.name === db);
    matrixRows.push({ sector: `${letter}) ${title}` });
    const subTotal: Record<string, number> = {};
    for (const area of subject?.thematicAreas ?? []) {
      const row = { sector: thematicLabel(area.name), ...keysFor(filteredOftRows.filter((r) => r.thematicArea === area.name)) };
      matrixRows.push(row);
      addInto(subTotal, row);
      addInto(grand, row);
    }
    matrixRows.push(numToStr(subTotal, singleKvk ? "SubTotal" : `Sub Total (${letter})`));
  }
  matrixRows.push(numToStr(grand, singleKvk ? "Grand Total" : "Grand Total (F)"));

  const matrixBlock: ReportBlock = {
    heading: singleKvk ? "2.2.A OFT Summary" : "2.1. State wise details of On Farm Trials (OFTs) conducted by KVKs",
    parts: [{ kind: "grid", noSerial: true, columns: matrixColumns, rows: matrixRows }],
  };
  if (singleKvk) return { columns: matrixColumns, rows: matrixRows, noSerial: true };

  // --- "Technology Assessed by KVK (Discipline wise)" - Super Admin only ---
  const disciplineColumns: ReportColumn[] = [
    { key: "sector", label: "Discipline" },
    ...OFT_METRIC_LABELS.map((label, mi) => ({ key: `Total|${mi}`, label })),
  ];
  const disciplineRows = [...groupInto(filteredOftRows, (r) => r.discipline).entries()]
    // Drop rows for OFT records that never had a discipline set - they render
    // as a stray blank/"0" row the reference never shows.
    .filter(([discipline]) => discipline != null && String(discipline).trim() !== "" && String(discipline).trim() !== "0")
    .map(([discipline, rows]) => ({
      sector: discipline,
      ...Object.fromEntries(metricsFor(rows).map((v, mi) => [`Total|${mi}`, String(v)])),
    }));

  return {
    blocks: [
      {
        heading: "Technology Assessed by KVK (Discipline wise)",
        parts: [{ kind: "grid", noSerial: true, columns: disciplineColumns, rows: disciplineRows }],
      },
      matrixBlock,
    ],
  };
}

const OFT_DEMOGRAPHIC_FIELDS = ["generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"] as const;

/**
 * "2.2.B State Wise OFT Details" (super-v2-prod.pdf p.24) - state-wise
 * rollup of the Farmers Details block (General/OBC/SC/ST x M/F) added to
 * Oft this session. Column order (category x gender, Total last) confirmed
 * from the reference's own row totals: the sum of the 8 category values
 * equals the last number in every one of its rows.
 */
/** super-v2-prod.pdf's caste-column labels for the "No. of Farmers" block (General M / General F / OBC M ...). */
const CASTE_GENDER_LABELS = ["General M", "General F", "OBC M", "OBC F", "SC M", "SC F", "ST M", "ST F"];

async function buildOftStateWiseDetails(scope: ReportScope): Promise<CustomTableResult> {
  const [rawOftRows, states] = await Promise.all([
    prisma.oft.findMany({
      where: scopeAndPeriod(scope, "oft"),
      select: {
        generalMale: true, generalFemale: true, obcMale: true, obcFemale: true,
        scMale: true, scFemale: true, stMale: true, stFemale: true,
        kvk: { select: { name: true, state: { select: { name: true } } } },
        reportingYear: true,
        staff: true,
        trialOnForm: true,
        problemDiagnosed: true,
        status: true,
      },
    }),
    prisma.state.findMany({ where: { zoneId: scope.zoneId }, orderBy: { name: "asc" } }),
  ]);
  // Real bug fix, 2026-09-14 - same 2.2 subsection issue as buildOftTechnologySummary above.
  const oftRows = applyListFilter(rawOftRows, scope, {
    kvk: (r) => r.kvk?.name ?? "",
    reportingYear: (r) => String(r.reportingYear),
    staff: (r) => r.staff,
    trialOnForm: (r) => r.trialOnForm,
    problemDiagnosed: (r) => r.problemDiagnosed ?? "",
    status: (r) => (r.status === "COMPLETED" ? "Completed" : r.status === "TRANSFERRED" ? "Transferred to Next Year" : "Ongoing"),
  });

  const columns: ReportColumn[] = [
    { key: "state", label: "States" },
    ...OFT_DEMOGRAPHIC_FIELDS.map((f, i) => ({ key: f, label: CASTE_GENDER_LABELS[i], groups: ["No. of Farmers"] })),
    { key: "total", label: "Total" },
  ];

  const rowFor = (scoped: typeof oftRows) => {
    const row: Record<string, string> = {};
    let total = 0;
    for (const f of OFT_DEMOGRAPHIC_FIELDS) {
      const sum = scoped.reduce((s, r) => s + r[f], 0);
      row[f] = String(sum);
      total += sum;
    }
    row.total = String(total);
    return row;
  };

  return {
    columns,
    noSerial: true,
    rows: states.map((s) => ({ state: s.name, ...rowFor(oftRows.filter((r) => r.kvk.state.name === s.name)) })),
    totalRow: { state: "Total", ...rowFor(oftRows) },
  };
}

/**
 * "2.2.C KVK Wise OFT Details" (super-v2-prod.pdf p.25-35): per trial, a
 * "2.2.C.n. OFT (Discipline)" heading, a KVK sub-heading before each KVK's
 * first trial, two bullet lines (Thematic area / Problem definition), the
 * 18-point numbered field list, then "B. Results with Table and good quality
 * photographs in jpg." - the OFT's Dynamic Result Tables (Oft.resultTablesJson,
 * one grid per "Table n") followed by a Result / Remark line.
 */
function buildOftKvkWiseDetails(codePrefix: string) {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
  const rawOfts = await prisma.oft.findMany({
    where: scopeAndPeriod(scope, "oft"),
    include: { kvk: { select: { name: true } }, technologyOptions: { orderBy: { id: "asc" } } },
    orderBy: [{ kvkId: "asc" }, { id: "asc" }],
  });
  // Real bug fix, 2026-09-14: one block per trial (both the KVK-scoped and
  // zone-level tables use this same builder) - always `blocks`, which the
  // generic client-side filter narrowing skips. Field keys match the list's
  // own column keys (page.tsx's "oft" row mapping).
  const ofts = applyListFilter(rawOfts, scope, {
    kvk: (r) => r.kvk?.name ?? "",
    reportingYear: (r) => String(r.reportingYear),
    staff: (r) => r.staff,
    trialOnForm: (r) => r.trialOnForm,
    problemDiagnosed: (r) => r.problemDiagnosed ?? "",
    status: (r) => (r.status === "COMPLETED" ? "Completed" : r.status === "TRANSFERRED" ? "Transferred to Next Year" : "Ongoing"),
  });

  const num = (v: unknown) => (v === null || v === undefined ? "-" : String(v));
  const text = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
    return s === "" ? "-" : s;
  };
  // super-v2-prod.pdf prints "OFT Start on" / "OFT End on" as "Mon YYYY" (e.g. "Mar 2025").
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthYear = (v: Date | null | undefined) => (v ? `${MON[new Date(v).getMonth()]} ${new Date(v).getFullYear()}` : "-");

  let lastKvk: string | null = null;
  const blocks: ReportBlock[] = [];
  ofts.forEach((oft, index) => {
    const kvkName = oft.kvk?.name ?? "";
    // super-v2-prod.pdf prints the KVK name centred, once, above that KVK's run of OFT blocks.
    if (kvkName && kvkName !== lastKvk) {
      blocks.push({ heading: kvkName, align: "center", parts: [] });
      lastKvk = kvkName;
    }
    const notes: string[] = [];
    notes.push(`• Thematic area: ${text(oft.thematicArea)}`);
    notes.push(`• Problem definition/Name of OFT: ${text(oft.trialOnForm)}`);

    const techOptions =
      oft.technologyOptions.length > 0
        ? oft.technologyOptions.map((t) => `${t.label}:${t.description}`).join("\n")
        : "-";

    const pairs = [
      { num: "1.", label: "Title of On farm Trial", value: text(oft.trialOnForm) },
      { num: "2.", label: "Problem diagnosed", value: text(oft.problemDiagnosed) },
      { num: "3.", label: "Details of technologies selected for assessment/refinement (Mention either Assessed)", value: techOptions },
      { num: "4.", label: "Source of Technology (ICAR/ AICRP/SAU/other, please specify)", value: text(oft.sourceOfTechnology) },
      { num: "5.", label: "Production system", value: text(oft.productionSystem) },
      { num: "6.", label: "Thematic area", value: text(oft.thematicArea) },
      { num: "7.", label: "Performance indicators of the technology", value: text(oft.performanceIndicators) },
      { num: "8.", label: "Final recommendation for micro level situation", value: text(oft.finalRecommendation) },
      { num: "9.", label: "Constraints identified and feedback for research", value: text(oft.constraintsIdentified) },
      { num: "10.", label: "Process of farmers participation and their reaction", value: text(oft.farmersParticipationProcess) },
      { num: "11.", label: "Quantity", value: num(oft.quantity != null ? stringifyValue(oft.quantity) : null) },
      { num: "12.", label: "Unit", value: text(oft.unit) },
      // 50pg kvk-report labels this "/Farmer"; super-v2-prod.pdf's 93pg does not.
      { num: "13.", label: scope.kvkId ? "No. of Trial/Replication/Farmer" : "No. of Trial/Replication", value: num(oft.noOfTrialReplicationFarmer) },
      { num: "14.", label: "OFT Start on", value: monthYear(oft.startMonth) },
      { num: "15.", label: "OFT End on", value: monthYear(oft.endMonth) },
      { num: "16.", label: "Critical Input", value: text(oft.criticalInput) },
      { num: "17.", label: "Cost of OFT", value: num(oft.costOfOft) },
      { num: "18.", label: "Funding Agency", value: text(oft.fundingAgency) },
    ];

    const disc = text(oft.discipline);
    const heading = /^OFT\s*\(/i.test(disc)
      ? `${codePrefix}.${index + 1}. ${disc}`
      : `${codePrefix}.${index + 1}. OFT (${disc})`;

    // "B. Results with Table and good quality photographs in jpg." - the OFT's
    // own Dynamic Result Tables (one grid per user-defined "Table n"), then a
    // Result / Remark line. Table 1 is always present (seeded from the trial's
    // Technology Options when the user never edited it).
    const resultTables = parseResultTables(
      oft.resultTablesJson,
      oft.technologyOptions.map((t) => t.label),
    );
    const parts: ReportBlockPart[] = [{ kind: "pairs", pairs }];
    resultTables.forEach((t, ti) => {
      parts.push({
        kind: "grid",
        noSerial: true,
        keepEmpty: true,
        caption: ti === 0 ? `B. Results with Table and good quality photographs in jpg.\n${t.name}` : t.name,
        columns: t.columns.map((c, ci) => ({ key: `c${ci}`, label: c })),
        rows: t.rows.map((r) => Object.fromEntries(t.columns.map((_, ci) => [`c${ci}`, r[ci] ?? ""]))),
      });
    });
    const resultLine = text(oft.resultSummary);
    const remarkLine = text(oft.remark);
    if (resultLine !== "-" || remarkLine !== "-") {
      parts.push({
        kind: "pairs",
        flow: true,
        pairs: [
          ...(resultLine !== "-" ? [{ label: "Result:", value: resultLine }] : []),
          ...(remarkLine !== "-" ? [{ label: "Remark:", value: remarkLine }] : []),
        ],
      });
    }

    blocks.push({ heading, notes, parts });
  });

  return { blocks };
  };
}

/**
 * 2.3.D "Extension & Training activities under FLD" (super-v2-prod.pdf
 * p.37) - flat, joined to the parent FLD's name + KVK. Male/Female columns
 * added (client direction, 2026-09-13) alongside the real reference's own
 * "Participants" total - a pre-existing row has neither (that split can't
 * be reconstructed after the fact), so both print blank there rather than
 * a guessed number.
 */
async function buildFldExtensionTraining(scope: ReportScope): Promise<CustomTableResult> {
  const rows = await prisma.fldExtensionTraining.findMany({
    where: scope.kvkId ? { fld: { kvkId: scope.kvkId } } : { zoneId: scope.zoneId },
    include: { fld: { select: { technologyDemonstrated: true, kvk: { select: { name: true } } } } },
    orderBy: [{ fld: { kvkId: "asc" } }, { date: "asc" }],
  });
  // Real columns confirmed against super-v2-prod.pdf p.37-38: Sl., KVK, FLD,
  // Activity, Date, No. of activities, Participants (one plain total, not
  // split), Remarks - the form's own Male/Female split (client direction,
  // 2026-09-13) is a live UI convenience there only; the report keeps its
  // already-verified single "Participants" column, same total the form's
  // own server computes as participantCountMale + participantCountFemale.
  const columns: ReportColumn[] = [
    { key: "kvk", label: "KVK" },
    { key: "fld", label: "FLD" },
    { key: "activity", label: "Activity" },
    { key: "date", label: "Date" },
    { key: "activityCount", label: "No. of activities" },
    { key: "participants", label: "Participants" },
    { key: "remarks", label: "Remarks" },
  ];
  return {
    columns,
    rows: rows.map((r) => ({
      kvk: r.fld?.kvk?.name ?? "",
      fld: r.fld?.technologyDemonstrated ?? "",
      activity: r.activity,
      date: stringifyValue(r.date),
      activityCount: String(r.activityCount),
      participants: String(r.participantCount),
      remarks: r.remark ?? "",
    })),
  };
}

/** 2.3.E "Technical Feedback on FLD" (super-v2-prod.pdf p.37-38) - flat, joined to the parent FLD's name + KVK. */
async function buildFldTechnicalFeedback(scope: ReportScope): Promise<CustomTableResult> {
  const rows = await prisma.fldTechnicalFeedback.findMany({
    where: scope.kvkId ? { fld: { kvkId: scope.kvkId } } : { zoneId: scope.zoneId },
    include: { fld: { select: { technologyDemonstrated: true, kvk: { select: { name: true } } } } },
    orderBy: [{ fld: { kvkId: "asc" } }, { id: "asc" }],
  });
  const columns: ReportColumn[] = [
    { key: "kvk", label: "KVK" },
    { key: "fld", label: "FLD" },
    { key: "crop", label: "Crop" },
    { key: "feedback", label: "Technical feedback" },
  ];
  return {
    columns,
    rows: rows.map((r) => ({
      kvk: r.fld?.kvk?.name ?? "",
      fld: r.fld?.technologyDemonstrated ?? "",
      crop: r.crop,
      feedback: r.feedback,
    })),
  };
}

// ---------------------------------------------------------------------------
// Section 2 cluster G: Soil/Water Testing, Publications, HRD, Awards.
// Transcribed from super-v2-prod.pdf pages 53-55.
// ---------------------------------------------------------------------------

/** Keeps first-seen key order, unlike Object.groupBy - the reference lists KVKs/items in insertion order, not sorted. */
function groupInto<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** States a report covers, from the DB (never a hardcoded list) - shared by every state-wise pivot. */
async function reportStates(zoneId: string): Promise<string[]> {
  const states = await prisma.state.findMany({ where: { zoneId }, orderBy: { name: "asc" } });
  return states.map((s) => s.name);
}

/**
 * 2.9.A "Analysis Details" (super-v2-prod.pdf p.53) - state x analysis-type
 * pivot with per-state Totals and a Grand Total. Analysis types come from
 * the Soil Water Analysis Master (falling back to the distinct values
 * actually recorded, then to the standard SWP taxonomy only if both are
 * empty). "Farmers benefitted" = sum of the 8 caste/gender counts.
 */
const SWP_ANALYSIS_FALLBACK = ["Soil", "Water", "Plant", "Fertilizers", "Manures", "Food", "Others"];

async function buildSoilWaterAnalysis(scope: ReportScope): Promise<CustomTableResult> {
  if (scope.kvkId) {
    // kvk-report p.24: one row per analysis record - KVK / Analysis / Samples
    // analysed through / counts / Amount realized / farmer caste M/F block +
    // Total M/F/T / Start-End date, with a Grand Total row.
    const rows = await prisma.soilWaterPlantAnalysis.findMany({
      where: { kvkId: scope.kvkId },
      select: {
        analysis: true, samplesAnalyzedThrough: true, noOfSamplesAnalyzed: true, noOfVillagesCovered: true,
        amountRealized: true, startDate: true, endDate: true, ...CASTE_SELECT, kvk: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    });
    const columns: ReportColumn[] = [
      { key: "kvk", label: "KVK" },
      { key: "analysis", label: "Analysis" },
      { key: "through", label: "Samples analysed through" },
      { key: "samples", label: "No. of samples analysed" },
      { key: "villages", label: "No. of villages covered" },
      { key: "amount", label: "Amount realized (₹)" },
      ...casteMfTotalColumns("No. of farmers benefitted"),
      { key: "start", label: "Start date" },
      { key: "end", label: "End date" },
    ];
    if (rows.length === 0) return { columns, keepEmpty: true, caption: "Detail of Soil, Water and Plant analysis" };
    const rowOf = (r: (typeof rows)[number]) => ({
      kvk: r.kvk.name,
      analysis: r.analysis,
      through: r.samplesAnalyzedThrough ?? "",
      samples: String(r.noOfSamplesAnalyzed),
      villages: String(r.noOfVillagesCovered),
      amount: stringifyValue(r.amountRealized),
      ...casteMfTotalRow([r]),
      start: stringifyValue(r.startDate),
      end: stringifyValue(r.endDate),
    });
    return {
      columns,
      noSerial: false,
      caption: "Detail of Soil, Water and Plant analysis",
      rows: rows.map(rowOf),
      totalRow: {
        kvk: "Grand Total", analysis: "", through: "",
        samples: String(rows.reduce((s, r) => s + r.noOfSamplesAnalyzed, 0)),
        villages: String(rows.reduce((s, r) => s + r.noOfVillagesCovered, 0)),
        amount: String(rows.reduce((s, r) => s + Number(r.amountRealized ?? 0), 0)),
        ...casteMfTotalRow(rows),
        start: "", end: "",
      },
    };
  }
  const [rows, stateNames, masterTypes] = await Promise.all([
    prisma.soilWaterPlantAnalysis.findMany({
      where: { zoneId: scope.zoneId },
      select: {
        analysis: true,
        noOfSamplesAnalyzed: true,
        noOfVillagesCovered: true,
        generalMale: true, generalFemale: true, obcMale: true, obcFemale: true,
        scMale: true, scFemale: true, stMale: true, stFemale: true,
        kvk: { select: { state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
    prisma.masterListItem.findMany({
      where: { zoneId: scope.zoneId, type: "SOIL_WATER_ANALYSIS_TYPE" },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const fromData = [...new Set(rows.map((r) => (r.analysis ?? "").trim()).filter(Boolean))];
  const analysisTypes = (
    masterTypes.length > 0 ? masterTypes.map((m) => m.name) : fromData.length > 0 ? fromData : SWP_ANALYSIS_FALLBACK
  )
    // Types come from the DB; only their display order follows the report's fixed sequence (Soil, Water, Plant, ...), with anything extra after, alphabetically.
    .slice()
    .sort((a, b) => {
      const rank = (v: string) => {
        const i = SWP_ANALYSIS_FALLBACK.findIndex((f) => v.toLowerCase().startsWith(f.toLowerCase()));
        return i === -1 ? SWP_ANALYSIS_FALLBACK.length : i;
      };
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  const farmersOf = (r: (typeof rows)[number]) =>
    r.generalMale + r.generalFemale + r.obcMale + r.obcFemale + r.scMale + r.scFemale + r.stMale + r.stFemale;

  const columns: ReportColumn[] = [
    { key: "state", label: "State" },
    { key: "analysis", label: "Analysis" },
    { key: "samples", label: "No. of Samples analyzed" },
    { key: "villages", label: "No. of Villages covered" },
    { key: "farmers", label: "No. of Farmers benefitted" },
  ];
  const out: Record<string, string>[] = [];
  const grand = { samples: 0, villages: 0, farmers: 0 };

  for (const state of stateNames) {
    const inState = rows.filter((r) => r.kvk?.state?.name === state);
    const stateTotal = { samples: 0, villages: 0, farmers: 0 };
    analysisTypes.forEach((type, index) => {
      const matching = inState.filter((r) => (r.analysis ?? "").trim().toLowerCase() === type.toLowerCase());
      const samples = matching.reduce((s, r) => s + r.noOfSamplesAnalyzed, 0);
      const villages = matching.reduce((s, r) => s + r.noOfVillagesCovered, 0);
      const farmers = matching.reduce((s, r) => s + farmersOf(r), 0);
      stateTotal.samples += samples;
      stateTotal.villages += villages;
      stateTotal.farmers += farmers;
      out.push({
        state: index === 0 ? state : "",
        analysis: type,
        samples: String(samples),
        villages: String(villages),
        farmers: String(farmers),
      });
    });
    out.push({
      state: "",
      analysis: `Total (${state})`,
      samples: String(stateTotal.samples),
      villages: String(stateTotal.villages),
      farmers: String(stateTotal.farmers),
    });
    grand.samples += stateTotal.samples;
    grand.villages += stateTotal.villages;
    grand.farmers += stateTotal.farmers;
  }

  return {
    columns,
    rows: out,
    noSerial: true,
    caption: "Detail of Soil, Water and Plant analysis",
    totalRow: {
      analysis: "Grand Total",
      samples: String(grand.samples),
      villages: String(grand.villages),
      farmers: String(grand.farmers),
    },
  };
}

/**
 * 2.10.A "Publications" (super-v2-prod.pdf p.53-54 and kvk-report p.25) - per
 * KVK ("KVK: <name>"), grouped by Publication Item, each group its own grid
 * with item-type-specific columns: Publisher Name + ISBN Number for book
 * chapters, Journal Name + Page Number + NAAS Rating for research papers, a
 * plain Journal Name for anything else. Reads the columns added 2026-09-03.
 */
async function buildPublications(scope: ReportScope): Promise<CustomTableResult> {
  const rawRows = await prisma.publication.findMany({
    where: scopeAndPeriod(scope, "publication"),
    include: { kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { itemName: "asc" }, { id: "asc" }],
  });
  type P = (typeof rawRows)[number];
  // Real bug fix, 2026-09-14: always `blocks` (per-KVK, then per-item-type),
  // which the generic client-side filter narrowing skips. Field keys match
  // the list's own column keys (page.tsx's "publications" row mapping).
  const rows = applyListFilter(rawRows, scope, {
    kvk: (r: P) => r.kvk.name,
    itemName: (r: P) => r.itemName,
    title: (r: P) => r.title,
    authorName: (r: P) => r.authorName,
    journalName: (r: P) => r.journalName ?? "",
  });
  const yearOf = (r: P) => (r.reportingDate ? String(new Date(r.reportingDate).getFullYear()) : "");
  const base: ReportColumn[] = [
    { key: "year", label: "Publication Year" },
    { key: "title", label: "Title" },
    { key: "author", label: "Author Name" },
  ];
  const colsFor = (itemName: string): ReportColumn[] => {
    const n = itemName.toLowerCase();
    if (n.includes("book")) return [...base, { key: "publisher", label: "Publisher Name" }, { key: "isbn", label: "ISBN Number" }];
    if (n.includes("research") || n.includes("paper"))
      return [...base, { key: "journal", label: "Journal Name" }, { key: "page", label: "Page Number" }, { key: "naas", label: "NAAS Rating" }];
    return [...base, { key: "journal", label: "Journal Name" }];
  };
  const rowFor = (r: P) => ({
    year: yearOf(r), title: r.title, author: r.authorName,
    journal: r.journalName ?? "", publisher: r.publisherName ?? "", isbn: r.isbnNumber ?? "",
    page: r.pageNumber ?? "", naas: r.naasRating ?? "",
  });
  const blocks: ReportBlock[] = [...groupInto(rows, (r) => r.kvk?.name ?? "").entries()].map(([kvkName, recs]) => ({
    heading: `KVK: ${kvkName}`,
    parts: [...groupInto(recs, (r) => r.itemName).entries()].map(([itemName, items]) => ({
      kind: "grid" as const,
      titleBands: [`Publication Item: ${itemName}`],
      columns: colsFor(itemName),
      rows: items.map(rowFor),
    })),
  }));
  return { blocks };
}

/** 2.11.A "Human Resources Development" (super-v2-prod.pdf p.54) - per KVK block. Duration is the inclusive day count between Start and End Date. */
async function buildHrd(scope: ReportScope): Promise<CustomTableResult> {
  const rawRows = await prisma.humanResourceDevelopment.findMany({
    where: scopeAndPeriod(scope, "humanResourceDevelopment"),
    include: { kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { startDate: "asc" }],
  });
  // Real bug fix, 2026-09-14: always `blocks` (per-KVK), which the generic
  // client-side filter narrowing skips. Field keys match the list's own
  // column keys (page.tsx's "hrd" row mapping).
  const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const rows = applyListFilter(rawRows, scope, {
    kvk: (r) => r.kvk.name,
    staff: (r) => r.staff,
    course: (r) => r.course,
    startDate: (r) => dateStr(r.startDate),
    endDate: (r) => dateStr(r.endDate),
    venue: (r) => r.venue ?? "",
    organizer: (r) => r.organizer ?? "",
  });
  const durationDays = (a: Date | null, b: Date | null) => {
    if (!a || !b) return "";
    const days = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1;
    return days > 0 ? String(days) : "";
  };
  const hrdColumns: ReportColumn[] = [
    { key: "staff", label: "Name of Staff and designation" },
    { key: "course", label: "Name of course/training program attended" },
    { key: "start", label: "Start Date" },
    { key: "end", label: "End Date" },
    { key: "duration", label: "Duration" },
    { key: "organizer", label: "Organizer" },
    { key: "venue", label: "Venue" },
  ];
  if (rows.length === 0) return { columns: hrdColumns, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(rows, (r) => r.kvk?.name ?? "").entries()].map(
    ([kvkName, recs]) => ({
      heading: kvkName,
      parts: [
        {
          kind: "grid" as const,
          columns: hrdColumns,
          rows: recs.map((r) => ({
            staff: r.staff,
            course: r.course,
            start: stringifyValue(r.startDate),
            end: stringifyValue(r.endDate),
            duration: durationDays(r.startDate, r.endDate),
            organizer: r.organizer ?? "",
            venue: r.venue ?? "",
          })),
        },
      ],
    }),
  );
  return { blocks };
}

/** 2.12.B / 2.12.C - "Total Award" is the count of award rows per (KVK, person), not a dumped column (super-v2-prod.pdf p.55). */
function buildAwardCountByPerson(
  model: "scientistAward" | "farmerAward",
  personField: "headScientist" | "farmerName",
  personLabel: string,
) {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, any>[] = await (prisma as any)[model].findMany({
      where: scopeAndPeriod(scope, model),
      include: { kvk: { select: { name: true } } },
      orderBy: { kvk: { name: "asc" } },
    });
    const counts = groupInto(rows, (r) => `${r.kvk?.name ?? ""}||${r[personField] ?? ""}`);
    return {
      columns: [
        { key: "kvk", label: "Name of the KVK" },
        { key: "person", label: personLabel },
        { key: "total", label: "Total Award" },
      ],
      rows: [...counts.values()].map((group) => ({
        kvk: group[0].kvk?.name ?? "",
        person: group[0][personField] ?? "",
        total: String(group.length),
      })),
    };
  };
}

/**
 * The 7 FLD sectors in super-v2-prod.pdf's fixed order (p.35-37). `key` is
 * the string stored on FldDemonstrationDetail.sector (this app's FLD Sector
 * Master); `label` is the reference's display text (only "Livestock &
 * Fisheries" differs - "&" vs "and"). `stateCols` is that sector's own
 * sub-column set in "2.3.B State wise details": most report farmers/demo/
 * area, Livestock relabels area as "Unit", and Other Enterprises / Women
 * Empowerment carry only farmers + "No. of Implements" (the demo count).
 */
type FldStateCol = { key: "farmers" | "demo" | "area"; label: string };
const FLD_COLS_AREA: FldStateCol[] = [
  { key: "farmers", label: "No. of farmers" },
  { key: "demo", label: "No. of demo" },
  { key: "area", label: "Area (ha)" },
];
const FLD_SECTORS: { key: string; label: string; stateCols: FldStateCol[] }[] = [
  { key: "Crop Production", label: "Crop Production", stateCols: FLD_COLS_AREA },
  { key: "Horticultural Crops", label: "Horticultural Crops", stateCols: FLD_COLS_AREA },
  {
    key: "Livestock and Fisheries",
    label: "Livestock & Fisheries",
    stateCols: [
      { key: "farmers", label: "No. of farmers" },
      { key: "demo", label: "No. of demo" },
      { key: "area", label: "Unit" },
    ],
  },
  {
    key: "Other Enterprises",
    label: "Other Enterprises",
    stateCols: [
      { key: "farmers", label: "No. of farmers" },
      { key: "demo", label: "No. of Implements" },
    ],
  },
  {
    key: "Women Empowerment",
    label: "Women Empowerment",
    stateCols: [
      { key: "farmers", label: "No. of farmers" },
      { key: "demo", label: "No. of Implements" },
    ],
  },
  { key: "Farm Implements and Machinery", label: "Farm Implements and Machinery", stateCols: FLD_COLS_AREA },
  { key: "Crop Hybrid Varieties", label: "Crop Hybrid Varieties", stateCols: FLD_COLS_AREA },
];

/**
 * Sum of the 8 caste/gender fields every Fld record carries directly (its
 * own "Farmers Details" block) - the real "No. of beneficiaries"/"No. of
 * farmers" source now that these builders read Fld itself, not the always-
 * empty FldDemonstrationDetail (see the real bug fix note above
 * buildFldSectorSummary).
 */
function fldFarmersOf(d: CasteRecord): number {
  return d.generalMale + d.generalFemale + d.obcMale + d.obcFemale + d.scMale + d.scFemale + d.stMale + d.stFemale;
}
/** Fld has no separate `areaHa` column - "Area (ha)" is just its own Quantity when Unit is "Ha" (the Add FLD form's own rule, fld-form.tsx: Number-unit sectors report a count, every area-based sector reports Quantity in Ha). Non-Ha rows (a count, or an "Other" crop's free-text unit) contribute 0 here, same as they'd have no real area value in any source. */
function fldAreaOf(d: { unit: string | null; quantity: unknown }): number {
  return (d.unit ?? "").trim().toLowerCase() === "ha" ? Number(d.quantity ?? 0) : 0;
}

/**
 * "2.3.A FLD Summary" (super-v2-prod.pdf p.35) - a per-sector rollup of the
 * real Fld records: 7 sector rows in the fixed order plus a Total row.
 * FLDs/Demonstrations/Area/beneficiaries are plain sums; Yield in Demo/Check
 * is a demonstration-count-weighted average across the sector's rows (the
 * reference doesn't state its own formula - flagged for the client to check
 * against real multi-row data).
 *
 * Real bug fix, 2026-09-14 (client report: "database mein hai to zero kyun
 * show ho raha hai") - this used to query FldDemonstrationDetail, a schema
 * table meant for a real "one FLD, several demonstration-detail rows"
 * feature (see its own doc comment in schema.prisma) that never got a data-
 * entry UI built for it anywhere in the app - confirmed 0 rows in the whole
 * database (every real Add FLD save goes to Fld itself, not this table), so
 * every FLD Summary/State-wise/Details download showed nothing but zeros
 * for every KVK, regardless of how much real FLD data existed. Fld itself
 * already carries every field this table needs (sector, noOfDemonstration,
 * quantity+unit for area, the caste fields, yieldDemoQha/yieldCheckQha via
 * "Add Result") - querying it directly instead is a real fix, not a
 * reinterpretation of what the report should show.
 */
async function buildFldSectorSummary(scope: ReportScope): Promise<CustomTableResult> {
  const details = await prisma.fld.findMany({
    where: scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId },
    select: {
      sector: true, noOfDemonstration: true, quantity: true, unit: true,
      yieldDemoQha: true, yieldCheckQha: true, ...CASTE_SELECT,
    },
  });

  const columns: ReportColumn[] = [
    { key: "sector", label: "Sector" },
    { key: "flds", label: "No. of FLDs" },
    { key: "demos", label: "No. of Demonstrations" },
    { key: "area", label: "Area (ha)" },
    { key: "beneficiaries", label: "No. of beneficiaries" },
    { key: "yieldDemo", label: "Yield in Demo (q/ha)" },
    { key: "yieldCheck", label: "Yield in Check (q/ha)" },
  ];

  function weightedYield(rows: typeof details, key: "yieldDemoQha" | "yieldCheckQha") {
    let weightedSum = 0;
    let weight = 0;
    for (const r of rows) {
      if (r[key] === null) continue;
      const w = r.noOfDemonstration || 1;
      weightedSum += Number(r[key]) * w;
      weight += w;
    }
    return weight === 0 ? 0 : weightedSum / weight;
  }

  const rows: Record<string, string>[] = [];
  const total = { flds: 0, demos: 0, area: 0, beneficiaries: 0 };

  for (const { key, label } of FLD_SECTORS) {
    const inSector = details.filter((d) => d.sector === key);
    const flds = inSector.length;
    const demos = inSector.reduce((s, d) => s + (d.noOfDemonstration ?? 0), 0);
    const area = inSector.reduce((s, d) => s + fldAreaOf(d), 0);
    const beneficiaries = inSector.reduce((s, d) => s + fldFarmersOf(d), 0);
    total.flds += flds;
    total.demos += demos;
    total.area += area;
    total.beneficiaries += beneficiaries;
    rows.push({
      sector: label,
      flds: String(flds),
      demos: String(demos),
      area: area.toFixed(2),
      beneficiaries: String(beneficiaries),
      yieldDemo: weightedYield(inSector, "yieldDemoQha").toFixed(2),
      yieldCheck: weightedYield(inSector, "yieldCheckQha").toFixed(2),
    });
  }

  return {
    columns,
    rows,
    noSerial: true,
    totalRow: {
      sector: "Total",
      flds: String(total.flds),
      demos: String(total.demos),
      area: total.area.toFixed(2),
      beneficiaries: String(total.beneficiaries),
      yieldDemo: weightedYield(details, "yieldDemoQha").toFixed(2),
      yieldCheck: weightedYield(details, "yieldCheckQha").toFixed(2),
    },
  };
}

/**
 * "2.3.B State wise details of Front-Line Demonstration" (super-v2-prod.pdf
 * p.36) - one row per state plus a Total, each sector its own spanning
 * header group over its own sub-column set (see FLD_SECTORS): most sectors
 * carry farmers/demo/area, Livestock relabels area as "Unit", Other
 * Enterprises and Women Empowerment carry only farmers + "No. of
 * Implements". Values map: farmers = sum noOfFarmers, demo/"No. of
 * Implements" = sum noOfDemonstrations, area/"Unit" = sum areaHa.
 */
async function buildFldStateWiseDetails(scope: ReportScope): Promise<CustomTableResult> {
  // Real bug fix, 2026-09-14 - same root cause as buildFldSectorSummary
  // above (was FldDemonstrationDetail, always empty): reads the real Fld
  // records directly instead.
  const [details, states] = await Promise.all([
    prisma.fld.findMany({
      where: scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId },
      select: {
        sector: true, noOfDemonstration: true, quantity: true, unit: true, ...CASTE_SELECT,
        kvk: { select: { state: { select: { name: true } } } },
      },
    }),
    prisma.state.findMany({ where: { zoneId: scope.zoneId }, orderBy: { name: "asc" } }),
  ]);

  const sectorGroups = [...FLD_SECTORS, { key: "__total", label: "Total", stateCols: FLD_COLS_AREA }];
  const columns: ReportColumn[] = [
    { key: "state", label: "States" },
    ...sectorGroups.flatMap((sector) =>
      sector.stateCols.map((col) => ({
        key: `${sector.key}|${col.key}`,
        label: col.label,
        groups: [sector.label],
      })),
    ),
  ];

  const sumField = (list: typeof details, field: FldStateCol["key"]) => {
    if (field === "farmers") return list.reduce((s, d) => s + fldFarmersOf(d), 0);
    if (field === "demo") return list.reduce((s, d) => s + (d.noOfDemonstration ?? 0), 0);
    return list.reduce((s, d) => s + fldAreaOf(d), 0);
  };
  const fmt = (field: FldStateCol["key"], v: number) => (field === "area" ? v.toFixed(2) : String(v));

  const rowFor = (scoped: typeof details) => {
    const row: Record<string, string> = {};
    for (const sector of sectorGroups) {
      const list = sector.key === "__total" ? scoped : scoped.filter((d) => d.sector === sector.key);
      for (const col of sector.stateCols) row[`${sector.key}|${col.key}`] = fmt(col.key, sumField(list, col.key));
    }
    return row;
  };

  return {
    columns,
    noSerial: true,
    rows: states.map((s) => ({ state: s.name, ...rowFor(details.filter((d) => d.kvk.state.name === s.name)) })),
    totalRow: { state: "Total", ...rowFor(details) },
  };
}

/**
 * "2.3.C Details of Front-Line Demonstration" (super-v2-prod.pdf p.36-37) -
 * one sub-table 2.3.C.1..7 per FLD sector, each grouped by thematic area
 * ("Details of Front-Line Demonstration on <thematic area>"), each group a
 * grid of one row per (crop x state) with grouped Yield / Economics
 * headers. Farm Implements and Machinery (2.3.C.6) swaps the two Economics
 * groups for "Other Parameters" (labor / cost reduction). Missing figures
 * render as "-". Where a crop x state has several detail rows, counts are
 * summed and yield/economics are demonstration-count-weighted averages (the
 * reference's own rows are single measurements - flagged).
 */
const FLD_YIELD_GROUP = "Yield (q/ha)";
const FLD_ECON_DEMO_GROUP = "Economics of demonstration (Rs./ha)";
const FLD_ECON_CHECK_GROUP = "Economics of check (Rs./ha)";
const FLD_OTHER_PARAMS_GROUP = "Other Parameters";

function fldDetailColumns(isImplements: boolean, singleKvk = false): ReportColumn[] {
  const base: ReportColumn[] = [
    { key: "crop", label: "Crop" },
    // Single-KVK report (50pg kvk-report p.18-19): "Thematic Area" + "Name of
    // the technology demonstrated" instead of a per-state split (client,
    // 2026-09-08).
    ...(singleKvk
      ? [
          { key: "thematic", label: "Thematic Area" },
          { key: "tech", label: "Name of the technology demonstrated" },
        ]
      : [{ key: "state", label: "States" }]),
    { key: "demos", label: "No. of Demonstration" },
    { key: "farmers", label: "No. of Farmers" },
    { key: "area", label: "Area(ha)" },
    { key: "yieldDemo", label: "Demo", groups: [FLD_YIELD_GROUP] },
    { key: "yieldCheck", label: "Check", groups: [FLD_YIELD_GROUP] },
    { key: "pctInc", label: "% Increase", groups: [FLD_YIELD_GROUP] },
  ];
  if (isImplements) {
    return [
      ...base,
      { key: "labor", label: "Labor reduction (man days)", groups: [FLD_OTHER_PARAMS_GROUP] },
      { key: "cost", label: "Cost reduction (Rs./ha or Rs./)", groups: [FLD_OTHER_PARAMS_GROUP] },
    ];
  }
  return [
    ...base,
    { key: "gcDemo", label: "Gross Cost", groups: [FLD_ECON_DEMO_GROUP] },
    { key: "grDemo", label: "Gross Return", groups: [FLD_ECON_DEMO_GROUP] },
    { key: "nrDemo", label: "Net Return", groups: [FLD_ECON_DEMO_GROUP] },
    { key: "bcrDemo", label: "BCR", groups: [FLD_ECON_DEMO_GROUP] },
    { key: "gcCheck", label: "Gross Cost", groups: [FLD_ECON_CHECK_GROUP] },
    { key: "grCheck", label: "Gross Return", groups: [FLD_ECON_CHECK_GROUP] },
    { key: "nrCheck", label: "Net Return", groups: [FLD_ECON_CHECK_GROUP] },
    { key: "bcrCheck", label: "BCR", groups: [FLD_ECON_CHECK_GROUP] },
  ];
}

/**
 * Real bug fix, 2026-09-14 - same root cause as buildFldSectorSummary /
 * buildFldStateWiseDetails above: reads Fld directly instead of the always-
 * empty FldDemonstrationDetail. Fld covers every column here except the
 * "Check" (farmer-practice) economics and the Farm Implements sector's own
 * Labor/Cost reduction ("Other Parameters") - real fields that only ever
 * existed on the unused FldDemonstrationDetail schema and were never added
 * to the actual Add FLD / Add Result forms, so there's no real value to
 * read for them anywhere. They render "-" (the function's own existing
 * convention for a missing figure) rather than a guessed number; flagged
 * for the client - closing that gap for real means adding those inputs to
 * the live form first.
 */
function buildFldDetailsSubTable(sectorKey: string) {
  const isImplements = sectorKey === "Farm Implements and Machinery";
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    const [details, stateNames] = await Promise.all([
      prisma.fld.findMany({
      where: {
        sector: sectorKey,
        ...(scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId }),
      },
      select: {
        cropAnimalEnterprise: true, thematicArea: true, technologyDemonstrated: true, noOfDemonstration: true,
        quantity: true, unit: true, ...CASTE_SELECT,
        yieldDemoQha: true, yieldCheckQha: true, percentIncrease: true,
        grossCostDemo: true, grossReturnDemo: true, netReturnDemo: true, bcrDemo: true,
        category: true,
        subCategory: true,
        kvk: { select: { state: { select: { name: true } } } },
      },
      orderBy: [{ cropAnimalEnterprise: "asc" }],
      }),
      reportStates(scope.zoneId),
    ]);
    if (details.length === 0) {
      return { columns: fldDetailColumns(isImplements, !!scope.kvkId), noSerial: true, keepEmpty: true };
    }

    type Row = (typeof details)[number];
    const cropOf = (d: Row) => d.cropAnimalEnterprise?.trim() || d.technologyDemonstrated;
    const wavg = (rows: Row[], get: (d: Row) => unknown): number | null => {
      let weightedSum = 0;
      let weight = 0;
      for (const r of rows) {
        const v = get(r);
        if (v === null || v === undefined) continue;
        const w = r.noOfDemonstration || 1;
        weightedSum += Number(v) * w;
        weight += w;
      }
      return weight === 0 ? null : weightedSum / weight;
    };
    const dash = (n: number | null) => (n === null ? "-" : n.toFixed(2));

    const singleKvk = !!scope.kvkId;
    const columns = fldDetailColumns(isImplements, singleKvk);
    /** The crop-type level of the sub-heading ("Cereals of Crop Production") is the FLD's own Category (Sector -> Category -> Sub Category -> Crop cascade), falling back to Sub Category then Thematic Area. */
    const groupLabelOf = (d: Row) => d.category?.trim() || d.subCategory?.trim() || d.thematicArea?.trim() || "";
    const blocks: ReportBlock[] = [...groupInto(details, groupLabelOf).entries()].map(
      ([category, groupRows]) => {
        const crops = [...new Set(groupRows.map(cropOf))];
        const gridRows: Record<string, string>[] = [];
        for (const crop of crops) {
          // Single-KVK: one aggregated row per crop, no per-state split.
          const iters: { state: string; stateIndex: number }[] = singleKvk
            ? [{ state: "", stateIndex: 0 }]
            : stateNames.map((state, stateIndex) => ({ state, stateIndex }));
          iters.forEach(({ state, stateIndex }) => {
            const match = groupRows.filter(
              (d) => cropOf(d) === crop && (singleKvk || d.kvk.state.name === state),
            );
            const row: Record<string, string> = {
              crop: stateIndex === 0 ? crop : "",
              state,
              thematic: match[0]?.thematicArea ?? "",
              tech: match[0]?.technologyDemonstrated ?? "",
              demos: String(match.reduce((s, d) => s + (d.noOfDemonstration ?? 0), 0)),
              farmers: String(match.reduce((s, d) => s + fldFarmersOf(d), 0)),
              area: match.reduce((s, d) => s + fldAreaOf(d), 0).toFixed(2),
              yieldDemo: dash(wavg(match, (d) => d.yieldDemoQha)),
              yieldCheck: dash(wavg(match, (d) => d.yieldCheckQha)),
              pctInc: dash(wavg(match, (d) => d.percentIncrease)),
            };
            if (isImplements) {
              // No real source field for either (see the function's own doc comment above).
              row.labor = "-";
              row.cost = "-";
            } else {
              row.gcDemo = dash(wavg(match, (d) => d.grossCostDemo));
              row.grDemo = dash(wavg(match, (d) => d.grossReturnDemo));
              row.nrDemo = dash(wavg(match, (d) => d.netReturnDemo));
              row.bcrDemo = dash(wavg(match, (d) => d.bcrDemo));
              // No real "Check" (farmer-practice) economics field either.
              row.gcCheck = "-";
              row.grCheck = "-";
              row.nrCheck = "-";
              row.bcrCheck = "-";
            }
            gridRows.push(row);
          });
        }
        const sectorLabel = FLD_SECTORS.find((s) => s.key === sectorKey)?.label ?? sectorKey;
        const on = category || sectorLabel;
        return {
          // Real bug fix, 2026-09-14 - found while verifying the
          // FldDemonstrationDetail fix above (this heading was never
          // reachable before, since the table was always empty): a Crop
          // Production category value already reads "Cereals of Crop
          // Production" (confirmed against super-v2-prod.pdf p.36's own
          // real headings - "Details of Front-Line Demonstration on Cereals
          // of Crop Production", never a doubled "... of Crop Production of
          // Crop Production"), so appending " of Crop Production" again was
          // always wrong once real data reached this line.
          heading: `Details of Front-Line Demonstration on ${on}`,
          parts: [{ kind: "grid", noSerial: true, columns, rows: gridRows }],
        };
      },
    );
    return { blocks };
  };
}

// ---------------------------------------------------------------------------
// The recurring "General / OBC / SC / ST each M/F/T, then Grand Total M/F/T"
// participant block (super-v2-prod.pdf sections 2.4 / 2.5 / 2.6). One helper
// for the grouped header columns, one for aggregating a set of records that
// carry the 8 generalMale..stFemale ints.
// ---------------------------------------------------------------------------

const CASTE_GROUPS = ["General", "OBC", "SC", "ST"] as const;
const CASTE_PREFIX: Record<(typeof CASTE_GROUPS)[number], string> = { General: "general", OBC: "obc", SC: "sc", ST: "st" };
type CasteRecord = {
  generalMale: number; generalFemale: number; obcMale: number; obcFemale: number;
  scMale: number; scFemale: number; stMale: number; stFemale: number;
};

/** Grouped header columns for one "General/OBC/SC/ST each M/F/T" participant block, optionally with a trailing "Grand Total" M/F/T. `keyPrefix` lets one row carry several blocks (Farmers + Extension Officials). */
function casteMftColumns(
  participantsGroup: string,
  opts: { keyPrefix?: string; withGrand?: boolean; grandLabel?: string; flat?: boolean } = {},
): ReportColumn[] {
  const kp = opts.keyPrefix ?? "";
  const cols: ReportColumn[] = [];
  for (const caste of CASTE_GROUPS) {
    for (const g of ["M", "F", "T"] as const) {
      cols.push({ key: `${kp}${CASTE_PREFIX[caste]}${g}`, label: g, groups: opts.flat ? [caste] : [participantsGroup, caste] });
    }
  }
  if (opts.withGrand !== false) {
    for (const g of ["M", "F", "T"] as const) cols.push({ key: `${kp}grand${g}`, label: g, groups: [opts.grandLabel ?? "Grand Total"] });
  }
  return cols;
}

function casteMftRow(records: CasteRecord[], keyPrefix = "", withGrand = true): Record<string, string> {
  const s = (f: keyof CasteRecord) => records.reduce((acc, r) => acc + r[f], 0);
  const gm = s("generalMale"), gf = s("generalFemale");
  const om = s("obcMale"), ofem = s("obcFemale");
  const sm = s("scMale"), sf = s("scFemale");
  const tm = s("stMale"), tf = s("stFemale");
  const out: Record<string, string> = {
    [`${keyPrefix}generalM`]: String(gm), [`${keyPrefix}generalF`]: String(gf), [`${keyPrefix}generalT`]: String(gm + gf),
    [`${keyPrefix}obcM`]: String(om), [`${keyPrefix}obcF`]: String(ofem), [`${keyPrefix}obcT`]: String(om + ofem),
    [`${keyPrefix}scM`]: String(sm), [`${keyPrefix}scF`]: String(sf), [`${keyPrefix}scT`]: String(sm + sf),
    [`${keyPrefix}stM`]: String(tm), [`${keyPrefix}stF`]: String(tf), [`${keyPrefix}stT`]: String(tm + tf),
  };
  if (withGrand) {
    out[`${keyPrefix}grandM`] = String(gm + om + sm + tm);
    out[`${keyPrefix}grandF`] = String(gf + ofem + sf + tf);
    out[`${keyPrefix}grandT`] = String(gm + gf + om + ofem + sm + sf + tm + tf);
  }
  return out;
}

const CASTE_SELECT = {
  generalMale: true, generalFemale: true, obcMale: true, obcFemale: true,
  scMale: true, scFemale: true, stMale: true, stFemale: true,
} as const;

/** Re-keys a record's prefixed caste block (farmersGeneralMale.. / officialsGeneralMale..) into the plain CasteRecord shape casteMftRow expects. */
function prefixedCaste(r: Record<string, unknown>, prefix: "farmers" | "officials"): CasteRecord {
  const g = (suffix: string) => Number(r[`${prefix}${suffix}`] ?? 0);
  return {
    generalMale: g("GeneralMale"), generalFemale: g("GeneralFemale"),
    obcMale: g("ObcMale"), obcFemale: g("ObcFemale"),
    scMale: g("ScMale"), scFemale: g("ScFemale"),
    stMale: g("StMale"), stFemale: g("StFemale"),
  };
}
const DOUBLE_CASTE_SELECT = {
  farmersGeneralMale: true, farmersGeneralFemale: true, farmersObcMale: true, farmersObcFemale: true,
  farmersScMale: true, farmersScFemale: true, farmersStMale: true, farmersStFemale: true,
  officialsGeneralMale: true, officialsGeneralFemale: true, officialsObcMale: true, officialsObcFemale: true,
  officialsScMale: true, officialsScFemale: true, officialsStMale: true, officialsStFemale: true,
} as const;

/**
 * "2.4.A Trainings" (super-v2-prod.pdf p.38-39) - three sub-tables under one
 * heading: the state-wise participant pivot, then two "Consolidate table (On
 * & Off Campus)" breakdowns. "Training Type Wise" groups Training Type ->
 * Training Area -> Thematic Area (+ Sub Total per area); "Clientele Wise"
 * groups Clientele -> Training Area -> Thematic Area. (The PDF's own text
 * for the two consolidate tables is near-identical in structure - grouping
 * fields read literally from the titles; flagged for the client to confirm.)
 */
async function buildTrainings(scope: ReportScope): Promise<CustomTableResult> {
  const [rawTrainings, states] = await Promise.all([
    prisma.training.findMany({
      where: scopeAndPeriod(scope, "training"),
      select: {
        ...CASTE_SELECT,
        reportingYear: true, venue: true, trainingDiscipline: true, courseCoordinator: true, fundingSource: true,
        clientele: true, trainingType: true, trainingArea: true, thematicArea: true,
        onCampusOffCampus: true, title: true, program: true, startDate: true, endDate: true, fundingAgencyName: true,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
    }),
    prisma.state.findMany({ where: { zoneId: scope.zoneId }, orderBy: { name: "asc" } }),
  ]);
  type T = (typeof rawTrainings)[number];
  // Real bug fix, 2026-09-14: this table is built entirely from `blocks`
  // (state-wise + training-area/thematic-area consolidations), which the
  // generic client-side filter narrowing explicitly skips - so a filtered
  // Trainings list always downloaded every record. Field keys match the
  // list's own column keys exactly (page.tsx's "trainings" row mapping).
  const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const trainings = applyListFilter(rawTrainings, scope, {
    reportingYear: (t: T) => String(t.reportingYear),
    kvk: (t: T) => t.kvk.name,
    startDate: (t: T) => dateStr(t.startDate),
    endDate: (t: T) => dateStr(t.endDate),
    title: (t: T) => t.title,
    venue: (t: T) => t.venue ?? "",
    trainingDiscipline: (t: T) => t.trainingDiscipline ?? "",
    thematicArea: (t: T) => t.thematicArea ?? "",
    clientele: (t: T) => t.clientele ?? "",
    trainingType: (t: T) => t.trainingType ?? "",
    trainingArea: (t: T) => t.trainingArea ?? "",
    onCampusOffCampus: (t: T) => t.onCampusOffCampus ?? "",
    courseCoordinator: (t: T) => t.courseCoordinator ?? "",
    fundingSource: (t: T) => t.fundingSource ?? "",
    fundingAgencyName: (t: T) => t.fundingAgencyName ?? "",
    generalMale: (t: T) => String(t.generalMale),
    generalFemale: (t: T) => String(t.generalFemale),
    obcMale: (t: T) => String(t.obcMale),
    obcFemale: (t: T) => String(t.obcFemale),
    scMale: (t: T) => String(t.scMale),
    scFemale: (t: T) => String(t.scFemale),
    stMale: (t: T) => String(t.stMale),
    stFemale: (t: T) => String(t.stFemale),
  });

  // --- State-wise ---
  const stateColumns: ReportColumn[] = [
    { key: "row", label: "State" },
    { key: "courses", label: "No. of Courses" },
    ...casteMftColumns("No. of Participants"),
  ];
  const stateRowFor = (list: T[]) => ({ courses: String(list.length), ...casteMftRow(list) });
  const stateRows = states.map((st) => ({ row: st.name, ...stateRowFor(trainings.filter((t) => t.kvk.state.name === st.name)) }));

  // --- Consolidate: outer -> Training Area -> Thematic Area (+ Sub Total) ---
  const consolidateColumns: ReportColumn[] = [
    { key: "row", label: "Training Area with Thematic Area" },
    { key: "courses", label: "No. of Courses" },
    ...casteMftColumns("No. of Participants"),
  ];
  const label = (v: string | null) => v?.trim() || "Not specified";

  /**
   * super-v2-prod.pdf p.38-39: each `outerField` value ("Farmers and Farm
   * Women", "Rural Youth", ...) is its own headed sub-table; inside it the
   * Training Area is a banded row and each Thematic Area is a data row with a
   * "Sub Total" per area. One composite block per outer value.
   */
  const consolidateBlocks = (outerField: "trainingType" | "clientele"): ReportBlock[] => {
    const blocks: ReportBlock[] = [];
    for (const [outer, outerRows] of groupInto(trainings, (t) => label(t[outerField]))) {
      const rows: Record<string, string>[] = [];
      for (const [area, areaRows] of groupInto(outerRows, (t) => label(t.trainingArea))) {
        rows.push({ row: area });
        for (const [thematic, tRows] of groupInto(areaRows, (t) => label(t.thematicArea))) {
          rows.push({ row: thematic, courses: String(tRows.length), ...casteMftRow(tRows) });
        }
        rows.push({ row: "Sub Total", courses: String(areaRows.length), ...casteMftRow(areaRows) });
      }
      blocks.push({
        heading: outer,
        parts: [{ kind: "grid", noSerial: true, keepEmpty: true, columns: consolidateColumns, rows }],
      });
    }
    return blocks;
  };

  // --- 2.4.B "Separate On Campus and Off Campus" (50pg kvk-report p.20-27):
  // same clientele -> Training Area -> Thematic grouping as 2.4.A, but each
  // row split into an ON CAMPUS and an OFF CAMPUS column set. ---
  const isOn = (t: T) => /on[\s-]*campus/i.test(t.onCampusOffCampus ?? "");
  const campusCols = (prefix: string, campusLabel: string): ReportColumn[] => [
    { key: `${prefix}courses`, label: "No. of Courses", groups: [campusLabel] },
    ...CASTE_GROUPS.flatMap((caste) =>
      (["M", "F", "T"] as const).map((g) => ({
        key: `${prefix}${CASTE_PREFIX[caste]}${g}`,
        label: g,
        groups: [campusLabel, "No. of Participants", caste],
      })),
    ),
    ...(["M", "F", "T"] as const).map((g) => ({ key: `${prefix}tot${g}`, label: g, groups: [campusLabel, "TOTAL"] })),
  ];
  const campusCells = (list: T[], prefix: string) => {
    const m = list.reduce((a, t) => a + t.generalMale + t.obcMale + t.scMale + t.stMale, 0);
    const f = list.reduce((a, t) => a + t.generalFemale + t.obcFemale + t.scFemale + t.stFemale, 0);
    return {
      [`${prefix}courses`]: String(list.length),
      ...casteMftRow(list, prefix, false),
      [`${prefix}totM`]: String(m),
      [`${prefix}totF`]: String(f),
      [`${prefix}totT`]: String(m + f),
    };
  };
  const separateCampusBlocks = (): ReportBlock[] => {
    const cols: ReportColumn[] = [
      { key: "row", label: "Training Area with Thematic Area" },
      ...campusCols("on", "ON CAMPUS"),
      ...campusCols("off", "OFF CAMPUS"),
    ];
    const rowFor = (list: T[]) => ({ ...campusCells(list.filter(isOn), "on"), ...campusCells(list.filter((t) => !isOn(t)), "off") });
    const blocks: ReportBlock[] = [];
    for (const [outer, outerRows] of groupInto(trainings, (t) => label(t.trainingType))) {
      const rows: Record<string, string>[] = [];
      for (const [area, areaRows] of groupInto(outerRows, (t) => label(t.trainingArea))) {
        rows.push({ row: area });
        for (const [thematic, tRows] of groupInto(areaRows, (t) => label(t.thematicArea))) {
          rows.push({ row: thematic, ...rowFor(tRows) });
        }
        rows.push({ row: "Sub Total", ...rowFor(areaRows) });
      }
      blocks.push({ heading: outer, parts: [{ kind: "grid", noSerial: true, keepEmpty: true, columns: cols, rows }] });
    }
    return blocks;
  };

  // --- 2.4.C (50pg) "Sponsored Training Programmes" - one row per training
  // that has a sponsoring agency. ---
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sponsoredPart = (): ReportBlockPart => {
    const sponsored = trainings.filter((t) => (t.fundingAgencyName ?? "").trim() !== "");
    const columns: ReportColumn[] = [
      { key: "title", label: "Training title" },
      { key: "thematic", label: "Thematic area" },
      { key: "month", label: "Month" },
      { key: "duration", label: "Duration (Days)" },
      { key: "client", label: "Client(PF/RY/EF)" },
      { key: "courses", label: "No. Of Courses" },
      ...casteMftColumns("No. of Participants", { grandLabel: "Grand Total" }),
      { key: "agency", label: "Sponsoring Agency" },
    ];
    return {
      kind: "grid",
      keepEmpty: true,
      columns,
      rows: sponsored.map((t) => ({
        title: t.title,
        thematic: t.thematicArea ?? "",
        month: t.startDate ? `${MON[new Date(t.startDate).getMonth()]} ${new Date(t.startDate).getFullYear()}` : "-",
        duration:
          t.startDate && t.endDate
            ? String(Math.max(0, Math.round((+new Date(t.endDate) - +new Date(t.startDate)) / 86400000)))
            : "-",
        client: t.clientele ?? t.program ?? "-",
        courses: "1",
        ...casteMftRow([t], "", true),
        agency: t.fundingAgencyName ?? "",
      })),
      totalRow:
        sponsored.length > 0
          ? { title: "Total", courses: String(sponsored.length), ...casteMftRow(sponsored, "", true) }
          : undefined,
    };
  };

  // Single-KVK report follows the 50pg kvk-report Training layout: A (Type
  // Wise) + B (Separate On/Off Campus) + C (Sponsored Training Programmes),
  // no state-wise table, no "Clientele Wise" (client, 2026-09-08).
  if (scope.kvkId) {
    return {
      blocks: [
        { heading: "2.4.A - Consolidate table (On & Off Campus) Training Type Wise", parts: [] },
        ...consolidateBlocks("trainingType"),
        { heading: "2.4.B - Separate On Campus and Off Campus Training Type Wise", parts: [] },
        ...separateCampusBlocks(),
        { heading: "2.4.C - Sponsored Training Programmes", parts: [sponsoredPart()] },
      ],
    };
  }

  return {
    blocks: [
      // "State-wise details of training programme" only makes sense across
      // states - a single-KVK report (KVK Admin, or a Super Admin filtered
      // to one KVK) has no state dimension, and the 50pg kvk-report goes
      // straight to the Consolidate table. So it is dropped for that scope
      // (client, 2026-09-08: "kvk ke report me kahi Bihar/Jharkhand nahi").
      ...(scope.kvkId
        ? []
        : [
            {
              heading: "State-wise details of training programme",
              parts: [
                {
                  kind: "grid" as const,
                  noSerial: true,
                  columns: stateColumns,
                  rows: stateRows,
                  totalRow: { row: "Total", ...stateRowFor(trainings) },
                },
              ],
            },
          ]),
      { heading: "2.4.A - Consolidate table (On & Off Campus) Training Type Wise", parts: [] },
      ...consolidateBlocks("trainingType"),
      { heading: "2.4.C - Consolidate table (On & Off Campus) Clientele Wise", parts: [] },
      ...consolidateBlocks("clientele"),
    ],
  };
}

/**
 * "2.5.A Extension Activities" (super-v2-prod.pdf p.39-40) - two sub-tables:
 * "A. State wise details of Extension Programme" and "B. Details of various
 * extension Programmes" (by nature). Each row carries two participant blocks
 * (Farmers + Extension Officials) and a combined Total M/F/T.
 */
async function buildExtensionActivities(scope: ReportScope): Promise<CustomTableResult> {
  const [rawRows, stateNames] = await Promise.all([
    prisma.extensionActivity.findMany({
      where: scopeAndPeriod(scope, "extensionActivity"),
      select: {
        reportingYear: true, startDate: true, endDate: true, noOfParticipants: true, staff: true,
        natureOfExtensionActivity: true,
        noOfActivities: true,
        ...DOUBLE_CASTE_SELECT,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
  ]);
  type R = (typeof rawRows)[number];
  // Real bug fix, 2026-09-14: built entirely from `blocks` (state-wise +
  // by-nature groupings), which the generic client-side filter narrowing
  // skips. Field keys match the list's own column keys (page.tsx's
  // "extension-activities" row mapping).
  const dateStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const rows = applyListFilter(rawRows, scope, {
    kvk: (r: R) => r.kvk.name,
    reportingYear: (r: R) => String(r.reportingYear),
    startDate: (r: R) => dateStr(r.startDate),
    endDate: (r: R) => dateStr(r.endDate),
    natureOfExtensionActivity: (r: R) => r.natureOfExtensionActivity,
    noOfActivities: (r: R) => String(r.noOfActivities),
    noOfParticipants: (r: R) => String(r.noOfParticipants),
    staff: (r: R) => r.staff ?? "",
    farmersGeneralMale: (r: R) => String(r.farmersGeneralMale),
    farmersGeneralFemale: (r: R) => String(r.farmersGeneralFemale),
    farmersObcMale: (r: R) => String(r.farmersObcMale),
    farmersObcFemale: (r: R) => String(r.farmersObcFemale),
    farmersScMale: (r: R) => String(r.farmersScMale),
    farmersScFemale: (r: R) => String(r.farmersScFemale),
    farmersStMale: (r: R) => String(r.farmersStMale),
    farmersStFemale: (r: R) => String(r.farmersStFemale),
    officialsGeneralMale: (r: R) => String(r.officialsGeneralMale),
    officialsGeneralFemale: (r: R) => String(r.officialsGeneralFemale),
    officialsObcMale: (r: R) => String(r.officialsObcMale),
    officialsObcFemale: (r: R) => String(r.officialsObcFemale),
    officialsScMale: (r: R) => String(r.officialsScMale),
    officialsScFemale: (r: R) => String(r.officialsScFemale),
    officialsStMale: (r: R) => String(r.officialsStMale),
    officialsStFemale: (r: R) => String(r.officialsStFemale),
  });

  const mkColumns = (firstKey: string, firstLabel: string): ReportColumn[] => [
    { key: firstKey, label: firstLabel },
    { key: "activities", label: "No. of activities" },
    ...casteMftColumns("Farmers", { keyPrefix: "f", withGrand: false }),
    ...casteMftColumns("Extension Officials", { keyPrefix: "o", withGrand: false }),
    ...(["M", "F", "T"] as const).map((g) => ({ key: `tot${g}`, label: g, groups: ["Total"] })),
  ];
  const rowFor = (list: R[]) => {
    const f = casteMftRow(list.map((r) => prefixedCaste(r as Record<string, unknown>, "farmers")), "f");
    const o = casteMftRow(list.map((r) => prefixedCaste(r as Record<string, unknown>, "officials")), "o");
    return {
      activities: String(list.reduce((s, r) => s + r.noOfActivities, 0)),
      ...f,
      ...o,
      totM: String(Number(f.fgrandM) + Number(o.ograndM)),
      totF: String(Number(f.fgrandF) + Number(o.ograndF)),
      totT: String(Number(f.fgrandT) + Number(o.ograndT)),
    };
  };

  const stateColumns = mkColumns("state", "State");
  const natureColumns = mkColumns("nature", "Nature of Extension Activity");
  const natures = [...new Set(rows.map((r) => r.natureOfExtensionActivity))];

  const natureBlock = {
    kind: "grid" as const,
    noSerial: true,
    columns: natureColumns,
    rows: natures.map((n) => ({ nature: n, ...rowFor(rows.filter((r) => r.natureOfExtensionActivity === n)) })),
    totalRow: { nature: "Total", ...rowFor(rows) },
  };

  // A single-KVK report has no state dimension - the 50pg kvk-report shows
  // only "A. Details of various extension Programmes" (by nature), no
  // per-state split, no Bihar/Jharkhand (client, 2026-09-08).
  if (scope.kvkId) {
    return {
      blocks: [
        {
          heading: "A. Details of various extension Programmes",
          notes: ["(Including activities of FLD programmes)"],
          parts: [natureBlock],
        },
      ],
    };
  }

  return {
    blocks: [
      {
        heading: "A. State wise details of Extension Programme",
        notes: ["(Including activities of FLD programmes)"],
        parts: [
          {
            kind: "grid",
            noSerial: true,
            columns: stateColumns,
            rows: stateNames.map((st) => ({ state: st, ...rowFor(rows.filter((r) => r.kvk.state.name === st)) })),
            totalRow: { state: "Total", ...rowFor(rows) },
          },
        ],
      },
      { heading: "B. Details of various extension Programmes", parts: [natureBlock] },
    ],
  };
}

/** "2.5.B Other Extension Activities" (super-v2-prod.pdf p.41) - nature x state, activity counts. */
async function buildOtherExtensionActivities(scope: ReportScope): Promise<CustomTableResult> {
  const [rows, stateNames] = await Promise.all([
    prisma.otherExtensionActivity.findMany({
      where: scopeAndPeriod(scope, "otherExtensionActivity"),
      select: {
        natureOfExtensionActivity: true,
        noOfActivities: true,
        kvk: { select: { state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
  ]);
  const natures = [...new Set(rows.map((r) => r.natureOfExtensionActivity))];

  // Single-KVK report: the 50pg kvk-report shows a plain "Nature of
  // Extension Activity | No. of activities" table - no per-state columns
  // (client, 2026-09-08).
  if (scope.kvkId) {
    return {
      noSerial: true,
      columns: [
        { key: "nature", label: "Nature of Extension Activity" },
        { key: "total", label: "No. of activities" },
      ],
      rows: natures.map((nature) => ({
        nature,
        total: String(rows.filter((r) => r.natureOfExtensionActivity === nature).reduce((a, r) => a + r.noOfActivities, 0)),
      })),
      totalRow: { nature: "Total", total: String(rows.reduce((a, r) => a + r.noOfActivities, 0)) },
    };
  }

  const columns: ReportColumn[] = [
    { key: "nature", label: "Nature of Extension Activity" },
    ...stateNames.map((s) => ({ key: `st|${s}`, label: s, groups: ["No. of activities"] })),
    { key: "total", label: "Total", groups: ["No. of activities"] },
  ];
  return {
    columns,
    noSerial: true,
    rows: natures.map((nature) => {
      const forNature = rows.filter((r) => r.natureOfExtensionActivity === nature);
      const row: Record<string, string> = { nature };
      let total = 0;
      for (const s of stateNames) {
        const sum = forNature.filter((r) => r.kvk.state.name === s).reduce((a, r) => a + r.noOfActivities, 0);
        row[`st|${s}`] = String(sum);
        total += sum;
      }
      row.total = String(total);
      return row;
    }),
  };
}

/**
 * "2.6.A Technology Week" - super-v2-prod.pdf p.41 shows a per-state summary
 * (States / No. of KVKs / Activities / participants); kvk-report-202607270504.pdf
 * p.21 shows a per-record detail grid (KVK / Type of activities / No. of
 * activities / caste M/F/T participant block / Related crop-livestock technology)
 * with a Total row. Scope decides which.
 */
async function buildTechnologyWeek(scope: ReportScope): Promise<CustomTableResult> {
  if (scope.kvkId) {
    const rows = await prisma.technologyWeekCelebration.findMany({
      where: { kvkId: scope.kvkId },
      select: { typeOfActivities: true, noOfActivities: true, relatedCropTechnology: true, ...CASTE_SELECT, kvk: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const columns: ReportColumn[] = [
      { key: "kvk", label: "KVK" },
      { key: "type", label: "Type of activities" },
      { key: "acts", label: "No. of activities" },
      ...casteMftColumns("Number of participants", { grandLabel: "Total" }),
      { key: "related", label: "Related crop/livestock technology" },
    ];
    if (rows.length === 0) return { columns, noSerial: true, keepEmpty: true };
    const rowOf = (r: (typeof rows)[number]) => ({
      kvk: r.kvk.name,
      type: r.typeOfActivities,
      acts: String(r.noOfActivities),
      ...casteMftRow([r], "", true),
      related: r.relatedCropTechnology ?? "",
    });
    return {
      columns,
      noSerial: true,
      rows: rows.map(rowOf),
      totalRow: { kvk: "Total", type: "", acts: String(rows.reduce((s, r) => s + r.noOfActivities, 0)), ...casteMftRow(rows, "", true), related: "—" },
    };
  }
  const [rows, stateNames] = await Promise.all([
    prisma.technologyWeekCelebration.findMany({
      where: { zoneId: scope.zoneId },
      select: { noOfActivities: true, numberOfParticipants: true, kvkId: true, kvk: { select: { state: { select: { name: true } } } } },
    }),
    reportStates(scope.zoneId),
  ]);
  return {
    columns: [
      { key: "state", label: "States" },
      { key: "kvks", label: "No. of KVKs" },
      { key: "activities", label: "Number of Activities" },
      { key: "participants", label: "Number of participants" },
    ],
    noSerial: true,
    rows: stateNames.map((state) => {
      const inState = rows.filter((r) => r.kvk.state.name === state);
      return {
        state,
        kvks: String(new Set(inState.map((r) => r.kvkId)).size),
        activities: String(inState.reduce((s, r) => s + r.noOfActivities, 0)),
        participants: String(inState.reduce((s, r) => s + r.numberOfParticipants, 0)),
      };
    }),
  };
}

/**
 * "2.6.B Celebration Days / Important Events" - super-v2-prod.pdf p.41 is an
 * important-day x state pivot (KVKs / activities / participants); kvk-report
 * p.22 ("Important Events") is one row per event with a Farmers + Extension
 * Officials caste M/F/T block, a Total M/F/T, and a "Sub-total - <KVK>" row.
 */
async function buildCelebrationDays(scope: ReportScope): Promise<CustomTableResult> {
  if (scope.kvkId) {
    const rows = await prisma.celebrationDay.findMany({
      where: { kvkId: scope.kvkId },
      select: { importantDay: true, noOfActivities: true, ...DOUBLE_CASTE_SELECT, kvk: { select: { name: true } } },
    });
    if (rows.length === 0) return {};
    type KR = (typeof rows)[number];
    const columns: ReportColumn[] = [
      { key: "day", label: "Important Events" },
      { key: "acts", label: "No. of activities" },
      ...casteMftColumns("Farmers", { keyPrefix: "f", withGrand: false }),
      ...casteMftColumns("Extension Officials", { keyPrefix: "o", withGrand: false }),
      ...(["M", "F", "T"] as const).map((g) => ({ key: `tot${g}`, label: g, groups: ["Total"] })),
    ];
    const rowFor = (list: KR[]) => {
      const f = casteMftRow(list.map((r) => prefixedCaste(r as Record<string, unknown>, "farmers")), "f");
      const o = casteMftRow(list.map((r) => prefixedCaste(r as Record<string, unknown>, "officials")), "o");
      return {
        acts: String(list.reduce((s, r) => s + r.noOfActivities, 0)),
        ...f,
        ...o,
        totM: String(Number(f.fgrandM) + Number(o.ograndM)),
        totF: String(Number(f.fgrandF) + Number(o.ograndF)),
        totT: String(Number(f.fgrandT) + Number(o.ograndT)),
      };
    };
    const kvkName = rows[0].kvk.name;
    const days = [...new Set(rows.map((r) => r.importantDay))];
    return {
      columns,
      noSerial: true,
      rows: days.map((day) => ({ day, ...rowFor(rows.filter((r) => r.importantDay === day)) })),
      totalRow: { day: `Sub-total — ${kvkName}`, ...rowFor(rows) },
    };
  }
  const [rows, stateNames] = await Promise.all([
    prisma.celebrationDay.findMany({
      where: { zoneId: scope.zoneId },
      select: {
        importantDay: true,
        noOfActivities: true,
        kvkId: true,
        ...DOUBLE_CASTE_SELECT,
        kvk: { select: { state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
  ]);
  type R = (typeof rows)[number];
  const groups = [...stateNames, "Total"];
  const subCols = [
    { key: "kvks", label: "No. of KVKs celebrate" },
    { key: "acts", label: "No. of Activities" },
    { key: "parts", label: "No. of Participants" },
  ];
  const columns: ReportColumn[] = [
    { key: "day", label: "Important Days" },
    ...groups.flatMap((g) => subCols.map((c) => ({ key: `${g}|${c.key}`, label: c.label, groups: [g] }))),
  ];
  const participants = (r: R) => {
    const f = prefixedCaste(r as unknown as Record<string, unknown>, "farmers");
    const o = prefixedCaste(r as unknown as Record<string, unknown>, "officials");
    const sum = (x: CasteRecord) => x.generalMale + x.generalFemale + x.obcMale + x.obcFemale + x.scMale + x.scFemale + x.stMale + x.stFemale;
    return sum(f) + sum(o);
  };
  const cellsFor = (list: R[]) => {
    const out: Record<string, string> = {};
    for (const g of groups) {
      const scoped = g === "Total" ? list : list.filter((r) => r.kvk.state.name === g);
      out[`${g}|kvks`] = String(new Set(scoped.map((r) => r.kvkId)).size);
      out[`${g}|acts`] = String(scoped.reduce((s, r) => s + r.noOfActivities, 0));
      out[`${g}|parts`] = String(scoped.reduce((s, r) => s + participants(r), 0));
    }
    return out;
  };
  const days = [...new Set(rows.map((r) => r.importantDay))];
  return {
    columns,
    noSerial: true,
    rows: days.map((day) => ({ day, ...cellsFor(rows.filter((r) => r.importantDay === day)) })),
  };
}

/** One KVK block: a per-record grid + a per-KVK "Total" row. Shared by 2.6.C / 2.6.D. */
function perKvkBlocks<R extends { kvk: { name: string } }>(
  records: R[],
  columns: ReportColumn[],
  rowOf: (r: R, index: number) => Record<string, string>,
  totalOf: (list: R[], firstKey: string) => Record<string, string> | null,
): ReportBlock[] {
  const firstKey = columns[0].key;
  return [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => {
    const rows = list.map((r, i) => rowOf(r, i));
    const total = totalOf(list, firstKey);
    return {
      heading: kvkName,
      parts: [{ kind: "grid" as const, noSerial: true, columns, rows, ...(total ? { totalRow: total } : {}) }],
    };
  });
}

/**
 * "2.6.C World Soil Day" (super-v2-prod.pdf p.40-41) - per KVK: a grid of
 * Year / activities / SHCs / farmers-benefitted (caste M/F/T) / VIPs / VIP
 * names / total participants, a per-KVK Total row, then a "Grand Total (all
 * KVKs)" block.
 */
async function buildWorldSoilDay(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.worldSoilDay.findMany({
    where: scopeAndPeriod(scope, "worldSoilDay"),
    select: {
      reportingYear: true, noOfActivitiesConducted: true, soilHealthCardsDistributed: true,
      noOfVip: true, vipNames: true, totalParticipants: true, ...CASTE_SELECT,
      kvk: { select: { name: true } },
    },
    orderBy: [{ kvkId: "asc" }, { reportingYear: "asc" }],
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14: the Super Admin (zone-level) view is always
  // `blocks` (per-KVK), which the generic client-side filter narrowing
  // skips - the KVK-scoped view is already a flat grid and was fine. Field
  // keys match the list's own column keys (page.tsx's "world-soil-day" row
  // mapping) - reportingYear there is rendered as a date picker, so the
  // list's own filter checklist shows "yyyy-01-01", not a bare year.
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    reportingYear: (r: R) => (r.reportingYear !== null ? `${r.reportingYear}-01-01` : ""),
    noOfActivitiesConducted: (r: R) => String(r.noOfActivitiesConducted),
    soilHealthCardsDistributed: (r: R) => String(r.soilHealthCardsDistributed),
    noOfVip: (r: R) => String(r.noOfVip),
    vipNames: (r: R) => r.vipNames ?? "",
    totalParticipants: (r: R) => String(r.totalParticipants),
  });

  const columns: ReportColumn[] = [
    { key: "sl", label: "Sl." },
    { key: "year", label: "Year" },
    { key: "acts", label: "No. of Activity conducted" },
    { key: "shc", label: "Soil Health Cards distributed" },
    ...casteMftColumns("No. of Farmers Benefitted", { withGrand: false }),
    { key: "vips", label: "No. of VIPs" },
    { key: "vipNames", label: "Name(s) of VIP(s) involved if any" },
    { key: "participants", label: "Total No. of Participants attended the program" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: R, index: number) => ({
    sl: String(index + 1),
    year: r.reportingYear != null ? String(r.reportingYear) : "",
    acts: String(r.noOfActivitiesConducted),
    shc: String(r.soilHealthCardsDistributed),
    ...casteMftRow([r], "", false),
    vips: String(r.noOfVip),
    vipNames: r.vipNames ?? "",
    participants: String(r.totalParticipants),
  });
  const totalOf = (list: R[], slLabel: string): Record<string, string> => ({
    sl: slLabel,
    year: "",
    acts: String(list.reduce((s, r) => s + r.noOfActivitiesConducted, 0)),
    shc: String(list.reduce((s, r) => s + r.soilHealthCardsDistributed, 0)),
    ...casteMftRow(list, "", false),
    vips: String(list.reduce((s, r) => s + r.noOfVip, 0)),
    vipNames: "",
    participants: String(list.reduce((s, r) => s + r.totalParticipants, 0)),
  });

  // Single-KVK report (kvk-report 1.6.B): one plain grid with a trailing
  // "Total" row, no per-KVK band and no "all KVKs" grand total.
  if (scope.kvkId) {
    return {
      columns,
      noSerial: true,
      rows: records.map((r, i) => rowOf(r, i)),
      totalRow: totalOf(records, "Total"),
    };
  }
  return {
    blocks: [
      ...perKvkBlocks(records, columns, rowOf, (list) => totalOf(list, "Total")),
      { heading: "Grand Total (all KVKs)", parts: [{ kind: "grid", noSerial: true, columns, rows: [totalOf(records, "")] }] },
    ],
  };
}

/** "2.6.D Poshan Maah" (super-v2-prod.pdf p.41) - per KVK, one row per datewise activity. */
async function buildPoshanMaah(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.poshanMaaha.findMany({
    where: scopeAndPeriod(scope, "poshanMaaha"),
    select: {
      activityDate: true, activitiesConducted: true, eventName: true, saplingsPlanted: true, vegetableKits: true,
      totalParticipants: true, participantsGirls: true, participantsFarmWoman: true, participantsFarmers: true,
      participantsAganwadiWorkers: true, participantsGovtOfficials: true, participantsPublicRepresentatives: true,
      kvk: { select: { name: true } },
    },
    orderBy: [{ kvkId: "asc" }, { activityDate: "asc" }],
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14: always `blocks` (per-KVK) - the generic
  // client-side filter narrowing skips it. Field keys match the list's own
  // column keys (page.tsx's "poshan-maaha" row mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    activityDate: (r: R) => r.activityDate.toISOString().slice(0, 10),
    activitiesConducted: (r: R) => r.activitiesConducted,
    eventName: (r: R) => r.eventName,
    saplingsPlanted: (r: R) => String(r.saplingsPlanted),
    vegetableKits: (r: R) => String(r.vegetableKits),
    participantsGirls: (r: R) => String(r.participantsGirls),
    participantsPublicRepresentatives: (r: R) => String(r.participantsPublicRepresentatives),
    participantsFarmWoman: (r: R) => String(r.participantsFarmWoman),
    participantsFarmers: (r: R) => String(r.participantsFarmers),
    participantsAganwadiWorkers: (r: R) => String(r.participantsAganwadiWorkers),
    participantsGovtOfficials: (r: R) => String(r.participantsGovtOfficials),
    totalParticipants: (r: R) => String(r.totalParticipants),
  });

  // super-v2-prod.pdf p.41: the six participant categories sit under the "No.
  // of participants" group header; "Total Participants" is its own column
  // after the group, not inside it.
  const P = "No. of participants";
  const columns: ReportColumn[] = [
    { key: "date", label: "Datewise activity" },
    { key: "acts", label: "No. of activities conducted" },
    { key: "event", label: "Name of Event/Programme" },
    { key: "saplings", label: "No. of saplings planted" },
    { key: "kits", label: "No. of vegetable kits distributed" },
    { key: "pGirls", label: "Girls", groups: [P] },
    { key: "pFarmWoman", label: "Farm Woman", groups: [P] },
    { key: "pFarmers", label: "Farmers", groups: [P] },
    { key: "pAnganwadi", label: "Anganwadi Workers", groups: [P] },
    { key: "pGovt", label: "Govt Officials", groups: [P] },
    { key: "pPublic", label: "Public Representatives", groups: [P] },
    { key: "pTotal", label: "Total Participants" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: R) => ({
    date: stringifyValue(r.activityDate),
    acts: r.activitiesConducted,
    event: r.eventName,
    saplings: String(r.saplingsPlanted),
    kits: String(r.vegetableKits),
    pTotal: String(r.totalParticipants),
    pGirls: String(r.participantsGirls),
    pFarmWoman: String(r.participantsFarmWoman),
    pFarmers: String(r.participantsFarmers),
    pAnganwadi: String(r.participantsAganwadiWorkers),
    pGovt: String(r.participantsGovtOfficials),
    pPublic: String(r.participantsPublicRepresentatives),
  });

  return { blocks: perKvkBlocks(records, columns, rowOf, () => null) };
}

/**
 * "2.7.A Swachhta hi Sewa" / "2.7.B Swachta Pakhwada" (super-v2-prod.pdf
 * p.42) - one row per observance: State / KVK / date / activity count /
 * participants (Staffs / Farmers / Others / Total).
 */
function buildSwachhtaByKind(kind: "SEWA" | "PAKHWADA") {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    const rows = await prisma.swachhtaObservance.findMany({
      where: { kind, ...(scopeAndPeriod(scope, "swachhtaObservance")) },
      select: {
        fromDate: true, toDate: true, totalNoOfActivitiesUndertaken: true,
        noOfStaffs: true, noOfFarmers: true, noOfOthers: true,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
      orderBy: [{ kvk: { state: { name: "asc" } } }, { kvk: { name: "asc" } }],
    });
    const P = "No. of Participants";
    // kvk-report p.22-23: 2.7.A drops the State column, 2.7.B (Pakhwada) drops
    // State and KVK both. super-v2-prod keeps State + KVK on both.
    const lead: ReportColumn[] = scope.kvkId
      ? kind === "PAKHWADA"
        ? []
        : [{ key: "kvk", label: "KVK" }]
      : [
          { key: "state", label: "State" },
          { key: "kvk", label: "KVK" },
        ];
    return {
      columns: [
        ...lead,
        { key: "date", label: "Date/ Duration of Observation" },
        { key: "activities", label: "Total No of Activities undertaken" },
        { key: "staffs", label: "Staffs", groups: [P] },
        { key: "farmers", label: "Farmers", groups: [P] },
        { key: "others", label: "Others", groups: [P] },
        { key: "ptotal", label: "Total", groups: [P] },
      ],
      noSerial: true,
      rows: rows.map((r) => ({
        state: r.kvk.state.name,
        kvk: r.kvk.name,
        date: `${stringifyValue(r.fromDate)} to ${stringifyValue(r.toDate)}`,
        activities: String(r.totalNoOfActivitiesUndertaken),
        staffs: String(r.noOfStaffs),
        farmers: String(r.noOfFarmers),
        others: String(r.noOfOthers),
        ptotal: String(r.noOfStaffs + r.noOfFarmers + r.noOfOthers),
      })),
    };
  };
}

/**
 * "2.7.C Budget Expenditure" (super-v2-prod.pdf p.42) - State / KVK, then
 * two grouped pairs: Vermicomposting and "Other than vermicomposting
 * activities under Swachata", each No of village covered / Total Expenditure.
 */
async function buildSwachhtaBudget(scope: ReportScope): Promise<CustomTableResult> {
  const rows = await prisma.swachhtaBudgetExpenditure.findMany({
    where: scopeAndPeriod(scope, "swachhtaBudgetExpenditure"),
    select: {
      vermicompostingVillagesCovered: true, vermicompostingTotalExpenditure: true,
      otherVillagesCovered: true, otherTotalExpenditure: true,
      kvk: { select: { name: true, state: { select: { name: true } } } },
    },
    orderBy: [{ kvk: { state: { name: "asc" } } }, { kvk: { name: "asc" } }],
  });
  const G1 = "Vermicomposting";
  const G2 = "Other than vermicomposting activities under Swachata";
  return {
    columns: [
      // kvk-report p.23 drops the State column; super-v2-prod keeps it.
      ...(scope.kvkId ? [] : [{ key: "state", label: "State" }]),
      { key: "kvk", label: "KVK" },
      { key: "vVillages", label: "No of village covered", groups: [G1] },
      { key: "vExp", label: "Total Expenditure (Rs. in Lakhs)", groups: [G1] },
      { key: "oVillages", label: "No of village covered", groups: [G2] },
      { key: "oExp", label: "Total Expenditure (Rs. in Lakhs)", groups: [G2] },
    ],
    noSerial: true,
    rows: rows.map((r) => ({
      state: r.kvk.state.name,
      kvk: r.kvk.name,
      vVillages: String(r.vermicompostingVillagesCovered),
      vExp: stringifyValue(r.vermicompostingTotalExpenditure),
      oVillages: r.otherVillagesCovered != null ? String(r.otherVillagesCovered) : "0",
      oExp: r.otherTotalExpenditure != null ? stringifyValue(r.otherTotalExpenditure) : "0",
    })),
  };
}

const CASTE_SUM_FIELDS = ["generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"] as const;

/** 2.1.A's caste block: General/OBC/SC/ST each M/F only, then Total M/F/T (super-v2-prod.pdf p.19-21). */
function casteMfTotalColumns(...groupPath: string[]): ReportColumn[] {
  const cols: ReportColumn[] = [];
  for (const caste of CASTE_GROUPS) {
    for (const g of ["M", "F"] as const) cols.push({ key: `${CASTE_PREFIX[caste]}${g}`, label: g, groups: [...groupPath, caste] });
  }
  for (const g of ["M", "F", "T"] as const) cols.push({ key: `grand${g}`, label: g, groups: [...groupPath, "Total"] });
  return cols;
}
function casteMfTotalRow(records: CasteRecord[]): Record<string, string> {
  const full = casteMftRow(records, "", true);
  return {
    generalM: full.generalM, generalF: full.generalF,
    obcM: full.obcM, obcF: full.obcF,
    scM: full.scM, scF: full.scF,
    stM: full.stM, stF: full.stF,
    grandM: full.grandM, grandF: full.grandF, grandT: full.grandT,
  };
}

/**
 * "2.1.A Technical Achievement Summary" (super-v2-prod.pdf p.19-21) - eight
 * one-row matrix blocks. OFT/FLD/Training/Extension Activities read their
 * Achievement metrics + caste matrix straight off those operational models;
 * Target comes from the `Target` model (one row per category). "Other
 * Extension Activities" is the Activity-Type x count mini-table. The three
 * Production blocks come from TechnologyProductProduction grouped by
 * productCategory (Target left blank - no per-category production target in
 * the schema; flagged). "Farmer Target" is left blank for the same reason.
 */
async function buildTechnicalAchievementSummary(scope: ReportScope): Promise<CustomTableResult> {
  const where = scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId };
  // OFT / FLD / Training / Extension all bound their reporting period by
  // `reportingYear` (identical clause), the production table by its
  // `reportingDate`, targets by `reportingYear`.
  const yearWhere = { ...where, ...periodClause(scope, "oft") };
  const [ofts, flds, trainings, extensions, otherExt, production, targets] = await Promise.all([
    prisma.oft.findMany({ where: yearWhere, select: { noOfLocation: true, noOfTrialReplicationFarmer: true, ...CASTE_SELECT } }),
    // quantity/unit added, 2026-09-14 (real bug fix) - the FLD mini-grid's own
    // "Area" cell used to sum FldDemonstrationDetail.areaHa, a schema table
    // with 0 rows in the whole database (no data-entry UI was ever built for
    // it), so this always showed 0.00 no matter how much real FLD data
    // existed. Fld's own Quantity is the real Area value for every Ha-unit
    // sector (fldAreaOf, same helper the FLD Summary/State-wise/Details
    // report tables now use for the same reason) - already fetched here for
    // the caste block, so no extra round trip.
    prisma.fld.findMany({ where: yearWhere, select: { quantity: true, unit: true, ...CASTE_SELECT } }),
    prisma.training.findMany({ where: yearWhere, select: { ...CASTE_SELECT } }),
    prisma.extensionActivity.findMany({ where: yearWhere, select: { noOfActivities: true, ...DOUBLE_CASTE_SELECT } }),
    prisma.otherExtensionActivity.findMany({ where: yearWhere, select: { natureOfExtensionActivity: true, noOfActivities: true } }),
    prisma.technologyProductProduction.findMany({
      where: { ...where, ...periodClause(scope, "technologyProductProduction") },
      select: { productCategory: true, category: true, quantity: true, value: true, ...CASTE_SELECT },
    }),
    prisma.target.findMany({
      where: { ...where, ...periodClause(scope, "target") },
      select: { category: true, targetValue: true },
    }),
  ]);
  const targetOf = (category: string) =>
    String(targets.filter((t) => t.category.toLowerCase() === category.toLowerCase()).reduce((s, t) => s + t.targetValue, 0));

  // super-v2-prod.pdf p.19-21 / kvk-report p.11-12: one bold section heading
  // ("OFT", "FLD", ...) above a single-row grid whose header groups the
  // metrics (e.g. "No. of Technologies Tested" over Target/Achievement,
  // "No. of OFTs" over Location/Trials) and nests the caste block under
  // "<farmerGroup> > Achievement".
  const miniGrid = (
    heading: string,
    metricGroups: { group: string; cols: { key: string; label: string }[] }[],
    farmerGroup: string,
    withFarmerTarget: boolean,
    metricVals: Record<string, string>,
    casteRecords: CasteRecord[],
  ): ReportBlock => ({
    heading,
    parts: [
      {
        kind: "grid",
        noSerial: true,
        columns: [
          ...metricGroups.flatMap((mg) => mg.cols.map((c) => ({ ...c, groups: [mg.group] }))),
          ...(withFarmerTarget ? [{ key: "farmerTarget", label: "Farmer Target", groups: [farmerGroup] }] : []),
          ...casteMfTotalColumns(farmerGroup, "Achievement"),
        ],
        rows: [{ ...metricVals, ...(withFarmerTarget ? { farmerTarget: "" } : {}), ...casteMfTotalRow(casteRecords) }],
      },
    ],
  });

  const extCaste = [
    ...extensions.map((e) => prefixedCaste(e as unknown as Record<string, unknown>, "farmers")),
    ...extensions.map((e) => prefixedCaste(e as unknown as Record<string, unknown>, "officials")),
  ];

  const blocks: ReportBlock[] = [
    miniGrid("OFT",
      [
        { group: "No. of Technologies Tested", cols: [{ key: "target", label: "Target" }, { key: "ach", label: "Achievement" }] },
        { group: "No. of OFTs", cols: [{ key: "loc", label: "No. of Location" }, { key: "trials", label: "No. of Trials" }] },
      ],
      "No. of Farmers", true,
      { target: targetOf("OFT"), ach: String(ofts.length), loc: String(ofts.reduce((s, r) => s + (r.noOfLocation ?? 0), 0)), trials: String(ofts.reduce((s, r) => s + (r.noOfTrialReplicationFarmer ?? 0), 0)) },
      ofts),
    miniGrid("FLD",
      [
        { group: "No. of Technologies Demonstrated", cols: [{ key: "target", label: "Target" }, { key: "ach", label: "Achievement" }] },
        { group: "Number of FLDs", cols: [{ key: "area", label: "Area" }] },
      ],
      "Number of Farmers", true,
      { target: targetOf("FLD"), ach: String(flds.length), area: flds.reduce((s, f) => s + fldAreaOf(f), 0).toFixed(2) },
      flds),
    miniGrid("Training",
      [{ group: "Number of Courses", cols: [{ key: "target", label: "Target" }, { key: "ach", label: "Achievement" }] }],
      "Number of Participants", true,
      { target: targetOf("Training"), ach: String(trainings.length) },
      trainings),
    miniGrid("Extension Activities",
      [{ group: "Number of Activities", cols: [{ key: "target", label: "Target" }, { key: "ach", label: "Achievement" }] }],
      "Number of Participants", true,
      { target: targetOf("Extension Activity"), ach: String(extensions.reduce((s, r) => s + r.noOfActivities, 0)) },
      extCaste),
    {
      heading: "Other Extension Activities",
      parts: [
        {
          kind: "grid",
          noSerial: true,
          columns: [
            { key: "type", label: "Activity Type" },
            { key: "count", label: "Number of Activities" },
          ],
          rows: [...groupInto(otherExt, (r) => r.natureOfExtensionActivity).entries()].map(([type, list]) => ({
            type,
            count: String(list.reduce((s, r) => s + r.noOfActivities, 0)),
          })),
          totalRow: { type: "Total", count: String(otherExt.reduce((s, r) => s + r.noOfActivities, 0)) },
        },
      ],
    },
  ];

  // Product Category Master values already read "Production of Seed" etc.; only
  // when a record has none do we build the label from its finer `category`.
  const productionLabel = (r: { productCategory: string | null; category: string | null }) => {
    const pc = r.productCategory?.trim();
    if (pc) return pc.toLowerCase().startsWith("production") ? pc : `Production of ${pc}`;
    const c = r.category?.trim();
    return c ? `Production of ${c}` : "Production";
  };
  for (const [label, list] of groupInto(production, productionLabel)) {
    blocks.push(
      miniGrid(label,
        [{ group: label, cols: [
          { key: "target", label: "Target" },
          { key: "qty", label: "Quantity" },
          { key: "val", label: "Value (Rs.)" },
        ] }],
        "Number of Participants", false,
        { target: "", qty: String(list.reduce((s, r) => s + Number(r.quantity ?? 0), 0)), val: String(list.reduce((s, r) => s + Number(r.value ?? 0), 0)) },
        list),
    );
  }

  return { blocks };
}

/**
 * "2.8.A Production and Supply" (super-v2-prod.pdf p.43-53) - for each
 * Product Category (Seed / Bio Product / Livestock and Fisheries Material,
 * from the data / Product Category Master) three sub-views: (1) state-wise
 * total quantity, (2) by product type x state {Quantity / Value / No. of
 * farmers} + Grand Total, (3) by product type -> product (crop) x state,
 * same 3 measures, per-type Total. "No. of farmers" = sum of the 8 caste
 * counts.
 */
async function buildProductionAndSupply(scope: ReportScope): Promise<CustomTableResult> {
  const [rawRecords, stateNames, masterCats] = await Promise.all([
    prisma.technologyProductProduction.findMany({
      where: scopeAndPeriod(scope, "technologyProductProduction"),
      select: {
        reportingYear: true, productCategory: true, productType: true, product: true, category: true, variety: true, unit: true,
        quantity: true, value: true, ...CASTE_SELECT,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
    prisma.masterListItem.findMany({
      where: { zoneId: scope.zoneId, type: "PRODUCT_CATEGORY" },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14: built entirely from `blocks` (per Category ->
  // Unit/Type groupings), which the generic client-side filter narrowing
  // skips - a filtered Production & Supply list always downloaded every
  // record. Field keys match the list's own column keys (page.tsx's
  // "production-supply" row mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    reportingYear: (r: R) => (r.reportingYear != null ? String(r.reportingYear) : ""),
    productCategory: (r: R) => r.productCategory ?? "",
    variety: (r: R) => r.variety ?? "",
    quantity: (r: R) => String(r.quantity),
  });
  if (records.length === 0) return {};

  const farmersOf = (list: R[]) => list.reduce((s, r) => s + CASTE_SUM_FIELDS.reduce((a, f) => a + r[f], 0), 0);
  const qty = (list: R[]) => list.reduce((s, r) => s + Number(r.quantity ?? 0), 0);
  const val = (list: R[]) => list.reduce((s, r) => s + Number(r.value ?? 0), 0);
  const typeOf = (r: R) => (r.productType ?? "").trim() || (r.category ?? "").trim() || "Not specified";
  const cropOf = (r: R) => (r.product ?? "").trim() || (r.variety ?? "").trim() || "Not specified";

  const groups = [...stateNames, "Total"];
  const measureCols = (firstKey: string, firstLabel: string, secondKey?: string, secondLabel?: string): ReportColumn[] => [
    { key: firstKey, label: firstLabel },
    ...(secondKey ? [{ key: secondKey, label: secondLabel ?? "" }] : []),
    ...groups.flatMap((g) => [
      { key: `${g}|q`, label: "Quantity of seed (q)", groups: [g] },
      { key: `${g}|v`, label: "Value (Rs.)", groups: [g] },
      { key: `${g}|f`, label: "No. of farmers", groups: [g] },
    ]),
  ];
  const measureCells = (list: R[]) => {
    const out: Record<string, string> = {};
    for (const g of groups) {
      const scoped = g === "Total" ? list : list.filter((r) => r.kvk.state.name === g);
      out[`${g}|q`] = String(qty(scoped));
      out[`${g}|v`] = String(val(scoped));
      out[`${g}|f`] = String(farmersOf(scoped));
    }
    return out;
  };

  const rawCategoryNames =
    masterCats.length > 0
      ? masterCats.map((m) => m.name).filter((n) => records.some((r) => (r.productCategory ?? "") === n))
      : [...new Set(records.map((r) => (r.productCategory ?? "").trim()).filter(Boolean))];
  /**
   * super-v2-prod.pdf p.42-53 orders the categories A. Livestock and Fisheries
   * Material, B. Bio Product, C. Seed (not alphabetically). Honour that order
   * for those three; any other category our data carries follows, in name
   * order.
   */
  const CATEGORY_ORDER = ["livestock and fisheries material", "bio product", "seed"];
  const catRank = (n: string) => {
    const k = n.replace(/^production of\s+/i, "").trim().toLowerCase();
    const i = CATEGORY_ORDER.indexOf(k);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  const categoryNames = [...rawCategoryNames].sort(
    (a, b) => catRank(a) - catRank(b) || a.localeCompare(b),
  );
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

  // --- Single-KVK report: the 50pg kvk-report has NO state dimension here.
  // Per category -> per Unit -> per product type (banded), a Crop/Variety/
  // Quantity/Value/Farmers table with a Sub Total per type and a Total per
  // unit. No Bihar/Jharkhand anywhere (client, 2026-09-08). ---
  if (scope.kvkId) {
    // productType is the banded crop-type ("Cereals"), product is the crop
    // ("Paddy"), variety is the variety ("HD 2967") - matches the 50pg
    // kvk-report's "Dairy Animals" band -> "Cow | Desi" layout.
    const cropCol = (r: R) => (r.product ?? "").trim() || "-";
    const varietyCol = (r: R) => (r.variety ?? "").trim() || "-";
    const kvkBlocks: ReportBlock[] = [
      { heading: "Production and supply of Technological products", parts: [] },
    ];
    categoryNames.forEach((cat, ci) => {
      const inCat = records.filter((r) => (r.productCategory ?? "") === cat);
      const catName = cat.replace(/^production of\s+/i, "");
      const parts: ReportBlockPart[] = [];
      for (const [unit, unitRows] of groupInto(inCat, (r) => (r.unit ?? "").trim() || "-")) {
        const columns: ReportColumn[] = [
          { key: "crop", label: "Crop" },
          { key: "variety", label: "Variety" },
          { key: "qty", label: `Quantity of Product (${unit})` },
          { key: "val", label: "Value (Rs)" },
          ...casteMftColumns("Farmers"),
        ];
        const rows: Record<string, string>[] = [];
        for (const [type, typeRows] of groupInto(unitRows, typeOf)) {
          rows.push({ crop: type });
          for (const r of typeRows) {
            rows.push({
              crop: cropCol(r),
              variety: varietyCol(r),
              qty: `${Number(r.quantity ?? 0)} ${unit}`,
              val: String(Number(r.value ?? 0)),
              ...casteMftRow([r]),
            });
          }
          rows.push({ crop: "Sub Total", variety: "", qty: `${qty(typeRows)} ${unit}`, val: String(val(typeRows)), ...casteMftRow(typeRows) });
        }
        rows.push({ crop: "Total", variety: "", qty: `${qty(unitRows)} ${unit}`, val: String(val(unitRows)), ...casteMftRow(unitRows) });
        parts.push({ kind: "grid", noSerial: true, titleBands: [`Unit: ${unit}`], columns, rows });
      }
      kvkBlocks.push({ heading: `${letters[ci] ?? String(ci + 1)}. Production of ${catName}`, parts });
    });
    return { blocks: kvkBlocks };
  }

  const blocks: ReportBlock[] = categoryNames.map((cat, ci): ReportBlock => {
    const inCat = records.filter((r) => (r.productCategory ?? "") === cat);
    // Product Category Master values already read "Production of Seed" etc.,
    // so strip that prefix before the builder re-adds its own.
    const catName = cat.replace(/^production of\s+/i, "");

    // View 1: state-wise total quantity
    const v1Cols: ReportColumn[] = [
      { key: "state", label: "States" },
      { key: "prod", label: `Production of ${catName}` },
    ];
    const v1Rows = stateNames.map((s) => ({ state: s, prod: String(qty(inCat.filter((r) => r.kvk.state.name === s))) }));

    // View 2: by product type
    const v2Cols = measureCols("type", "Crop");
    const v2Rows = [...groupInto(inCat, typeOf).entries()].map(([type, list]) => ({ type, ...measureCells(list) }));

    // View 3: product type -> product
    const v3Cols = measureCols("type", "Crop Type", "crop", "Name Of Crop");
    const v3Rows: Record<string, string>[] = [];
    for (const [type, list] of groupInto(inCat, typeOf)) {
      const cropGroups = [...groupInto(list, cropOf).entries()];
      cropGroups.forEach(([crop, cropList], i) => {
        v3Rows.push({ type: i === 0 ? type : "", crop, ...measureCells(cropList) });
      });
      v3Rows.push({ type: "", crop: "Total", ...measureCells(list) });
    }

    return {
      heading: `${letters[ci] ?? String(ci + 1)}. Production of ${catName}`,
      parts: [
        {
          kind: "grid",
          noSerial: false,
          columns: v1Cols,
          rows: v1Rows,
          totalRow: { state: "Total", prod: String(qty(inCat)) },
          caption: `1. State-wise details of Production of ${catName}`,
        },
        {
          kind: "grid",
          noSerial: true,
          columns: v2Cols,
          rows: v2Rows,
          totalRow: { type: "Grand Total", ...measureCells(inCat) },
          caption: "2. List of product category state-wise",
        },
        {
          kind: "grid",
          noSerial: true,
          columns: v3Cols,
          rows: v3Rows,
          caption: "3. Details of crops (product category-wise)",
        },
      ],
    };
  });

  return { blocks };
}

/**
 * Real, fixed row order for "3.6.A TSP Activities" / "3.6.B SCSP
 * Activities" (super-v2-prod.pdf p.75-76: "a. Achievements of physical
 * output under TSP/SCSP") - matches this app's own TSP/SCSP Activity
 * Master 1:1 (5 values: Trainings, OFT, FLD, "Mobile agro- advisory to
 * farmers", Other activities).
 */
const SUB_PLAN_ACTIVITY_ORDER = ["Trainings", "OFT", "FLD", "Mobile agro- advisory to farmers", "Other activities"];

/**
 * "3.6.A TSP Activities" / "3.6.B SCSP Activities" in the real report is a
 * Bihar/Jharkhand x fixed-Activity pivot ("No. of Trainings/Demos" and "No.
 * of Farmers" per activity) - not a flat dump of SubPlanActivity's own rows
 * (confirmed against the reference PDF directly). Uses the existing
 * type/activities/noOfTraining/beneficiaries fields, just grouped instead
 * of listed.
 */
type SubPlanLocation = { district?: string; subdistrict?: string; villagesCovered?: number | string; villageNames?: string; stMale?: number | string; stFemale?: number | string };

function buildSubPlanByType(type: "TSP" | "SCSP") {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    if (scope.kvkId) {
      // kvk-report p.36: single-state "Name of Activities | No. of Trainings/Demos
      // | No. of Farmers" table, then b. Fund received, c. physical outcome, d.
      // Location & Beneficiary Details (from the locationBeneficiaries JSON).
      const rawRecs = await prisma.subPlanActivity.findMany({
        where: { type, kvkId: scope.kvkId },
        select: { activities: true, noOfTraining: true, beneficiaries: true, fundReceivedLakh: true, physicalOutcomeNote: true, locationBeneficiaries: true },
      });
      // Real bug fix, 2026-09-14 - blocks (grouped by fixed activity name).
      // Field keys match the list's own column keys (page.tsx's
      // "view-sub-plan-activity" mapping) - `type`/`kvk` aren't filterable
      // here since this branch is already scoped to one KVK and one type.
      const recs = applyListFilter(rawRecs, scope, {
        activities: (r) => r.activities,
        noOfTraining: (r) => String(r.noOfTraining),
        beneficiaries: (r) => String(r.beneficiaries),
      });
      const planLabel = type === "TSP" ? "Tribal Sub Plan (TSP)" : "Scheduled Caste Sub Plan (SCSP)";
      const aRows = SUB_PLAN_ACTIVITY_ORDER.map((activity, i) => {
        const m = recs.filter((r) => r.activities === activity);
        return {
          sn: String(i + 1),
          activity,
          demos: String(m.reduce((s, r) => s + r.noOfTraining, 0)),
          farmers: String(m.reduce((s, r) => s + r.beneficiaries, 0)),
        };
      });
      const fund = recs.map((r) => r.fundReceivedLakh).find((v) => v != null);
      const outcome = recs.map((r) => r.physicalOutcomeNote).find((v) => v && v.trim());
      const locs: SubPlanLocation[] = recs.flatMap((r) => (Array.isArray(r.locationBeneficiaries) ? (r.locationBeneficiaries as SubPlanLocation[]) : []));
      const blocks: ReportBlock[] = [
        {
          heading: `a. Achievements of physical output under ${type}`,
          notes: [`Details of ${planLabel}`],
          parts: [{
            kind: "grid", noSerial: true,
            columns: [
              { key: "sn", label: "Sl. No" }, { key: "activity", label: "Name of Activities" },
              { key: "demos", label: "No. of Trainings/Demos" }, { key: "farmers", label: "No. of Farmers" },
            ],
            rows: aRows,
          }],
        },
        {
          heading: `b. Fund received under ${type}`,
          parts: [{ kind: "pairs", pairs: [{ label: `Fund received under ${type} (Rs. In lakh)`, value: fund != null ? stringifyValue(fund) : "0" }] }],
        },
        {
          heading: `c. Achievements of physical outcome under ${type}`,
          parts: [{ kind: "pairs", pairs: [{ label: "Physical outcome", value: outcome ?? "No physical outcome data available." }] }],
        },
      ];
      if (locs.length > 0) {
        const ST = "ST Population Benefitted (No.)";
        blocks.push({
          heading: "d. Location and Beneficiary Details",
          parts: [{
            kind: "grid", noSerial: true,
            columns: [
              { key: "district", label: "District" }, { key: "subdistrict", label: "Subdistrict" },
              { key: "villages", label: "No. of Villages Covered" }, { key: "villageNames", label: "Name of Village(s) Covered" },
              { key: "stM", label: "M", groups: [ST] }, { key: "stF", label: "F", groups: [ST] }, { key: "stT", label: "T", groups: [ST] },
            ],
            rows: locs.map((l) => {
              const m = Number(l.stMale ?? 0), f = Number(l.stFemale ?? 0);
              return {
                district: l.district ?? "", subdistrict: l.subdistrict ?? "",
                villages: l.villagesCovered != null ? String(l.villagesCovered) : "",
                villageNames: l.villageNames ?? "",
                stM: String(m), stF: String(f), stT: String(m + f),
              };
            }),
          }],
        });
      }
      return { blocks };
    }
    const rows = await prisma.subPlanActivity.findMany({
      where: { type, zoneId: scope.zoneId },
      select: { activities: true, noOfTraining: true, beneficiaries: true, kvk: { select: { state: { select: { name: true } } } } },
    });
    const stateNames = await reportStates(scope.zoneId);

    // Reference layout (super-v2-prod.pdf p.75-76): "Name of Activities | Physical
    // Achievement | <state> | <state> ...", two rows per activity ("No. of
    // Trainings/Demos" then "No. of Farmers"), no Total column / Grand Total row.
    const columns: ReportColumn[] = [
      { key: "activity", label: "Name of Activities" },
      { key: "measure", label: "Physical Achievement" },
      ...stateNames.map((s) => ({ key: `st_${s}`, label: s })),
    ];

    const outRows: Record<string, string>[] = [];
    SUB_PLAN_ACTIVITY_ORDER.forEach((activity, i) => {
      const matching = rows.filter((r) => r.activities === activity);
      const demoRow: Record<string, string> = { activity: `${i + 1}. ${activity}`, measure: "No. of Trainings/Demos" };
      const farmerRow: Record<string, string> = { activity: "", measure: "No. of Farmers" };
      for (const state of stateNames) {
        const inState = matching.filter((r) => r.kvk.state.name === state);
        demoRow[`st_${state}`] = String(inState.reduce((s, r) => s + r.noOfTraining, 0));
        farmerRow[`st_${state}`] = String(inState.reduce((s, r) => s + r.beneficiaries, 0));
      }
      outRows.push(demoRow, farmerRow);
    });

    return { columns, rows: outRows, noSerial: true };
  };
}

/** Real, fixed row order for NARI's "3.7.A/B/C" State x Activity pivots (super-v2-prod.pdf p.76-77) - matches this app's own NARI Activity Master 1:1 (OFT, FLD, Not Specified). */
const NARI_ACTIVITY_ORDER = ["OFT", "FLD", "Not Specified"];

/**
 * "3.7.A Nutrition Garden" / "3.7.B Bio-fortified Crops" / "3.7.C Value
 * Addition" in the real report are all the same shape: Bihar/Jharkhand/
 * Total x Activity(OFT/FLD/Not Specified), each with a count column (No.
 * of Gardens/Crops/Products) plus Male/Female/Total - confirmed directly
 * against the reference PDF, not a flat dump of each model's own rows.
 * `countField`/`countLabel` are the one thing that differs per model.
 */
/** kvk-report p.36-38: NARI's per-village detail grids + secondary "each Beneficiary" tables. */
/** The list's own column keys per NARI model (page.tsx's own row mapping for each "nari-..." leaf) - varies per model, `kvk`/`nutriSmartVillage` shared by all five. */
const NARI_LIST_KEYS: Record<string, string[]> = {
  nariNutritionGarden: ["kvk", "nutriSmartVillage", "typeOfNutritionalGarden", "numbers", "areaSqm"],
  nariBioFortified: ["kvk", "nutriSmartVillage", "season", "activity", "categoryOfCrop"],
  nariValueAddition: ["kvk", "nutriSmartVillage", "cropName", "valueAddedProduct", "activity"],
  nariTraining: ["kvk", "nutriSmartVillage", "areaOfTraining", "activity", "titleOfTraining"],
  nariExtension: ["kvk", "nutriSmartVillage", "activity", "nameOfActivity", "noOfActivities"],
};

function buildNariKvk(
  model: "nariNutritionGarden" | "nariBioFortified" | "nariValueAddition" | "nariTraining" | "nariExtension",
) {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    const kvkId = scope.kvkId as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawRecords: Record<string, any>[] = await (prisma as any)[model].findMany({
      where: { kvkId },
      include: { kvk: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    // Real bug fix, 2026-09-14 - blocks/pairs, per village or per record.
    // Field keys match the corresponding list's own column keys.
    const records = applyListFilter(
      rawRecords,
      scope,
      Object.fromEntries(
        NARI_LIST_KEYS[model].map((key) => [key, (r: Record<string, unknown>) => (key === "kvk" ? (r.kvk as { name: string })?.name ?? "" : String(r[key] ?? ""))]),
      ),
    );
    const casteOf = (r: Record<string, unknown>): CasteRecord => ({
      generalMale: Number(r.male ?? 0), generalFemale: Number(r.female ?? 0),
      obcMale: Number(r.obcMale ?? 0), obcFemale: Number(r.obcFemale ?? 0),
      scMale: Number(r.scMale ?? 0), scFemale: Number(r.scFemale ?? 0),
      stMale: Number(r.stMale ?? 0), stFemale: Number(r.stFemale ?? 0),
    });
    const casteCols = casteMftColumns("No. of Beneficiaries", { grandLabel: "Grand Total" });
    const spec: Record<string, { lead: ReportColumn[]; row: (r: Record<string, any>) => Record<string, string>; caption: string; secondary?: { caption: string; columns: ReportColumn[]; jsonKey: string; map: (x: Record<string, unknown>) => Record<string, string> } }> = { // eslint-disable-line @typescript-eslint/no-explicit-any
      nariNutritionGarden: {
        caption: "Details of Established Nutrition Garden in Nutri-Smart Village",
        lead: [
          { key: "village", label: "Name of Nutri-Smart Village" }, { key: "activity", label: "Activity Type" },
          { key: "type", label: "Type of Nutritional Garden" }, { key: "number", label: "Number" }, { key: "area", label: "Area(sqm)" },
        ],
        row: (r) => ({ village: r.nutriSmartVillage, activity: r.activity, type: r.typeOfNutritionalGarden, number: String(r.numbers), area: stringifyValue(r.areaSqm) }),
        secondary: {
          caption: "Production and Consumption of Nutrition Garden Crops of Each Beneficiary",
          jsonKey: "crops",
          columns: [
            { key: "name", label: "Name of Crops" }, { key: "varieties", label: "Varieties" }, { key: "areaGrown", label: "Area Grown(sqm)" },
            { key: "production", label: "Production(kg)" }, { key: "consumption", label: "Consumption(kg)" },
            { key: "sell", label: "Sell of Produce(kg)" }, { key: "income", label: "Income from Sell of Produce (Rs)" },
          ],
          map: (x) => ({ name: String(x.name ?? ""), varieties: String(x.varieties ?? ""), areaGrown: String(x.areaGrown ?? ""), production: String(x.production ?? ""), consumption: String(x.consumption ?? ""), sell: String(x.sell ?? ""), income: String(x.income ?? "") }),
        },
      },
      nariBioFortified: {
        caption: "Details of Bio-fortified Crops used in Nutri-Smart Village",
        lead: [
          { key: "village", label: "Name of Nutri-Smart Village" }, { key: "season", label: "Season" }, { key: "activity", label: "Activity Type" },
          { key: "category", label: "Category of Crop" }, { key: "crop", label: "Name of Crop" }, { key: "variety", label: "Variety" }, { key: "area", label: "Area (ha)" },
        ],
        row: (r) => ({ village: r.nutriSmartVillage, season: r.season, activity: r.activity, category: r.categoryOfCrop, crop: r.cropName ?? "", variety: r.variety ?? "", area: stringifyValue(r.areaHa) }),
        secondary: {
          caption: "Details of Consumption Pattern of Bio-fortified Crops each Beneficiary",
          jsonKey: "consumptionDetails",
          columns: [
            { key: "name", label: "Name of Bio-fortified Crops" }, { key: "varieties", label: "Varieties" }, { key: "areaGrown", label: "Area Grown (sqm)" },
            { key: "production", label: "Production/yield" }, { key: "consumption", label: "Consumption (gm/day/person)" },
            { key: "form", label: "Form of Consumption" }, { key: "days", label: "No. of Days of Consumption in a Year" },
          ],
          map: (x) => ({ name: String(x.name ?? ""), varieties: String(x.varieties ?? ""), areaGrown: String(x.areaGrown ?? ""), production: String(x.production ?? ""), consumption: String(x.consumption ?? ""), form: String(x.form ?? ""), days: String(x.days ?? "") }),
        },
      },
      nariValueAddition: {
        caption: "Details of Value Addition in Nutri-Smart Village",
        lead: [
          { key: "village", label: "Name of Nutri-Smart Village" }, { key: "crop", label: "Name of Crop" },
          { key: "product", label: "Name of Value-added Product" }, { key: "activity", label: "Activity Type" },
        ],
        row: (r) => ({ village: r.nutriSmartVillage, crop: r.cropName, product: r.valueAddedProduct, activity: r.activity }),
        secondary: {
          caption: "Details of Value-added Products each Beneficiary",
          jsonKey: "products",
          columns: [
            { key: "name", label: "Name of Product" }, { key: "amount", label: "Amount Produced (Kg)" }, { key: "price", label: "Market Price (Rs/kg)" },
            { key: "income", label: "Net Income (Rs)" }, { key: "shelf", label: "Self-life of Produce" }, { key: "fssai", label: "FSSAI Certification" },
          ],
          map: (x) => ({ name: String(x.name ?? ""), amount: String(x.amount ?? ""), price: String(x.price ?? ""), income: String(x.income ?? ""), shelf: String(x.shelf ?? ""), fssai: String(x.fssai ?? "") }),
        },
      },
      nariTraining: {
        caption: "Training Programmes in Nutri-Smart Village",
        lead: [
          { key: "village", label: "Name of Nutri Smart Village" }, { key: "activity", label: "Activity Type" }, { key: "areaOfTraining", label: "Area of Training" },
          { key: "title", label: "Title of Training" }, { key: "campus", label: "On Campus/Off Campus" }, { key: "venue", label: "Venue" }, { key: "courses", label: "No. of Courses" },
        ],
        row: (r) => ({ village: r.nutriSmartVillage, activity: r.activity, areaOfTraining: r.areaOfTraining, title: r.titleOfTraining, campus: r.onOffCampus ?? "", venue: r.venue ?? "", courses: String(r.numberOfCourses) }),
      },
      nariExtension: {
        caption: "Extension activities under NARI Project",
        lead: [
          { key: "village", label: "Name of Nutri-Smart Village" }, { key: "activity", label: "Activity Type" },
          { key: "name", label: "Name of Activity" }, { key: "count", label: "No. of Activities" },
        ],
        row: (r) => ({ village: r.nutriSmartVillage, activity: r.activity, name: r.nameOfActivity, count: String(r.noOfActivities) }),
      },
    };
    const s = spec[model];
    const primary: ReportBlock = {
      heading: s.caption,
      parts: [{
        kind: "grid",
        columns: [...s.lead, ...casteCols],
        rows: records.map((r) => ({ ...s.row(r), ...casteMftRow([casteOf(r)], "", true) })),
        ...(records.length
          ? { totalRow: { [s.lead[0].key]: "Grand Total", ...casteMftRow(records.map(casteOf), "", true) } }
          : { keepEmpty: true }),
      }],
    };
    // kvk-report p.36-38 prints a "KVK: <name>" band above each NARI grid.
    const kvkName = records[0]?.kvk?.name as string | undefined;
    const blocks: ReportBlock[] = kvkName
      ? [{ heading: `KVK: ${kvkName}`, parts: [] }, primary]
      : [primary];
    if (s.secondary) {
      const items = records.flatMap((r) => (Array.isArray(r[s.secondary!.jsonKey]) ? (r[s.secondary!.jsonKey] as Record<string, unknown>[]) : []));
      blocks.push({
        heading: s.secondary.caption,
        parts: items.length
          ? [{ kind: "grid", columns: s.secondary.columns, rows: items.map(s.secondary.map) }]
          : [{ kind: "grid", columns: s.secondary.columns, rows: [], caption: "No records found." }],
      });
    }
    return { blocks };
  };
}

function buildNariByActivity(
  model: "nariNutritionGarden" | "nariBioFortified" | "nariValueAddition" | "nariTraining" | "nariExtension",
  countField: "numbers" | "numberOfCrops" | "numberOfProducts" | "numberOfCourses" | "noOfActivities",
  countLabel: string,
) {
  const kvkVariant = buildNariKvk(model);
  return async (scope: ReportScope) => {
    if (scope.kvkId) return kvkVariant(scope);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    const rows: { activity: string; count: number; male: number; female: number; kvk: { state: { name: string } } }[] =
      await delegate.findMany({
        where: scopeAndPeriod(scope, model),
        select: { activity: true, [countField]: true, male: true, female: true, kvk: { select: { state: { select: { name: true } } } } },
      }).then((rs: Record<string, unknown>[]) =>
        rs.map((r) => ({ activity: String(r.activity), count: Number(r[countField]), male: Number(r.male), female: Number(r.female), kvk: r.kvk as { state: { name: string } } })),
      );
    const states = await prisma.state.findMany({ where: { zoneId: scope.zoneId }, orderBy: { name: "asc" } });
    const stateNames = states.map((s) => s.name);
    const allCols = [...stateNames, "Total"];

    const columns: ReportColumn[] = [
      { key: "activity", label: "Activity" },
      ...allCols.flatMap((s) => [
        { key: `${s} count`, label: countLabel, groups: [s] },
        { key: `${s} male`, label: "M", groups: [s] },
        { key: `${s} female`, label: "F", groups: [s] },
        { key: `${s} total`, label: "T", groups: [s] },
      ]),
    ];

    const outRows: Record<string, string>[] = [];
    const grand: Record<string, number> = Object.fromEntries(
      allCols.flatMap((s) => [[`${s} count`, 0], [`${s} male`, 0], [`${s} female`, 0], [`${s} total`, 0]]),
    );

    for (const activity of NARI_ACTIVITY_ORDER) {
      const matching = rows.filter((r) => r.activity === activity);
      const row: Record<string, string> = { activity };
      for (const state of stateNames) {
        const inState = matching.filter((r) => r.kvk.state.name === state);
        const count = inState.reduce((s, r) => s + r.count, 0);
        const male = inState.reduce((s, r) => s + r.male, 0);
        const female = inState.reduce((s, r) => s + r.female, 0);
        row[`${state} count`] = String(count);
        row[`${state} male`] = String(male);
        row[`${state} female`] = String(female);
        row[`${state} total`] = String(male + female);
        grand[`${state} count`] += count;
        grand[`${state} male`] += male;
        grand[`${state} female`] += female;
        grand[`${state} total`] += male + female;
      }
      const totalCount = matching.reduce((s, r) => s + r.count, 0);
      const totalMale = matching.reduce((s, r) => s + r.male, 0);
      const totalFemale = matching.reduce((s, r) => s + r.female, 0);
      row["Total count"] = String(totalCount);
      row["Total male"] = String(totalMale);
      row["Total female"] = String(totalFemale);
      row["Total total"] = String(totalMale + totalFemale);
      grand["Total count"] += totalCount;
      grand["Total male"] += totalMale;
      grand["Total female"] += totalFemale;
      grand["Total total"] += totalMale + totalFemale;
      outRows.push(row);
    }

    const grandRow: Record<string, string> = { activity: "Grand Total" };
    for (const key of Object.keys(grand)) grandRow[key] = String(grand[key]);
    outRows.push(grandRow);

    return { columns, rows: outRows };
  };
}

type Sub = { num: string; title: string; items: Entry[] };
type Sec = { num: string; title: string; subs: Sub[] };

// ---------------------------------------------------------------------------
// Section 1 "ABOUT KVK" builders - column labels, order, grouped headers,
// total rows and the Staff Quarters block layout are transcribed 1:1 from
// super-v2-prod.pdf pages 9-19, not from the models' own field names.
// ---------------------------------------------------------------------------

/**
 * Most section-1 tables lead with the owning KVK's name, then that model's
 * own fields under the reference's exact labels. `fieldColumns` keys are
 * real scalar fields on `model`; values are stringified the same way the
 * generic path does (dates -> YYYY-MM-DD, Decimal -> as-is, boolean ->
 * Yes/No). `totalField` adds super-v2-prod.pdf's trailing "Total" row
 * (currently only 1.3.B Land Details).
 */
function kvkOwnedTable(
  model: string,
  fieldColumns: ReportColumn[],
  opts: { kvkLabel?: string; totalField?: string; totalLabel?: string } = {},
) {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: Record<string, any>[] = await (prisma as any)[model].findMany({
      where: scopeAndPeriod(scope, model),
      include: { kvk: { select: { name: true } } },
      orderBy: { kvk: { name: "asc" } },
      take: 5000,
    });
    const columns: ReportColumn[] = [{ key: "kvk", label: opts.kvkLabel ?? "KVK" }, ...fieldColumns];
    const rows = records.map((rec) => {
      const row: Record<string, string> = { kvk: rec.kvk?.name ?? "" };
      for (const col of fieldColumns) row[col.key] = stringifyValue(rec[col.key]);
      return row;
    });
    let totalRow: Record<string, string> | undefined;
    if (opts.totalField) {
      const sum = records.reduce((acc, rec) => acc + Number(rec[opts.totalField!] ?? 0), 0);
      totalRow = { kvk: opts.totalLabel ?? "Total", [opts.totalField]: String(Math.round(sum * 100) / 100) };
    }
    return { columns, rows, totalRow };
  };
}

const TELEPHONE = "Telephone";

/** 1.1.A.1 "Name and address of KVK with phone, fax and e-mail" - grouped Telephone header (Office / FAX). */
async function buildKvkAddressTable(scope: ReportScope): Promise<CustomTableResult> {
  const kvks = await prisma.kvk.findMany({
    where: scope.kvkId ? { id: scope.kvkId } : { zoneId: scope.zoneId },
    orderBy: { name: "asc" },
    select: { name: true, address: true, officePhone: true, fax: true, email: true, sanctionYear: true },
  });
  // Real bug fix, 2026-09-14 - the View KVKs list's own column keys ("kvk"/
  // "KVK" and "mobile"/"Mobile", page.tsx's view-kvks row mapping) never
  // matched this table's "name"/"office" keys or labels on any of the 3
  // ways scopeTable tries, so filtering that list and downloading always
  // silently ignored the filter.
  const columns: ReportColumn[] = [
    { key: "name", label: "Name of KVK", listKey: "kvk" },
    { key: "address", label: "Address" },
    { key: "office", label: "Office", groups: [TELEPHONE], listKey: "mobile" },
    { key: "fax", label: "FAX", groups: [TELEPHONE] },
    { key: "email", label: "E-Mail" },
    { key: "sanctionYear", label: "Sanction Year" },
  ];
  const rows = kvks.map((k) => ({
    name: k.name,
    address: k.address ?? "",
    office: k.officePhone ?? "",
    fax: k.fax ?? "",
    email: k.email ?? "",
    sanctionYear: k.sanctionYear != null ? String(k.sanctionYear) : "",
  }));
  return { columns, rows };
}

/** 1.1.A.2 "Name and address of host organization with phone, fax and e-mail" - grouped Telephone header (Office / Mobile / FAX). */
async function buildHostOrgAddressTable(scope: ReportScope): Promise<CustomTableResult> {
  const orgs = await prisma.hostOrganization.findMany({
    where: scope.kvkId ? { kvks: { some: { id: scope.kvkId } } } : { zoneId: scope.zoneId },
    orderBy: { name: "asc" },
    select: { name: true, address: true, officePhone: true, mobilePhone: true, fax: true, email: true },
  });
  const columns: ReportColumn[] = [
    { key: "name", label: "Name of Host Organization" },
    { key: "address", label: "Address" },
    { key: "office", label: "Office", groups: [TELEPHONE] },
    { key: "mobile", label: "Mobile", groups: [TELEPHONE] },
    { key: "fax", label: "FAX", groups: [TELEPHONE] },
    { key: "email", label: "E-Mail" },
  ];
  const rows = orgs.map((o) => ({
    name: o.name,
    address: o.address ?? "",
    office: o.officePhone ?? "",
    mobile: o.mobilePhone ?? "",
    fax: o.fax ?? "",
    email: o.email ?? "",
  }));
  return { columns, rows };
}

/** 1.2.B "Staff Transferred" - joins staff + the from/to KVK names. Scoped by `fromKvkId` for a KVK admin: the transfer belongs to the KVK the staff left (matches the Staff Transferred list + Form Summary). */
async function buildStaffTransferred(scope: ReportScope): Promise<CustomTableResult> {
  const transfers = await prisma.staffTransfer.findMany({
    where: scope.kvkId ? { fromKvkId: scope.kvkId } : { zoneId: scope.zoneId },
    include: {
      staff: { select: { name: true } },
      fromKvk: { select: { name: true } },
      toKvk: { select: { name: true } },
    },
    orderBy: { transferDate: "asc" },
  });
  // Real bug fix, 2026-09-14 - the list's own column keys (page.tsx's
  // "staff-transferred" mapping: staffName/kvkNameBeforeTransfer/
  // latestKvkName/dateOfRelieving) and labels ("From Transfer KVK Name",
  // "To Transfer KVK Name", "Date of Relieving") never matched this table's
  // own key or label on any of the 3 ways scopeTable tries - own-key, exact
  // label, normalised label - so filtering this list by name/KVK/date and
  // downloading always silently ignored the filter. listKey closes the gap
  // the same way as Employee Details/Infrastructure/Vehicles/Equipment did.
  const columns: ReportColumn[] = [
    { key: "name", label: "Name", listKey: "staffName" },
    { key: "from", label: "Transferred From", listKey: "kvkNameBeforeTransfer" },
    { key: "to", label: "Transferred To", listKey: "latestKvkName" },
    { key: "date", label: "Transfer Date", listKey: "dateOfRelieving" },
    { key: "count", label: "No. of Transfers" },
  ];
  const rows = transfers.map((t) => ({
    name: t.staff?.name ?? "",
    from: t.fromKvk?.name ?? "",
    to: t.toKvk?.name ?? "",
    date: stringifyValue(t.transferDate),
    count: String(t.numberOfTransfers),
  }));
  return { columns, rows };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * 1.3.C "Staff Quarters Details" - super-v2-prod.pdf repeats, per KVK, a
 * one-row summary (completion date / quarter count / occupancy remark) then
 * a 12-month x N-quarter occupancy grid. Modelled here as one composite
 * block per StaffQuarters record.
 */
async function buildStaffQuarters(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.staffQuarters.findMany({
    where: scopeAndPeriod(scope, "staffQuarters"),
    include: { kvk: { select: { name: true } }, occupancy: true },
    orderBy: { kvk: { name: "asc" } },
  });
  // Real bug fix, 2026-09-14: one composite block per record - the generic
  // client-side filter narrowing skips any `blocks` table. Field keys match
  // the list's own column keys (page.tsx's "staff-quarters" row mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk?.name ?? "",
    noOfStaffQuarters: (r) => String(r.numberOfQuarters),
    dateOfCompletion: (r) => (r.dateOfCompletion ? r.dateOfCompletion.toISOString().slice(0, 10) : ""),
    remark: (r) => r.remark ?? "",
  });

  // super-v2-prod.pdf p.15-16 and the 50pg kvk-report both print this
  // descriptive line once, then repeat per KVK: a summary grid whose FIRST
  // column is "KVK" (the header row is reprinted for every KVK, verified
  // against super-v2-prod.pdf's own text), immediately followed by that
  // KVK's 12-month x N-quarter occupancy grid.
  const blocks: ReportBlock[] = [
    { heading: "Utilization of Staff Quarters Whether Staff Quarters has been Completed", parts: [] },
  ];

  for (const rec of records) {
    const maxQuarter = Math.max(
      rec.numberOfQuarters,
      0,
      ...rec.occupancy.map((o) => o.quarterNumber),
    );
    const summary: ReportGrid = {
      noSerial: true,
      columns: [
        { key: "kvk", label: "KVK" },
        { key: "doc", label: "Date of Completion" },
        { key: "count", label: "No.of Staff Quarters" },
        { key: "occ", label: "Occupancy Details" },
      ],
      rows: [
        {
          kvk: rec.kvk?.name ?? "",
          doc: stringifyValue(rec.dateOfCompletion),
          count: String(rec.numberOfQuarters),
          occ: rec.occupancyDetails ?? rec.remark ?? "",
        },
      ],
    };
    const parts: ReportBlock["parts"] = [{ kind: "grid", ...summary }];

    if (maxQuarter > 0) {
      const occByCell = new Map(
        rec.occupancy.map((o) => [`${o.month}-${o.quarterNumber}`, o.occupied]),
      );
      const gridColumns: ReportColumn[] = [{ key: "month", label: "Month" }];
      for (let q = 1; q <= maxQuarter; q++) gridColumns.push({ key: `q${q}`, label: `Quarter ${q}` });
      const gridRows = MONTH_NAMES.map((month, index) => {
        const row: Record<string, string> = { month };
        for (let q = 1; q <= maxQuarter; q++) {
          const occupied = occByCell.get(`${index + 1}-${q}`);
          row[`q${q}`] = occupied === undefined ? "" : occupied ? "Yes" : "No";
        }
        return row;
      });
      parts.push({ kind: "grid", noSerial: true, columns: gridColumns, rows: gridRows });
    }

    blocks.push({ heading: "", parts });
  }

  return { blocks };
}

/** 1.4.B "Vehicle Status" - the yearly status record plus its parent vehicle's identity columns. */
async function buildVehicleStatus(scope: ReportScope): Promise<CustomTableResult> {
  const statuses = await prisma.vehicleStatus.findMany({
    where: scope.kvkId ? { vehicle: { kvkId: scope.kvkId } } : { zoneId: scope.zoneId },
    include: {
      vehicle: {
        select: {
          vehicleType: true,
          name: true,
          registrationNo: true,
          yearOfPurchase: true,
          cost: true,
          totalRun: true,
          presentStatus: true,
          repairingCost: true,
          kvk: { select: { name: true } },
        },
      },
    },
    orderBy: { reportingYear: "asc" },
  });
  const withType = !!scope.kvkId; // kvk-report 1.4.B carries a "Vehicle Type" column; super-v2-prod does not.
  const columns: ReportColumn[] = [
    { key: "year", label: "Year" },
    { key: "kvk", label: "KVK" },
    ...(withType ? [{ key: "vtype", label: "Vehicle Type" }] : []),
    // listKey: 2026-09-14 fix - the label only lines up with the list's own
    // "Vehicle Name" for a KVK-scoped download (super-v2-prod's own "Vehicle"
    // label doesn't), so a Super Admin filtering the Vehicle Details list and
    // downloading still needs the key match to actually narrow it.
    { key: "vehicle", label: withType ? "Vehicle Name" : "Vehicle", listKey: "vehicleName" },
    { key: "reg", label: "Registration No." },
    { key: "yop", label: "Year of purchase" },
    { key: "cost", label: "Cost (Rs.)" },
    { key: "run", label: "Total Run(km/hrs)" },
    { key: "status", label: "Present status" },
    { key: "repair", label: "Repairing Cost" },
    { key: "fundingSource", label: "Source of Funding" },
    { key: "fundingAgency", label: "Funding Agency" },
  ];
  const rowOf = (s: (typeof statuses)[number], year: number) => ({
    year: String(year),
    kvk: s.vehicle?.kvk?.name ?? "",
    vtype: s.vehicle?.vehicleType ?? "",
    vehicle: s.vehicle?.name ?? "",
    reg: s.vehicle?.registrationNo ?? "",
    yop: s.vehicle?.yearOfPurchase != null ? String(s.vehicle.yearOfPurchase) : "",
    cost: s.vehicle?.cost != null ? stringifyValue(s.vehicle.cost) : "",
    // Per-year value, falling back to the vehicle master's current one.
    run:
      s.totalRunKmHrs != null
        ? stringifyValue(s.totalRunKmHrs)
        : s.vehicle?.totalRun != null
          ? stringifyValue(s.vehicle.totalRun)
          : "",
    status: s.presentStatus ?? s.vehicle?.presentStatus ?? "",
    repair:
      s.repairingCost != null
        ? stringifyValue(s.repairingCost)
        : s.vehicle?.repairingCost != null
          ? stringifyValue(s.vehicle.repairingCost)
          : "",
    fundingSource: s.fundingSource ?? "",
    fundingAgency: s.fundingAgency ?? "",
  });
  const rows = statuses.map((s) => rowOf(s, s.reportingYear));
  // Carry-forward: a vehicle whose latest record is an earlier, non-condemned
  // year also appears as a current-year row (matches the Vehicle Details list).
  const CURRENT_YEAR = new Date().getFullYear();
  const latest = new Map<string, (typeof statuses)[number]>();
  for (const s of statuses) {
    const cur = latest.get(s.vehicleId);
    if (!cur || s.reportingYear > cur.reportingYear) latest.set(s.vehicleId, s);
  }
  for (const s of latest.values()) {
    if (
      s.reportingYear < CURRENT_YEAR &&
      (s.presentStatus ?? "").trim().toLowerCase() !== "condemned"
    ) {
      rows.push(rowOf(s, CURRENT_YEAR));
    }
  }
  return { columns, rows };
}

/** 1.5.B "Equipment Status" - the yearly status record plus its parent equipment's identity columns. */
async function buildEquipmentStatus(scope: ReportScope): Promise<CustomTableResult> {
  const statuses = await prisma.equipmentStatus.findMany({
    where: scope.kvkId ? { equipment: { kvkId: scope.kvkId } } : { zoneId: scope.zoneId },
    include: {
      equipment: {
        select: {
          equipmentType: true,
          name: true,
          yearOfPurchase: true,
          cost: true,
          sourceOfFund: true,
          kvk: { select: { name: true } },
        },
      },
    },
    orderBy: { reportingYear: "asc" },
  });
  const withType = !!scope.kvkId; // kvk-report 1.5.B carries an "Equipment Type" column; super-v2-prod does not.
  const columns: ReportColumn[] = [
    { key: "year", label: "Year" },
    { key: "kvk", label: "KVK" },
    ...(withType ? [{ key: "etype", label: "Equipment Type" }] : []),
    { key: "equipment", label: "Equipment Name" },
    { key: "yop", label: "Year of purchase" },
    { key: "cost", label: "Cost (Rs.)" },
    { key: "sourceOfFund", label: "Source of Funding" },
    { key: "fundingAgency", label: "Funding Agency" },
    { key: "status", label: "Present status" },
  ];
  const rowOf = (s: (typeof statuses)[number], year: number) => ({
    year: String(year),
    kvk: s.equipment?.kvk?.name ?? "",
    etype: s.equipment?.equipmentType ?? "",
    equipment: s.equipment?.name ?? "",
    yop: s.equipment?.yearOfPurchase != null ? String(s.equipment.yearOfPurchase) : "",
    cost: s.equipment?.cost != null ? stringifyValue(s.equipment.cost) : "",
    // Source of fund lives on the equipment master (reference /create-equipment);
    // fall back to the legacy per-year value for records saved before that move.
    sourceOfFund: s.equipment?.sourceOfFund ?? s.sourceOfFund ?? "",
    fundingAgency: s.fundingAgency ?? "",
    status: s.presentStatus ?? "",
  });
  const rows = statuses.map((s) => rowOf(s, s.reportingYear));
  // Carry-forward: same as buildVehicleStatus / the Equipment Details list.
  const CURRENT_YEAR = new Date().getFullYear();
  const latest = new Map<string, (typeof statuses)[number]>();
  for (const s of statuses) {
    const cur = latest.get(s.equipmentId);
    if (!cur || s.reportingYear > cur.reportingYear) latest.set(s.equipmentId, s);
  }
  for (const s of latest.values()) {
    if (
      s.reportingYear < CURRENT_YEAR &&
      (s.presentStatus ?? "").trim().toLowerCase() !== "condemned"
    ) {
      rows.push(rowOf(s, CURRENT_YEAR));
    }
  }
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Sections 4/5/6 - mostly flat per-record tables. `flatReportTable` fetches
// a model zone/kvk-scoped, prepends any relation-sourced lead columns
// (KVK / State / District), and renders the reference's exact labels for
// the scalar fields that exist on the model. A few tables' reference
// columns have no backing field yet (flagged inline) - those columns are
// omitted rather than guessed.
// ---------------------------------------------------------------------------

type LeadKey = "kvk" | "state" | "district";
type FlatSpec = {
  model: string;
  lead?: { key: LeadKey; label: string }[];
  columns: ReportColumn[];
  noSerial?: boolean;
  orderByField?: string;
  /** Sub-heading printed above the grid, e.g. "Performance of Demonstration Units(Other than Instructional Farm)". */
  caption?: string;
  /** Column set for a single-KVK report when it differs from the 93pg all-KVK export (e.g. 4.3.A swaps Variety/Breed..Gross Income for a lone "Status"). */
  kvkColumns?: ReportColumn[];
  kvkNoSerial?: boolean;
};

function flatReportTable(spec: FlatSpec) {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    const singleKvk = !!scope.kvkId;
    const activeColumns = singleKvk && spec.kvkColumns ? spec.kvkColumns : spec.columns;
    const activeNoSerial = singleKvk && spec.kvkColumns ? spec.kvkNoSerial : spec.noSerial;
    const lead = spec.lead ?? [];
    const needKvk = lead.length > 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: Record<string, any>[] = await (prisma as any)[spec.model].findMany({
      where: scopeAndPeriod(scope, spec.model),
      ...(needKvk
        ? { include: { kvk: { select: { name: true, state: { select: { name: true } }, district: { select: { name: true } } } } } }
        : {}),
      orderBy: spec.orderByField
        ? { [spec.orderByField]: "asc" }
        : needKvk
          ? { kvk: { name: "asc" } }
          : undefined,
      take: 5000,
    });
    const leadCols: ReportColumn[] = lead.map((l) => ({ key: `lead_${l.key}`, label: l.label }));
    const rows = records.map((rec) => {
      const row: Record<string, string> = {};
      for (const l of lead) {
        row[`lead_${l.key}`] =
          l.key === "kvk" ? rec.kvk?.name ?? "" : l.key === "state" ? rec.kvk?.state?.name ?? "" : rec.kvk?.district?.name ?? "";
      }
      for (const col of activeColumns) row[col.key] = stringifyValue(rec[col.key]);
      return row;
    });
    const columns = [...leadCols, ...activeColumns];
    return { columns, rows, noSerial: activeNoSerial, caption: spec.caption, keepEmpty: columns.length > 0 };
  };
}

const KVK = { key: "kvk" as const, label: "KVK" };
const STATE_LEAD = { key: "state" as const, label: "Name of State" };
const DISTRICT_LEAD = { key: "district" as const, label: "Name of District" };

/** 4.4.A "Budget Details" (super-v2-prod.pdf p.87) - KVK, Salary Allocation, then grouped General / Capital allocation (Main Grant / TSP / SCSP / Total) and a Grand Total. */
async function buildBudgetDetails(scope: ReportScope): Promise<CustomTableResult> {
  const rows = await prisma.budgetDetail.findMany({
    where: scopeAndPeriod(scope, "budgetDetail"),
    select: {
      salaryAllocation: true,
      generalMainGrant: true, generalTsp: true, generalScsp: true,
      capitalMainGrant: true, capitalTsp: true, capitalScsp: true,
      kvk: { select: { name: true } },
    },
    orderBy: { kvk: { name: "asc" } },
  });
  const G = "General Allocation", C = "Capital Allocation";
  const num = (v: unknown) => Number(v ?? 0);
  return {
    columns: [
      { key: "kvk", label: "KVK" },
      { key: "salary", label: "Salary Allocation" },
      { key: "gMain", label: "Main Grant", groups: [G] },
      { key: "gTsp", label: "TSP", groups: [G] },
      { key: "gScsp", label: "SCSP", groups: [G] },
      { key: "gTotal", label: "Total", groups: [G] },
      { key: "cMain", label: "Main Grant", groups: [C] },
      { key: "cTsp", label: "TSP", groups: [C] },
      { key: "cScsp", label: "SCSP", groups: [C] },
      { key: "cTotal", label: "Total", groups: [C] },
      { key: "grand", label: "Grand Total" },
    ],
    noSerial: true,
    rows: rows.map((r) => {
      const gT = num(r.generalMainGrant) + num(r.generalTsp) + num(r.generalScsp);
      const cT = num(r.capitalMainGrant) + num(r.capitalTsp) + num(r.capitalScsp);
      return {
        kvk: r.kvk.name,
        salary: String(num(r.salaryAllocation)),
        gMain: String(num(r.generalMainGrant)), gTsp: String(num(r.generalTsp)), gScsp: String(num(r.generalScsp)), gTotal: String(gT),
        cMain: String(num(r.capitalMainGrant)), cTsp: String(num(r.capitalTsp)), cScsp: String(num(r.capitalScsp)), cTotal: String(cT),
        grand: String(num(r.salaryAllocation) + gT + cT),
      };
    }),
  };
}

/** 4.2.A "District Level Data" (super-v2-prod.pdf p.84-85) - four stacked grids: general items, crop productivity, monthly weather (no backing model yet - omitted, flagged), livestock products. */
async function buildDistrictLevelData(scope: ReportScope): Promise<CustomTableResult> {
  const where = scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId };
  const [rawItems, crops, weather, livestock] = await Promise.all([
    prisma.districtLevelData.findMany({
      where: { ...where, ...periodClause(scope, "districtLevelData") },
      select: { items: true, information: true, reportingYear: true, kvk: { select: { name: true } } },
    }),
    prisma.districtCropProductivity.findMany({ where, select: { season: true, type: true, cropName: true, areaHa: true, productionMt: true, productivityQha: true, remarks: true } }),
    prisma.districtMonthlyWeather.findMany({ where, select: { month: true, rainfallMm: true, maxTempC: true, minTempC: true, maxRhPct: true, minRhPct: true, remarks: true } }),
    prisma.districtLivestockProduction.findMany({ where, select: { livestockName: true, number: true, remarks: true } }),
  ]);
  // Real bug fix, 2026-09-14 - this leaf's own list (kvk/reportingYear/items/
  // information) filters only this first block; the other 3 blocks are each
  // a different leaf's own data and aren't touched by this leaf's filter.
  const items = applyListFilter(rawItems, scope, {
    kvk: (r) => r.kvk?.name ?? "",
    reportingYear: (r) => String(r.reportingYear),
    items: (r) => r.items,
    information: (r) => r.information ?? "",
  });
  return {
    blocks: [
      {
        heading: "2.a District level data on agriculture, livestock and farming situation",
        parts: [{ kind: "grid", noSerial: false, columns: [{ key: "items", label: "Items" }, { key: "information", label: "Remarks" }], rows: items.map((r) => ({ items: r.items, information: r.information ?? "" })) }],
      },
      {
        heading: "2.a.1 Productivity of major 2-3 crops under cereals, pulses, oilseeds, vegetables, fruits and others",
        parts: [{
          kind: "grid", noSerial: false,
          columns: [
            { key: "season", label: "Season" }, { key: "type", label: "Type" }, { key: "cropName", label: "Name of Crop" },
            { key: "areaHa", label: "Area(Ha)" }, { key: "productionMt", label: "Production(MT)" }, { key: "productivityQha", label: "Productivity(q/ha)" }, { key: "remarks", label: "Remarks" },
          ],
          rows: crops.map((r) => ({ season: r.season, type: r.type, cropName: r.cropName, areaHa: stringifyValue(r.areaHa), productionMt: stringifyValue(r.productionMt), productivityQha: stringifyValue(r.productivityQha), remarks: r.remarks ?? "" })),
        }],
      },
      {
        heading: "2.a.2 Mean yearly temperature, rainfall, humidity of the district",
        parts: [{
          kind: "grid", noSerial: false,
          columns: [
            { key: "month", label: "Month" }, { key: "rain", label: "Rainfall(mm)" },
            { key: "maxT", label: "Max. Temp. (0C)" }, { key: "minT", label: "Min. Temp. (0C)" },
            { key: "maxRh", label: "Max. R.H. (%)" }, { key: "minRh", label: "Min. R.H. (%)" }, { key: "remarks", label: "Remarks" },
          ],
          rows: weather.map((r) => ({
            month: r.month, rain: stringifyValue(r.rainfallMm), maxT: stringifyValue(r.maxTempC), minT: stringifyValue(r.minTempC),
            maxRh: stringifyValue(r.maxRhPct), minRh: stringifyValue(r.minRhPct), remarks: r.remarks ?? "",
          })),
        }],
      },
      {
        heading: "2.a.3 Production of major livestock products like milk, egg, meat etc",
        parts: [{ kind: "grid", noSerial: false, columns: [{ key: "livestockName", label: "Name of Livestock" }, { key: "number", label: "Number" }, { key: "remarks", label: "Remarks" }], rows: livestock.map((r) => ({ livestockName: r.livestockName, number: stringifyValue(r.number), remarks: r.remarks ?? "" })) }],
      },
    ],
  };
}

/**
 * `farmersByCategory` is stored in two shapes depending on which form wrote
 * it: the generic leaf registry writes flat keys
 * (`{ generalMale, generalFemale, obcMale, ... }`), while the bespoke CFLD /
 * NICRA / CRA forms write a nested one (`{ general: {m,f,t}, obc: {...}, ... }`).
 * Read both so no report table silently shows a zero caste block.
 */
function casteFromJson(json: unknown): CasteRecord {
  const j = (json ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const pick = (cat: string, sex: "Male" | "Female") => {
    const flat = num(j[`${cat}${sex}`]);
    if (flat) return flat;
    const nested = j[cat];
    return nested && typeof nested === "object"
      ? num((nested as Record<string, unknown>)[sex === "Male" ? "m" : "f"])
      : 0;
  };
  return {
    generalMale: pick("general", "Male"), generalFemale: pick("general", "Female"),
    obcMale: pick("obc", "Male"), obcFemale: pick("obc", "Female"),
    scMale: pick("sc", "Male"), scFemale: pick("sc", "Female"),
    stMale: pick("st", "Male"), stFemale: pick("st", "Female"),
  };
}

/** 5.2.A "Training & Awareness Program" (PPV & FRA, super-v2-prod.pdf p.89) - KVK-led, grouped caste M/F/T participant block (from the `farmersByCategory` JSON). */
async function buildPpvTraining(scope: ReportScope): Promise<CustomTableResult> {
  const raw = await prisma.ppvFraTrainingProgramme.findMany({
    where: scopeAndPeriod(scope, "ppvFraTrainingProgramme"),
    select: {
      date: true, title: true, type: true, venue: true, resourcePerson: true, farmersByCategory: true,
      kvk: { select: { name: true } },
    },
    orderBy: { kvk: { name: "asc" } },
  });
  const rows = raw.map((r) => ({ ...r, ...casteFromJson(r.farmersByCategory) }));
  return {
    columns: [
      { key: "kvk", label: "KVK" },
      { key: "date", label: "Date of training/awareness programme" },
      { key: "title", label: "Title" },
      { key: "type", label: "Type" },
      { key: "venue", label: "Venue" },
      { key: "rp", label: "Resource Person" },
      ...casteMftColumns("No. of the participant", { withGrand: false }),
      ...(["M", "F", "T"] as const).map((g) => ({ key: `tot${g}`, label: g, groups: ["Total"] })),
    ],
    noSerial: true,
    rows: rows.map((r) => {
      const c = casteMftRow([r], "", true);
      return {
        kvk: r.kvk.name,
        date: stringifyValue(r.date),
        title: r.title ?? "",
        type: r.type ?? "",
        venue: r.venue ?? "",
        rp: r.resourcePerson ?? "",
        ...casteMftRow([r], "", false),
        totM: c.grandM, totF: c.grandF, totT: c.grandT,
      };
    }),
  };
}

const KMAS_MSG_TYPES = [
  { key: "messagesCrop", label: "Crop" },
  { key: "messagesLivestock", label: "Livestock" },
  { key: "messagesWeather", label: "Weather" },
  { key: "messagesMarketing", label: "Marketing" },
  { key: "messagesAwareness", label: "Awareness" },
  { key: "messagesOtherEnterprises", label: "Other Enterprises" },
  { key: "messagesAnyOther", label: "Any Other" },
];

/** 5.3.F "Kisan Mobile Advisory Services/KMAS" (super-v2-prod.pdf p.91) - KVK, farmers covered, advisories, grouped "Type of messages". */
async function buildKmas(scope: ReportScope): Promise<CustomTableResult> {
  const rows = await prisma.digitalKmas.findMany({
    where: scopeAndPeriod(scope, "digitalKmas"),
    include: { kvk: { select: { name: true } } },
    orderBy: { kvk: { name: "asc" } },
  });
  const M = "Type of messages";
  return {
    columns: [
      { key: "kvk", label: "KVK" },
      { key: "covered", label: "No. of farmers covered" },
      { key: "sent", label: "No of advisories sent" },
      ...KMAS_MSG_TYPES.map((m) => ({ key: m.key, label: m.label, groups: [M] })),
    ],
    noSerial: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: rows.map((r: any) => ({
      kvk: r.kvk.name,
      covered: String(r.farmersCovered ?? 0),
      sent: String(r.advisoriesSent ?? 0),
      ...Object.fromEntries(KMAS_MSG_TYPES.map((m) => [m.key, String(r[m.key] ?? 0)])),
    })),
  };
}

/** 5.3.G "Details of messages send through other channels" (super-v2-prod.pdf p.91-92) - per KVK, one row per channel, grouped "Type of messages". */
async function buildDigitalOtherChannels(scope: ReportScope): Promise<CustomTableResult> {
  const rawRows = await prisma.digitalOtherChannel.findMany({
    where: scopeAndPeriod(scope, "digitalOtherChannel"),
    include: { kvk: { select: { name: true } } },
    orderBy: { kvk: { name: "asc" } },
  });
  // Real bug fix, 2026-09-14 - only "kvk" is filtered here: the list's other
  // 8 columns (textAdvisories/textFarmers/...) are a stray copy-paste of the
  // sibling KMAS leaf's fields, already flagged (2026-09-04) as not real
  // columns of this leaf - this report correctly uses the real
  // channel/farmersCovered/messagesXxx fields instead, which have no
  // equivalent list column to alias them to.
  const rows = applyListFilter(rawRows, scope, { kvk: (r) => r.kvk?.name ?? "" });
  const M = "Type of messages";
  const msgKeys = KMAS_MSG_TYPES.filter((m) => m.key !== "messagesAnyOther");
  const columns: ReportColumn[] = [
    { key: "channel", label: "Channel" },
    { key: "covered", label: "No. of farmers covered" },
    { key: "sent", label: "No of advisories sent" },
    ...msgKeys.map((m) => ({ key: m.key, label: m.label, groups: [M] })),
  ];
  if (rows.length === 0) return { columns, noSerial: true, keepEmpty: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = [...groupInto(rows as any[], (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [
      {
        kind: "grid" as const,
        noSerial: true,
        columns,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: (list as any[]).map((r) => ({
          channel: r.channel ?? "",
          covered: String(r.farmersCovered ?? 0),
          sent: String(r.advisoriesSent ?? 0),
          ...Object.fromEntries(msgKeys.map((m) => [m.key, String(r[m.key] ?? 0)])),
        })),
      },
    ],
  }));
  return { blocks };
}

/**
 * 3.11.B "CRA Extension Activity" (kvk-report 1.11.B) - one row per activity
 * with a General/OBC/SC/ST x M/F "Number of farmers under exposure" block.
 */
async function buildCraExtension(scope: ReportScope): Promise<CustomTableResult> {
  const records = await prisma.craExtensionActivity.findMany({
    where: scopeAndPeriod(scope, "craExtensionActivity"),
    select: {
      extensionActivity: true, withinOrWithoutState: true, exposureVisits: true,
      farmersUnderExposure: true, farmersByCategory: true, startDate: true, endDate: true,
      kvk: { select: { name: true } },
    },
    orderBy: [{ kvkId: "asc" }, { startDate: "asc" }],
  });
  const columns: ReportColumn[] = [
    { key: "kvk", label: "KVK" },
    { key: "activity", label: "Name of Extension Activity" },
    { key: "state", label: "Within State/Out of State" },
    { key: "visits", label: "Exposure visit (no.)" },
    { key: "start", label: "Start Date" },
    { key: "end", label: "End Date" },
    ...casteMftColumns("Number of farmers under exposure", { grandLabel: "Total" }),
  ];
  if (records.length === 0) return { columns, noSerial: true, keepEmpty: true };
  return {
    columns,
    noSerial: true,
    rows: records.map((r) => {
      const caste = casteFromJson(r.farmersByCategory);
      const anyCaste = CASTE_SUM_FIELDS.some((f) => caste[f] > 0);
      const casteCells = casteMftRow([caste], "", true);
      // Records entered before the caste block existed only have the single
      // count - show it in the Grand Total cell rather than losing it.
      if (!anyCaste && r.farmersUnderExposure) casteCells.grandT = String(r.farmersUnderExposure);
      return {
        kvk: r.kvk.name,
        activity: r.extensionActivity,
        state: r.withinOrWithoutState ?? "",
        visits: String(r.exposureVisits),
        start: stringifyValue(r.startDate),
        end: stringifyValue(r.endDate),
        ...casteCells,
      };
    }),
  };
}

/**
 * Model-name -> builder for every flat/near-flat table in sections 4/5/6.
 * `fetchTable` consults this when a tree entry has no explicit `custom`, so
 * both SUPER_ADMIN_TREE and KVK_TREE pick these up automatically despite
 * their different section numbering.
 */
const SECTION_456_BUILDERS: Record<string, (scope: ReportScope) => Promise<CustomTableResult>> = {
  kvkActivityImpact: flatReportTable({
    model: "kvkActivityImpact",
    lead: [STATE_LEAD, DISTRICT_LEAD],
    caption: "Impact of KVK activities/ large-scale adoption of technology",
    columns: [
      { key: "specificArea", label: "Name of specific area" },
      { key: "briefDetails", label: "Brief details of the area" },
      { key: "farmersBenefitted", label: "No. of farmers benefitted" },
      { key: "horizontalSpread", label: "Horizontal spread(in area/no.)" },
      { key: "adoptionPercent", label: "% Adoption" },
      { key: "impactSubjective", label: "Impact of the technology in subjective terms" },
      { key: "impactObjective", label: "Impact of the technology in objective terms" },
      { key: "incomeBefore", label: "Income Before" },
      { key: "incomeAfter", label: "Income After" },
    ],
  }),
  entrepreneurshipDetail: flatReportTable({
    model: "entrepreneurshipDetail",
    caption: "Details of entrepreneurship/startup developed by KVK",
    columns: [
      { key: "entrepreneurOrEnterprise", label: "Name of the entrepreneur" },
      { key: "enterpriseType", label: "Type of Enterprise" },
      { key: "yearOfEstablishment", label: "Year of establishment" },
      { key: "annualIncome", label: "Annual Income" },
      { key: "membersAssociated", label: "No of members" },
      { key: "technicalComponents", label: "Technical components" },
    ],
  }),
  successStory: flatReportTable({
    model: "successStory",
    columns: [
      { key: "farmerOrEntrepreneur", label: "Farmer Name" },
      { key: "storyTitle", label: "Story Title" },
      { key: "enterprise", label: "Enterprise" },
      { key: "netIncome", label: "Net Income" },
      { key: "costBenefitRatio", label: "Cost-Benefit Ratio" },
    ],
  }),
  districtLevelData: buildDistrictLevelData,
  districtCropProductivity: flatReportTable({
    model: "districtCropProductivity",
    columns: [
      { key: "season", label: "Season" }, { key: "type", label: "Type" }, { key: "cropName", label: "Name of Crop" },
      { key: "areaHa", label: "Area(Ha)" }, { key: "productionMt", label: "Production(MT)" }, { key: "productivityQha", label: "Productivity(q/ha)" }, { key: "remarks", label: "Remarks" },
    ],
  }),
  districtLivestockProduction: flatReportTable({
    model: "districtLivestockProduction",
    columns: [{ key: "livestockName", label: "Name of Livestock" }, { key: "number", label: "Number" }, { key: "remarks", label: "Remarks" }],
  }),
  operationalAreaDetail: flatReportTable({
    model: "operationalAreaDetail",
    lead: [KVK],
    columns: [
      { key: "taluk", label: "Name of Taluka" }, { key: "block", label: "Name of the block" }, { key: "village", label: "Name of the villages" },
      { key: "majorCrops", label: "Major crops" }, { key: "majorProblems", label: "Major problems identified (crop-wise)" }, { key: "thrustAreas", label: "Identified Thrust Areas" },
    ],
  }),
  villageAdoptionProgramme: flatReportTable({
    model: "villageAdoptionProgramme",
    lead: [{ key: "kvk", label: "KVK Name" }],
    columns: [{ key: "village", label: "Name of village" }, { key: "block", label: "Block" }, { key: "actionTaken", label: "Action taken for development" }],
  }),
  priorityThrustArea: flatReportTable({
    model: "priorityThrustArea",
    lead: [{ key: "kvk", label: "KVK Name" }],
    columns: [
      { key: "thrustArea", label: "Thrust area" },
      { key: "majorFocus", label: "Major Focus" },
      { key: "achievement", label: "Achievement" },
    ],
  }),
  demonstrationUnit: flatReportTable({
    model: "demonstrationUnit",
    caption: "Performance of Demonstration Units(Other than Instructional Farm)",
    // 93pg all-KVK export (super-v2-prod.pdf 4.3.A).
    columns: [
      { key: "demoUnitName", label: "Name of Demo Unit" }, { key: "yearOfEstt", label: "Year of Estt." }, { key: "areaSqMt", label: "Area (Sq. mt)" },
      { key: "varietyBreed", label: "Variety/Breed" }, { key: "produce", label: "Produce" }, { key: "qty", label: "Qty." },
      { key: "costOfInputs", label: "Cost of Inputs" }, { key: "grossIncome", label: "Gross Income" }, { key: "remarks", label: "Remarks" },
    ],
    // 50pg single-KVK export (Atari_Management_System_Deviation_Report.pdf 1.3.A).
    kvkColumns: [
      { key: "demoUnitName", label: "Name of Demo Unit" }, { key: "yearOfEstt", label: "Year of Estt." },
      { key: "areaSqMt", label: "Area (Sq. mt)" }, { key: "status", label: "Status" },
    ],
  }),
  instructionalFarmCrop: flatReportTable({
    model: "instructionalFarmCrop",
    caption: "Performance of Instructional Farm(Crops)",
    columns: [
      { key: "season", label: "Season" }, { key: "cropName", label: "Name Of the Crop" }, { key: "areaHa", label: "Area(ha)" },
      { key: "variety", label: "Variety", groups: ["Details of Production"] },
      { key: "produceType", label: "Type of Produce", groups: ["Details of Production"] },
      { key: "qty", label: "Qty.", groups: ["Details of Production"] },
      { key: "costOfInputs", label: "Cost of Inputs", groups: ["Amount(Rs.)"] },
      { key: "grossIncome", label: "Gross Income", groups: ["Amount(Rs.)"] },
      { key: "remarks", label: "Remarks" },
    ],
    noSerial: true,
  }),
  productionUnit: flatReportTable({
    model: "productionUnit",
    caption: "Performance of Production Units(Bio-agents/Bio-pesticides/Bio-fertilizers etc.,)",
    columns: [
      { key: "productName", label: "Name of the Product" }, { key: "qty", label: "Qty.(Kg)" },
      { key: "costOfInputs", label: "Cost of Inputs", groups: ["Amount(Rs.)"] },
      { key: "grossIncome", label: "Gross Income", groups: ["Amount(Rs.)"] },
      { key: "remarks", label: "Remarks" },
    ],
  }),
  instructionalFarmLivestock: flatReportTable({
    model: "instructionalFarmLivestock",
    caption: "Performance of Instructional Farm (livestock and fisheries production)",
    columns: [
      { key: "animalName", label: "Name of the Animal/Bird/Aquatics" },
      { key: "speciesBreed", label: "Species / Breed / Variety", groups: ["Details of Production"] },
      { key: "produceType", label: "Type of Produce", groups: ["Details of Production"] },
      { key: "qty", label: "Qty.", groups: ["Details of Production"] },
      { key: "costOfInputs", label: "Cost of Inputs", groups: ["Amount(Rs.)"] },
      { key: "grossIncome", label: "Gross Income", groups: ["Amount(Rs.)"] },
      { key: "remarks", label: "Remarks" },
    ],
    noSerial: true,
  }),
  hostelUtilization: flatReportTable({
    model: "hostelUtilization",
    caption: "Utilization of Hostel Facilities Accommodation Available(No. of Beds)",
    columns: [
      { key: "months", label: "Months" }, { key: "traineesStayed", label: "No. of Trainees Stayed" },
      { key: "traineeDays", label: "Trainee Days(Days Stayed)" }, { key: "reasonForShortFall", label: "Reason for Short Fall(if any)" },
    ],
  }),
  rainWaterHarvesting: flatReportTable({
    model: "rainWaterHarvesting",
    columns: [
      { key: "trainingProgrammes", label: "No of training programme conducted" }, { key: "demonstrations", label: "No. of demonstrations" },
      { key: "farmerVisits", label: "Visit by the farmers (No.)" }, { key: "officialVisits", label: "Visit by the officials (No.)" },
    ],
  }),
  budgetDetail: buildBudgetDetails,
  projectWiseBudgetPerformance: flatReportTable({
    model: "projectWiseBudgetPerformance",
    lead: [{ key: "kvk", label: "Name of KVK" }],
    columns: [
      { key: "projectName", label: "Name of project" }, { key: "accountNumber", label: "Account Number" }, { key: "fundingAgency", label: "Name of Funding agency" },
      { key: "budgetEstimate", label: "Budget Estimate" }, { key: "budgetAllocated", label: "Budget Allocated" }, { key: "budgetReleased", label: "Budget released" },
      { key: "expenditure", label: "Expenditure" }, { key: "unspentBalance", label: "Unspent balance as on 31st March" },
    ],
  }),
  revolvingFund: flatReportTable({
    model: "revolvingFund",
    lead: [{ key: "kvk", label: "Name of KVK" }],
    columns: [
      { key: "openingBalance", label: "Opening balance as on 1st April" }, { key: "incomeDuringYear", label: "Income during the year" },
      { key: "expenditureDuringYear", label: "Expenditure during the year" }, { key: "closing", label: "Closing" }, { key: "kind", label: "Kind" },
    ],
  }),
  revenueGeneration: flatReportTable({
    model: "revenueGeneration",
    lead: [KVK],
    columns: [{ key: "headName", label: "Name of Head" }, { key: "income", label: "Income (Rs.)" }, { key: "sponsoringAgency", label: "Sponsoring agency" }],
  }),
  resourceGeneration: flatReportTable({
    model: "resourceGeneration",
    lead: [{ key: "kvk", label: "Name of KVK" }],
    columns: [
      { key: "programmeName", label: "Name of the programme" }, { key: "purpose", label: "Purpose of the programme" }, { key: "sourcesOfFund", label: "Sources of fund" },
      { key: "amountLakhs", label: "Amount (Rs. lakhs)" }, { key: "infrastructureCreated", label: "Infrastructure created" },
    ],
  }),
  functionalLinkage: flatReportTable({
    model: "functionalLinkage",
    caption: "Functional Linkage with Different Organisations",
    columns: [{ key: "organizationName", label: "Name of Organization" }, { key: "natureOfLinkage", label: "Nature of Linkage" }],
  }),
  prevalentDiseaseCrop: flatReportTable({
    model: "prevalentDiseaseCrop",
    lead: [KVK],
    columns: [
      { key: "diseaseName", label: "Name of the Disease" }, { key: "crop", label: "Crop" }, { key: "outbreakDate", label: "Date of outbreak" },
      { key: "areaAffected", label: "Area affected (in ha)" }, { key: "commodityLossPercent", label: "% Commodity loss" }, { key: "preventiveMeasures", label: "Preventive measures taken for area (in ha)" },
    ],
  }),
  prevalentDiseaseLivestock: flatReportTable({
    model: "prevalentDiseaseLivestock",
    lead: [KVK],
    // Distinct column set from the Crops table (kvk-report 1.2.C): Livestock
    // Type / Mortality / animals treated, not area / commodity loss.
    columns: [
      { key: "diseaseName", label: "Name of the Disease" }, { key: "speciesAffected", label: "Livestock Type" }, { key: "outbreakDate", label: "Date of outbreak" },
      { key: "mortalityMorbidity", label: "Mortality (%)" }, { key: "animalsVaccinated", label: "No. of Animals Treated" }, { key: "preventiveMeasures", label: "Preventive Measures Taken" },
    ],
  }),
  ppvFraTrainingProgramme: buildPpvTraining,
  ppvFraFarmerDetail: flatReportTable({
    model: "ppvFraFarmerDetail",
    columns: [
      { key: "crop", label: "Name of Crop Registered" }, { key: "year", label: "Year of Registration" }, { key: "registrationNo", label: "Registration No." },
      { key: "farmerName", label: "Farmer Name" }, { key: "mobileNo", label: "Mobile No." }, { key: "district", label: "District" }, { key: "block", label: "Block" }, { key: "village", label: "Village" }, { key: "characteristics", label: "Characteristics" },
    ],
  }),
  raweFetFitProgramme: flatReportTable({
    model: "raweFetFitProgramme",
    lead: [KVK],
    caption: "Details of attachment training (RAWE) through KVK",
    columns: [{ key: "attachmentType", label: "Type of attachment" }, { key: "numberOfStudents", label: "No. of student trained" }, { key: "daysStayed", label: "No. of days stayed" }],
  }),
  vipVisitor: flatReportTable({
    model: "vipVisitor",
    lead: [KVK],
    caption: "List of other visitors (MP/MLA/DM/VC/Zila Parishad/Other Head of Organization/Foreigners)",
    columns: [{ key: "visitDate", label: "Date" }, { key: "ministerName", label: "Name of the person" }, { key: "observations", label: "Purpose of visit" }],
  }),
  digitalMobileApp: flatReportTable({
    model: "digitalMobileApp",
    lead: [KVK],
    columns: [
      { key: "mobileAppsDeveloped", label: "Number of Mobile Apps developed by KVK" }, { key: "appName", label: "Name of the Apps" }, { key: "appLanguage", label: "Language of the Apps" },
      { key: "meantFor", label: "Meant for crop/ livestock/ fishery/ others" }, { key: "timesDownloaded", label: "No. of times downloaded" },
    ],
  }),
  digitalWebPortal: flatReportTable({
    model: "digitalWebPortal",
    lead: [KVK],
    columns: [
      { key: "portalName", label: "Name of Web portal" },
      { key: "visitors", label: "No. of visitors visited the portal" },
      { key: "farmersRegistered", label: "No. of farmers registered on the portal" },
    ],
  }),
  digitalKisanSarathi: flatReportTable({
    model: "digitalKisanSarathi",
    lead: [{ key: "kvk", label: "Name of KVK" }],
    columns: [{ key: "farmersRegisteredKsp", label: "No. of farmers registered on KSP portal" }, { key: "phoneCallAddressed", label: "Phone call addressed" }, { key: "answeredCall", label: "Answered Call" }],
  }),
  digitalKmas: buildKmas,
  digitalOtherChannel: buildDigitalOtherChannels,
  sacMeeting: flatReportTable({
    model: "sacMeeting",
    lead: [KVK],
    caption: "Details of Scientific Advisory Committee(SAC) Meetings",
    columns: [
      { key: "startDate", label: "Start Date" }, { key: "endDate", label: "End Date" }, { key: "participants", label: "No of Participants" },
      { key: "statutoryMembers", label: "Total Statutory Members Present" }, { key: "recommendations", label: "Salient Recommendations" },
      { key: "actionTaken", label: "Taken", groups: ["Action"] },
      { key: "actionCompliance", label: "In Compliance", groups: ["Action"] },
      { key: "reason", label: "Reason", groups: ["Action"] },
    ],
  }),
  otherMeeting: flatReportTable({
    model: "otherMeeting",
    lead: [KVK],
    caption: "Details of other meeting related to ATARI",
    columns: [{ key: "date", label: "Date" }, { key: "meetingType", label: "Type of Meeting" }, { key: "agenda", label: "Agenda" }, { key: "representativeFromAtari", label: "Representative from ATARI" }],
  }),
};

/** SUPER_ADMIN_TREE section 4, in super-v2-prod.pdf's TOC order (4.2.A folds 2.a/2.a.1/2.a.3 into one composite). */
const PERFORMANCE_SECTION: Sec = {
  num: "4", title: "PERFORMANCE", subs: [
    { num: "4.1", title: "Impact", items: [
      { code: "4.1.A", title: "Impact of KVK activities", model: "kvkActivityImpact", scope: "direct" },
      { code: "4.1.B", title: "Entrepreneurship", model: "entrepreneurshipDetail", scope: "direct" },
      { code: "4.1.C", title: "Success Stories", model: "successStory", scope: "direct" },
    ]},
    { num: "4.2", title: "District and Village Performance", items: [
      { code: "4.2.A", title: "District Level Data", model: "districtLevelData", scope: "direct" },
      { code: "4.2.B", title: "Operational Area Details", model: "operationalAreaDetail", scope: "direct" },
      { code: "4.2.C", title: "Village Adoption Programme", model: "villageAdoptionProgramme", scope: "direct" },
      { code: "4.2.D", title: "Priority Thrust Area", model: "priorityThrustArea", scope: "direct" },
    ]},
    { num: "4.3", title: "Infrastructure Performance", items: [
      { code: "4.3.A", title: "Demonstration Units", model: "demonstrationUnit", scope: "direct" },
      { code: "4.3.B", title: "Instructional Farm (crops)", model: "instructionalFarmCrop", scope: "direct" },
      { code: "4.3.C", title: "Production Units", model: "productionUnit", scope: "direct" },
      { code: "4.3.D", title: "Instructional Farm (livestock)", model: "instructionalFarmLivestock", scope: "direct" },
      { code: "4.3.E", title: "Hostel Facilities", model: "hostelUtilization", scope: "direct" },
      { code: "4.3.F", title: "Rain Water Harvesting", model: "rainWaterHarvesting", scope: "direct" },
    ]},
    { num: "4.4", title: "Financial Performance", items: [
      { code: "4.4.A", title: "Budget Details", model: "budgetDetail", scope: "direct" },
      { code: "4.4.B", title: "Project-wise Budget Details", model: "projectWiseBudgetPerformance", scope: "direct" },
      { code: "4.4.C", title: "Status of revolving fund", model: "revolvingFund", scope: "direct" },
      { code: "4.4.D", title: "Revenue generation", model: "revenueGeneration", scope: "direct" },
      { code: "4.4.E", title: "Resource Generation", model: "resourceGeneration", scope: "direct" },
    ]},
    { num: "4.5", title: "Linkages", items: [
      { code: "4.5.A", title: "Functional Linkage with Different Organizations", model: "functionalLinkage", scope: "direct" },
    ]},
  ],
};

/** SUPER_ADMIN_TREE section 5, in super-v2-prod.pdf's TOC order. */
const MISCELLANEOUS_SECTION: Sec = {
  num: "5", title: "MISCELLANEOUS", subs: [
    { num: "5.1", title: "Prevalent Diseases", items: [
      { code: "5.1.A", title: "Prevalent diseases in Crops", model: "prevalentDiseaseCrop", scope: "direct" },
      { code: "5.1.B", title: "Prevalent diseases in Livestock/Fishery", model: "prevalentDiseaseLivestock", scope: "direct" },
    ]},
    { num: "5.2", title: "PPV & FRA Sensitization", items: [
      { code: "5.2.A", title: "Training & Awareness Program", model: "ppvFraTrainingProgramme", scope: "direct" },
      { code: "5.2.B", title: "Details of Plant Varieties", model: "ppvFraFarmerDetail", scope: "direct" },
    ]},
    { num: "5.3", title: "Digital Information", items: [
      { code: "5.3.A", title: "RAWE/FET programme", model: "raweFetFitProgramme", scope: "direct" },
      { code: "5.3.B", title: "List of VIP visitors", model: "vipVisitor", scope: "direct" },
      { code: "5.3.C", title: "Details of Mobile App", model: "digitalMobileApp", scope: "direct" },
      // super-v2-prod.pdf TOC p.8: "Details of Web Portal" / "messages send
      // through other channels" (verbatim, including the "send" phrasing).
      { code: "5.3.D", title: "Details of Web Portal", model: "digitalWebPortal", scope: "direct" },
      { code: "5.3.E", title: "Details of Kisan Sarathi", model: "digitalKisanSarathi", scope: "direct" },
      { code: "5.3.F", title: "Kisan Mobile Advisory Services/KMAS", model: "digitalKmas", scope: "direct" },
      { code: "5.3.G", title: "Details of messages send through other channels", model: "digitalOtherChannel", scope: "direct" },
    ]},
  ],
};

// ---------------------------------------------------------------------------
// Section 3 PROJECTS - builders. Transcribed from super-v2-prod.pdf p.55-82.
// Sub-pass 3a: the per-KVK-block and simple-aggregate tables that this
// schema fully backs. Tables whose reference columns need caste/detail
// fields the models don't carry yet are left on the generic path and
// flagged for a migration batch.
// ---------------------------------------------------------------------------

/** Per-KVK blocks with a "Sub-total — <KVK>" row and a trailing "Grand Total (all KVKs)" block. Shared by several section-3 tables. */
function kvkBlocksWithGrandTotal<R extends { kvk: { name: string } }>(
  records: R[],
  columns: ReportColumn[],
  rowOf: (r: R, index: number) => Record<string, string>,
  subtotalOf: (list: R[], label: string) => Record<string, string>,
  grandLabel = "Grand Total (all KVKs)",
): ReportBlock[] {
  const groups = [...groupInto(records, (r) => r.kvk.name).entries()];
  const blocks: ReportBlock[] = groups.map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [
      {
        kind: "grid" as const,
        columns,
        rows: list.map(rowOf),
        totalRow: subtotalOf(list, `Sub-total — ${kvkName}`),
      },
    ],
  }));
  if (records.length > 0) {
    blocks.push({
      heading: grandLabel,
      parts: [{ kind: "grid", noSerial: true, columns, rows: [], totalRow: subtotalOf(records, grandLabel) }],
    });
  }
  return blocks;
}

/** 3.1.B "CFLD Extension Activity" (super-v2-prod.pdf p.57-58) - per KVK, one row per activity with the General/OBC/SC/ST/Total M/F/T farmer block. */
async function buildCfldExtensionActivity(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.cfldExtensionActivity.findMany({
    where: scopeAndPeriod(scope, "cfldExtensionActivity"),
    select: {
      activitiesOrganized: true, season: true, date: true, placeOfActivity: true, ...CASTE_SELECT,
      kvk: { select: { name: true } },
    },
    orderBy: [{ kvkId: "asc" }, { date: "asc" }],
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK), same class as the
  // Achievements-section builders fixed earlier today. Field keys match the
  // list's own column keys (page.tsx's "extension-activity-cfld" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    season: (r: R) => r.season,
    activitiesOrganized: (r: R) => r.activitiesOrganized,
    date: (r: R) => r.date.toISOString().slice(0, 10),
    placeOfActivity: (r: R) => r.placeOfActivity,
    generalMale: (r: R) => String(r.generalMale),
    generalFemale: (r: R) => String(r.generalFemale),
    obcMale: (r: R) => String(r.obcMale),
    obcFemale: (r: R) => String(r.obcFemale),
    scMale: (r: R) => String(r.scMale),
    scFemale: (r: R) => String(r.scFemale),
    stMale: (r: R) => String(r.stMale),
    stFemale: (r: R) => String(r.stFemale),
  });
  const columns: ReportColumn[] = [
    { key: "activity", label: "Extension Activities organized" },
    { key: "season", label: "Season" },
    { key: "datePlace", label: "Date and place of activity" },
    ...casteMftColumns("Number of farmers", { grandLabel: "Total" }),
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: R) => ({
    activity: r.activitiesOrganized,
    season: r.season,
    datePlace: `${stringifyValue(r.date)} and ${r.placeOfActivity}`,
    ...casteMftRow([r], "", true),
  });
  const subtotalOf = (list: R[], label: string) => ({ activity: label, season: "", datePlace: "", ...casteMftRow(list, "", true) });
  return { blocks: kvkBlocksWithGrandTotal(records, columns, rowOf, subtotalOf) };
}

/** 3.3.A "NICRA Intervention" (super-v2-prod.pdf p.60) - per KVK, seed/fodder bank rows with a quantity sub-total. */
async function buildNicraIntervention(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraIntervention.findMany({
    where: scopeAndPeriod(scope, "nicraIntervention"),
    select: { seedBankFodderBank: true, crop: true, variety: true, quantityQuintal: true, startDate: true, endDate: true, kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { startDate: "asc" }],
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "intervention" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    startDate: (r: R) => r.startDate.toISOString().slice(0, 10),
    endDate: (r: R) => r.endDate.toISOString().slice(0, 10),
    seedBankFodderBank: (r: R) => r.seedBankFodderBank,
    crop: (r: R) => r.crop,
    variety: (r: R) => r.variety,
    quantity: (r: R) => String(r.quantityQuintal),
  });
  const columns: ReportColumn[] = [
    { key: "bankType", label: "Bank Type" },
    { key: "crop", label: "Crop" },
    { key: "variety", label: "Variety" },
    { key: "qty", label: "Quantity (q)" },
    { key: "start", label: "Start Date" },
    { key: "end", label: "End Date" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: R) => ({
    bankType: r.seedBankFodderBank,
    crop: r.crop,
    variety: r.variety,
    qty: stringifyValue(r.quantityQuintal),
    start: stringifyValue(r.startDate),
    end: stringifyValue(r.endDate),
  });
  const subtotalOf = (list: R[], label: string) => ({
    bankType: label, crop: "", variety: "",
    qty: String(list.reduce((s, r) => s + Number(r.quantityQuintal ?? 0), 0)),
    start: "", end: "",
  });
  return { blocks: kvkBlocksWithGrandTotal(records, columns, rowOf, subtotalOf, "Grand Total (all KVKs)") };
}

/** 3.3.B "NICRA Revenue Generated" (super-v2-prod.pdf p.60) - revenue per KVK. */
async function buildNicraRevenue(scope: ReportScope): Promise<CustomTableResult> {
  const records = await prisma.nicraRevenueGenerated.findMany({
    where: scopeAndPeriod(scope, "nicraRevenueGenerated"),
    select: { revenue: true, kvk: { select: { name: true } } },
    orderBy: { kvk: { name: "asc" } },
  });
  return {
    columns: [
      { key: "kvk", label: "KVK" },
      { key: "revenue", label: "Revenue Generated (Rs.)" },
    ],
    rows: [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvk, list]) => ({
      kvk,
      revenue: String(list.reduce((s, r) => s + Number(r.revenue ?? 0), 0)),
    })),
  };
}

/** 3.3.F "NICRA Convergence Programme" (super-v2-prod.pdf p.61-62) - per KVK, scheme rows with a count + amount sub-total. */
async function buildNicraConvergence(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraConvergenceProgramme.findMany({
    where: scopeAndPeriod(scope, "nicraConvergenceProgramme"),
    select: { scheme: true, natureOfWork: true, amount: true, startDate: true, endDate: true, kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { startDate: "asc" }],
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "convergence-programme" mapping).
  const records = applyListFilter(rawRecords, scope, {
    startDate: (r: R) => r.startDate.toISOString().slice(0, 10),
    endDate: (r: R) => r.endDate.toISOString().slice(0, 10),
    kvk: (r: R) => r.kvk.name,
    scheme: (r: R) => r.scheme,
    natureOfWork: (r: R) => r.natureOfWork,
    amount: (r: R) => String(r.amount),
  });
  const columns: ReportColumn[] = [
    { key: "kvk", label: "KVK" },
    { key: "start", label: "Start Date" },
    { key: "end", label: "End Date" },
    { key: "scheme", label: "Development Scheme / Programme" },
    { key: "nature", label: "Nature of Work" },
    { key: "amount", label: "Amount (Rs.)" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: R) => ({
    kvk: r.kvk.name,
    start: stringifyValue(r.startDate),
    end: stringifyValue(r.endDate),
    scheme: r.scheme,
    nature: r.natureOfWork,
    amount: stringifyValue(r.amount),
  });
  const subtotalOf = (list: R[], label: string) => ({
    kvk: `${label} (${list.length} record${list.length === 1 ? "" : "s"})`,
    start: "", end: "", scheme: "", nature: "",
    amount: String(list.reduce((s, r) => s + Number(r.amount ?? 0), 0)),
  });
  return { blocks: kvkBlocksWithGrandTotal(records, columns, rowOf, subtotalOf) };
}

/** 3.3.G "NICRA Dignitaries Visited" (super-v2-prod.pdf p.62) - per KVK, one row per visit + a visit count. */
async function buildNicraDignitaries(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraDignitaryVisit.findMany({
    where: scopeAndPeriod(scope, "nicraDignitaryVisit"),
    select: { vipExperts: true, name: true, dateOfVisit: true, remark: true, kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { dateOfVisit: "asc" }],
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "dignitaries-visited-nicra-villages" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    vipExperts: (r: R) => r.vipExperts,
    name: (r: R) => r.name,
    dateOfVisit: (r: R) => r.dateOfVisit.toISOString().slice(0, 10),
  });
  const columns: ReportColumn[] = [
    { key: "date", label: "Date of Visit" },
    { key: "type", label: "Dignitary Type" },
    { key: "name", label: "Name" },
    { key: "remark", label: "Remark" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: R) => ({ date: stringifyValue(r.dateOfVisit), type: r.vipExperts, name: r.name, remark: r.remark ?? "" });
  const subtotalOf = (list: R[], label: string) => ({ date: `${label} (visits)`, type: "", name: "", remark: String(list.length) });
  return { blocks: kvkBlocksWithGrandTotal(records, columns, rowOf, subtotalOf) };
}

/** 3.3.H "NICRA PI/Co-PI List" (super-v2-prod.pdf p.62) - per KVK. */
async function buildNicraPiCoPi(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraPiCoPi.findMany({
    where: scopeAndPeriod(scope, "nicraPiCoPi"),
    include: { kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { startDate: "asc" }],
  });
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "pi-co-pi-list" mapping).
  const records = applyListFilter(rawRecords, scope, {
    startDate: (r) => r.startDate.toISOString().slice(0, 10),
    endDate: (r) => r.endDate.toISOString().slice(0, 10),
    kvk: (r) => r.kvk.name,
    piCoPi: (r) => r.piCoPi,
    name: (r) => r.name,
  });
  const columns: ReportColumn[] = [
    { key: "type", label: "Type" },
    { key: "name", label: "Name" },
    { key: "start", label: "Start date" },
    { key: "end", label: "End date" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [
      {
        kind: "grid" as const,
        columns,
        rows: list.map((r) => ({ type: r.piCoPi, name: r.name, start: stringifyValue(r.startDate), end: stringifyValue(r.endDate) })),
      },
    ],
  }));
  return { blocks };
}

/**
 * 3.2.C / 3.2.D - super-v2-prod.pdf p.60 is a State x General/OBC/SC/ST/Total
 * (M/F/T) pivot with a Grand Total row. kvk-report p.28 is a per-record detail
 * grid: 3.2.C Training = "Title of the training course / Period / Duration /
 * Training Type / caste"; 3.2.D Extension = "State / KVK / Name of the activity
 * / Number of Programmes / caste".
 */
function buildNicraStatePivot(model: "nicraTraining" | "nicraExtensionActivity", countLabel: string) {
  return async (scope: ReportScope): Promise<CustomTableResult> => {
    if (scope.kvkId && model === "nicraExtensionActivity") {
      const records = await prisma.nicraExtensionActivity.findMany({
        where: { kvkId: scope.kvkId },
        select: { activityName: true, ...CASTE_SELECT, kvk: { select: { name: true, state: { select: { name: true } } } } },
        orderBy: { startDate: "asc" },
      });
      // A single-KVK report shows no State/KVK identifying columns - the
      // client wants nothing state-related anywhere in a KVK's own report,
      // even though the 50pg reference prints them here (client, 2026-09-08).
      const columns: ReportColumn[] = [
        { key: "activity", label: "Name of the activity" },
        { key: "count", label: "Number of Programmes" },
        ...casteMftColumns("", { flat: true, grandLabel: "Total" }),
      ];
      if (records.length === 0) return { columns, keepEmpty: true };
      return {
        columns,
        rows: records.map((r) => ({
          activity: r.activityName,
          count: "1",
          ...casteMftRow([r], "", true),
        })),
        totalRow: { activity: "Grand Total", count: String(records.length), ...casteMftRow(records, "", true) },
      };
    }
    if (scope.kvkId && model === "nicraTraining") {
      const rawRecords = await prisma.nicraTraining.findMany({
        where: { kvkId: scope.kvkId },
        select: { title: true, startDate: true, endDate: true, duration: true, trainingType: true, farmersAttended: true, ...CASTE_SELECT, kvk: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      });
      // Real bug fix, 2026-09-14 - always `blocks` (a single per-KVK band).
      // Field keys match the list's own column keys (page.tsx's NICRA
      // "training" mapping).
      const records = applyListFilter(rawRecords, scope, {
        kvk: (r) => r.kvk.name,
        title: (r) => r.title,
        startDate: (r) => r.startDate.toISOString().slice(0, 10),
        endDate: (r) => r.endDate.toISOString().slice(0, 10),
        farmersAttended: (r) => String(r.farmersAttended),
      });
      const columns: ReportColumn[] = [
        { key: "title", label: "Title of the training course" },
        { key: "period", label: "Period of Training program" },
        { key: "duration", label: "Duration" },
        { key: "ttype", label: "Training Type" },
        ...casteMftColumns("", { flat: true, grandLabel: "Total" }),
      ];
      if (records.length === 0) return { columns, keepEmpty: true };
      // kvk-report p.28 prints a "KVK <name>" band above the training grid.
      return {
        blocks: [{
          heading: records[0].kvk.name,
          parts: [{
            kind: "grid",
            columns,
            rows: records.map((r) => ({
              title: r.title,
              period: `${stringifyValue(r.startDate)} to ${stringifyValue(r.endDate)}`,
              duration: r.duration ?? "",
              ttype: r.trainingType ?? "",
              ...casteMftRow([r], "", true),
            })),
            totalRow: { title: "Grand Total", period: "", duration: "", ttype: "", ...casteMftRow(records, "", true) },
          }],
        }],
      };
    }
    const [records, stateNames] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any)[model].findMany({
        where: { zoneId: scope.zoneId },
        select: { ...CASTE_SELECT, kvk: { select: { state: { select: { name: true } } } } },
      }) as Promise<(CasteRecord & { kvk: { state: { name: string } } })[]>,
      reportStates(scope.zoneId),
    ]);
    const columns: ReportColumn[] = [
      { key: "state", label: "State" },
      { key: "count", label: countLabel },
      ...casteMftColumns("", { flat: true, grandLabel: "Total" }),
    ];
    const rowFor = (list: typeof records) => ({ count: String(list.length), ...casteMftRow(list, "", true) });
    return {
      columns,
      noSerial: true,
      rows: stateNames.map((st) => ({ state: st, ...rowFor(records.filter((r) => r.kvk.state.name === st)) })),
      totalRow: { state: "Grand Total", ...rowFor(records) },
    };
  };
}

/** 3.3.C "NICRA Custom Hiring" (super-v2-prod.pdf p.61) - one block per "KVK - State", caste M/F/T beneficiary block then area/hours/revenue/expenditure. */
async function buildNicraCustomHiring(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraCustomHiringFarmImplement.findMany({
    where: scopeAndPeriod(scope, "nicraCustomHiringFarmImplement"),
    select: {
      farmImplementName: true, areaCovered: true, hoursUsed: true, revenueGenerated: true, repairExpenditure: true, ...CASTE_SELECT,
      kvk: { select: { name: true, state: { select: { name: true } } } },
    },
    orderBy: { kvk: { name: "asc" } },
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "custom-hiring-farm-implement" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    farmImplementName: (r: R) => r.farmImplementName,
    areaCovered: (r: R) => String(r.areaCovered),
    hoursUsed: (r: R) => String(r.hoursUsed),
    revenueGenerated: (r: R) => String(r.revenueGenerated),
    repairExpenditure: (r: R) => String(r.repairExpenditure),
  });
  const columns: ReportColumn[] = [
    { key: "impl", label: "Name of farm implement/equipment" },
    ...casteMftColumns("", { flat: true, grandLabel: "Total" }),
    { key: "area", label: "Area covered by Farm Implement" },
    { key: "hours", label: "Farm Implement used (In Hours)" },
    { key: "revenue", label: "Revenue generated by Farm Implement (Rs.)" },
    { key: "expenditure", label: "Expenditure incurred on repairing (Rs.)" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  // A single-KVK report never carries a state name in a heading (client, 2026-09-08).
  const blockKey = (r: R) => (scope.kvkId ? r.kvk.name : `${r.kvk.name} — ${r.kvk.state?.name ?? ""}`);
  const blocks: ReportBlock[] = [...groupInto(records, blockKey).entries()].map(
    ([heading, list]) => ({
      heading,
      parts: [
        {
          kind: "grid" as const,
          columns,
          rows: list.map((r: R) => ({
            impl: r.farmImplementName,
            ...casteMftRow([r], "", true),
            area: stringifyValue(r.areaCovered),
            hours: stringifyValue(r.hoursUsed),
            revenue: stringifyValue(r.revenueGenerated),
            expenditure: stringifyValue(r.repairExpenditure),
          })),
        },
      ],
    }),
  );
  return { blocks };
}

/** 3.3.D "NICRA VCRMC" (super-v2-prod.pdf p.61) - per KVK, one row per village. */
async function buildNicraVcrmc(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraVillageWiseVcrmc.findMany({
    where: scopeAndPeriod(scope, "nicraVillageWiseVcrmc"),
    include: { kvk: { select: { name: true } } },
    orderBy: { kvk: { name: "asc" } },
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "village-wise-vcrmc" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    villageName: (r: R) => r.villageName,
    constitutionDate: (r: R) => (r.constitutionDate ? r.constitutionDate.toISOString().slice(0, 10) : ""),
    members: (r: R) => String(r.members),
    meetingsOrganized: (r: R) => String(r.meetingsOrganized),
    meetingDate: (r: R) => (r.meetingDate ? r.meetingDate.toISOString().slice(0, 10) : ""),
    secretaryName: (r: R) => r.secretaryName ?? "",
  });
  const M = "VCRMC members (no.)";
  const columns: ReportColumn[] = [
    { key: "village", label: "Village name" },
    { key: "constitution", label: "VCRMC Constitution date" },
    { key: "mMale", label: "Male", groups: [M] },
    { key: "mFemale", label: "Female", groups: [M] },
    { key: "mTotal", label: "Total", groups: [M] },
    { key: "meetings", label: "Meetings organized by VCRMC (no.)" },
    { key: "meetingDate", label: "Date of VCRMC meeting" },
    { key: "secretary", label: "Name of Secretary" },
    { key: "president", label: "Name of President" },
    { key: "decision", label: "Major decision taken" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [
      {
        kind: "grid" as const,
        columns,
        rows: list.map((r: R) => {
          const male = r.membersMale ?? 0;
          const female = r.membersFemale ?? 0;
          return {
            village: r.villageName,
            constitution: stringifyValue(r.constitutionDate),
            mMale: r.membersMale != null ? String(male) : "",
            mFemale: r.membersFemale != null ? String(female) : "",
            mTotal: r.membersMale != null || r.membersFemale != null ? String(male + female) : String(r.members),
            meetings: String(r.meetingsOrganized),
            meetingDate: stringifyValue(r.meetingDate),
            secretary: r.secretaryName ?? "",
            president: r.presidentName ?? "",
            decision: r.majorDecision ?? "",
          };
        }),
      },
    ],
  }));
  return { blocks };
}

/** 3.3.E "NICRA Soil Health Card" (super-v2-prod.pdf p.61) - per KVK, samples + caste M/F/T farmer-benefitted block. */
async function buildNicraSoilHealthCard(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nicraSoilHealthCard.findMany({
    where: scopeAndPeriod(scope, "nicraSoilHealthCard"),
    select: {
      startDate: true, endDate: true, samplesCollected: true, samplesAnalysed: true, shcIssued: true, farmersBenefitted: true,
      ...CASTE_SELECT, kvk: { select: { name: true } },
    },
    orderBy: { kvk: { name: "asc" } },
  });
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "soil-health-card" mapping).
  const records = applyListFilter(rawRecords, scope, {
    startDate: (r: R) => r.startDate.toISOString().slice(0, 10),
    endDate: (r: R) => r.endDate.toISOString().slice(0, 10),
    kvk: (r: R) => r.kvk.name,
    samplesCollected: (r: R) => String(r.samplesCollected),
    samplesAnalysed: (r: R) => String(r.samplesAnalysed),
    shcIssued: (r: R) => String(r.shcIssued),
    farmersBenefitted: (r: R) => String(r.farmersBenefitted),
  });
  const columns: ReportColumn[] = [
    { key: "collected", label: "No. of soil samples collected" },
    { key: "analysed", label: "No. of samples analysed" },
    { key: "issued", label: "SHC issued" },
    ...casteMftColumns("", { flat: true, grandLabel: "Total" }),
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [
      {
        kind: "grid" as const,
        columns,
        rows: list.map((r: R) => ({
          collected: String(r.samplesCollected),
          analysed: String(r.samplesAnalysed),
          issued: String(r.shcIssued),
          ...casteMftRow([r], "", true),
        })),
      },
    ],
  }));
  return { blocks };
}

/** 3.1.C "CFLD Budget Utilization" (super-v2-prod.pdf p.58-59) - per KVK, one SL row per record expanded into 4 item rows (Critical Input / Extension Activities / Publication / TA/DA). */
const CFLD_BUDGET_ITEMS = [
  { label: "Critical Input", r: "criticalInputReceived", u: "criticalInputUtilization", b: "criticalInputBalance" },
  { label: "Extension Activities", r: "extensionReceived", u: "extensionUtilization", b: "extensionBalance" },
  { label: "Publication", r: "publicationReceived", u: "publicationUtilization", b: "publicationBalance" },
  { label: "TA/DA", r: "taDaReceived", u: "taDaUtilization", b: "taDaBalance" },
] as const;

async function buildCfldBudgetUtilization(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.cfldBudgetUtilization.findMany({
    where: scopeAndPeriod(scope, "cfldBudgetUtilization"),
    include: { kvk: { select: { name: true } } },
    orderBy: { kvk: { name: "asc" } },
  });
  type R = (typeof rawRecords)[number] & Record<string, unknown>;
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "budget-utilization" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    crop: (r) => r.crop,
    season: (r) => r.season,
    overallFundAllocation: (r) => String(r.overallFundAllocation),
  });
  const columns: ReportColumn[] = [
    { key: "sl", label: "SL." },
    { key: "season", label: "Season" },
    { key: "crop", label: "Crop (Provide crop wise information)" },
    { key: "fund", label: "Overall fund allocation" },
    { key: "alloted", label: "Area (ha) alloted" },
    { key: "achieved", label: "Area (ha) achieved" },
    { key: "item", label: "Items" },
    { key: "received", label: "Budget Received (Rs.)" },
    { key: "utilization", label: "Budget Utilization (Rs.)" },
    { key: "balance", label: "Balance (Rs.)" },
  ];
  if (records.length === 0) return { columns, noSerial: true, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: `KVK: ${kvkName}`,
    parts: [
      {
        kind: "grid" as const,
        noSerial: true,
        columns,
        rows: list.flatMap((rec, recIndex) => {
          const r = rec as R;
          return CFLD_BUDGET_ITEMS.map((item, i) => ({
            sl: i === 0 ? String(recIndex + 1) : "",
            season: i === 0 ? rec.season : "",
            crop: i === 0 ? rec.crop : "",
            fund: i === 0 ? stringifyValue(rec.overallFundAllocation) : "",
            alloted: i === 0 ? stringifyValue(rec.areaAllotedHa) : "",
            achieved: i === 0 ? stringifyValue(rec.areaAchievedHa) : "",
            item: item.label,
            received: stringifyValue(r[item.r]),
            utilization: stringifyValue(r[item.u]),
            balance: stringifyValue(r[item.b]),
          }));
        }),
      },
    ],
  }));
  return { blocks };
}

/** Reads `farmersByCategory` JSON into a "No. of Participants" General/OBC/SC/ST M/F/T + Grand Total M/F/T row (shared by 3.10.B / 3.11.A / 3.14.A). */
function jsonCasteRow(json: unknown): Record<string, string> {
  return casteMftRow([casteFromJson(json)], "", true);
}

/** 3.5.A "NF Geographical Information" (super-v2-prod.pdf p.64-65) - per KVK. */
async function buildNfGeographical(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nfGeographicalInfo.findMany({
    where: scopeAndPeriod(scope, "nfGeographicalInfo"),
    include: { kvk: { select: { name: true } } },
    orderBy: [{ kvkId: "asc" }, { startDate: "asc" }],
  });
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "nf-geographical" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    startDate: (r) => r.startDate.toISOString().slice(0, 10),
    endDate: (r) => r.endDate.toISOString().slice(0, 10),
    agroClimaticZone: (r) => r.agroClimaticZone,
    farmingSituation: (r) => r.farmingSituation,
    latitude: (r) => String(r.latitude),
    longitude: (r) => String(r.longitude),
  });
  const columns: ReportColumn[] = [
    { key: "start", label: "Start date" },
    { key: "end", label: "End date" },
    { key: "zone", label: "Agro-climatic zone" },
    { key: "situation", label: "Farming situation of selected farmer" },
    { key: "lat", label: "Latitude (N)" },
    { key: "lng", label: "Longitude (E)" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [
      {
        kind: "grid" as const,
        columns,
        rows: list.map((r) => ({
          start: stringifyValue(r.startDate),
          end: stringifyValue(r.endDate),
          zone: r.agroClimaticZone,
          situation: r.farmingSituation,
          lat: stringifyValue(r.latitude),
          lng: stringifyValue(r.longitude),
        })),
      },
    ],
  }));
  return { blocks };
}

const AGRI_DRONE_PARAMS: { label: string; key: string }[] = [
  { label: "Name of the project implementing centre (PIC)", key: "centreName" },
  { label: "No. of Agri Drones Sanctioned", key: "dronesSanctioned" },
  { label: "No. of Agri Drones Purchased", key: "dronesPurchased" },
  { label: "Amount sanctioned (Rs)", key: "amountSanctioned" },
  { label: "Purchased cost of each Drone (Rs.)", key: "costPerDrone" },
  { label: "Company and Model of Drone", key: "_companyModel" },
  { label: "Name and contact No of Agri Drone Pilot", key: "pilotNameContact" },
  { label: "Target Area for Agri Drone Demonstration (ha) (1 demo = 1 ha area)", key: "targetAreaHa" },
  { label: "Amount sanctioned for Agri Drone Demonstrations (Rs.)", key: "amountSanctionedDemo" },
  { label: "Amount utilised for Agri Drone Demonstrations (Rs.)", key: "amountUtilisedDemo" },
  { label: "Area covered under demos (area in ha)", key: "areaCoveredDemoHa" },
  { label: "Operation carried out (Pesticide/Weedicide/Nutrient application) in demonstration organised", key: "operationType" },
  { label: "Number of farmers participated during demonstration", key: "farmersParticipated" },
  { label: "Advantages of using Agri Drones as observed during the demonstrations", key: "advantages" },
];

/** 3.8.A "Agri-Drone Introduction" (super-v2-prod.pdf p.78-79) - one "Name of parameter / Details of parameter" list per implementing centre. */
async function buildAgriDroneIntroduction(scope: ReportScope): Promise<CustomTableResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRecords: Record<string, any>[] = await prisma.agriDroneIntroduction.findMany({
    where: scopeAndPeriod(scope, "agriDroneIntroduction"),
    include: { kvk: { select: { name: true } } },
    orderBy: { year: "asc" },
  });
  // Real bug fix, 2026-09-14 - each record becomes its own fixed-parameter
  // grid (param/detail rows), so even the general client-side blocks fix
  // can't reach it - no column here is ever named "kvk"/"year"/etc. Field
  // keys match the list's own column keys (page.tsx's
  // "agri-drone-introduction" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk?.name ?? "",
    year: (r) => String(r.year),
    centreName: (r) => r.centreName ?? "",
    companyOfDrone: (r) => r.companyOfDrone ?? "",
    modelOfDrone: (r) => r.modelOfDrone ?? "",
    dronesSanctioned: (r) => String(r.dronesSanctioned ?? ""),
  });
  const paramCols: ReportColumn[] = [
    { key: "param", label: "Name of parameter" },
    { key: "detail", label: "Details of parameter" },
  ];
  const CAPTION = "Information of Agri Drone project implementation by the different Institutions/KVK";
  if (records.length === 0) {
    // Show the fixed parameter list with blank details so a tester sees the exact shape.
    return { caption: CAPTION, columns: paramCols, rows: AGRI_DRONE_PARAMS.map((p) => ({ param: p.label, detail: "" })), keepEmpty: true };
  }
  const blocks: ReportBlock[] = [
    { heading: CAPTION, align: "center", parts: [] },
  ];
  for (const r of records) {
    blocks.push({
      // super-v2-prod.pdf p.78-79 runs the per-PIC parameter tables back to
      // back with a real S.No. column; the PIC name is row 1's value, not a heading.
      heading: "",
      parts: [
        {
          kind: "grid" as const,
          columns: [
            { key: "param", label: "Name of parameter" },
            { key: "detail", label: "Details of parameter" },
          ],
          rows: AGRI_DRONE_PARAMS.map((p) => ({
            param: p.label,
            detail: p.key === "_companyModel" ? `${r.companyOfDrone ?? ""} and ${r.modelOfDrone ?? ""}` : stringifyValue(r[p.key]),
          })),
        },
      ],
    });
  }
  return { blocks };
}

/**
 * 3.10.B "DRMR Activity" (super-v2-prod.pdf p.80-81 / kvk-report 1.10.A) - a
 * caption, then one "KVK <name> | Reporting Year: <date>" block per submission
 * holding the fixed Item/Activity list (with the "Frontline demonstrations..."
 * and "Input Distribution" band headers) and a General/OBC/SC/ST x M/F block
 * per row. Rows come from `DrmrActivityItem`; unfilled rows show blank. The
 * 50pg kvk-report carries an extra "Name/Specification" column the 93pg does not.
 */
const DRMR_ROWS: { band?: string; itemKey?: string; label: string; unit: string }[] = [
  { itemKey: "training", label: "Training (Capacity building /skill development etc)", unit: "Days" },
  { band: "Frontline demonstrations (FLDs) and other demonstrations", label: "" , unit: "" },
  { itemKey: "areaUnderFlds", label: "Area under FLDs", unit: "Hectare" },
  { itemKey: "awarenessCamps", label: "Awareness camps, exposure visit etc", unit: "No." },
  { band: "Input Distribution", label: "", unit: "" },
  { itemKey: "seeds", label: "Seeds (Field Crops)", unit: "Kg" },
  { itemKey: "smallEquipments", label: "Small equipments (Upto Rs.2000)", unit: "Number" },
  { itemKey: "largeEquipments", label: "Large equipments (more than Rs.2000)", unit: "Number" },
  { itemKey: "fertilizers", label: "Fertilizers (NPK)/ Secondary/ Micro Fertilizers", unit: "Kg" },
  { itemKey: "ppChemicals", label: "Plant Protection chemicals", unit: "Lit." },
  { itemKey: "distributionOfLiterature", label: "Distribution of Literature", unit: "No." },
  { itemKey: "kisanMela", label: "Kisan Mela", unit: "No." },
  { itemKey: "anyOther", label: "Any other (specify)", unit: "" },
];

async function buildDrmrActivity(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.drmrActivity.findMany({
    where: scopeAndPeriod(scope, "drmrActivity"),
    select: {
      startDate: true,
      kvk: { select: { name: true } },
      items: { select: { itemKey: true, nameSpecification: true, unit: true, quantity: true, farmersByCategory: true } },
    },
    orderBy: [{ kvk: { name: "asc" } }, { startDate: "asc" }],
  });
  // Real bug fix, 2026-09-14 - blocks, per-activity. Only `kvk`/`startDate`
  // map to the list's own column keys (page.tsx's "drmr-activity" mapping) -
  // the rest of the list's columns (endDate/training/flds/...) live on the
  // activity itself but aren't selected here, since this table's own grid
  // reads the real, separately-populated `items` child rows instead.
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    startDate: (r) => r.startDate.toISOString().slice(0, 10),
  });
  const singleKvk = !!scope.kvkId;
  const CAPTION =
    "Details Augmenting Rapeseed- Mustard Production of Tribal Farmers of Following states for Sustainable Livelihood Security under Scheduled Tribe Component";
  const columns: ReportColumn[] = [
    { key: "item", label: "Item/Activity" },
    ...(singleKvk ? [{ key: "nameSpec", label: "Name/Specification" }] : []),
    { key: "unit", label: "Unit" },
    { key: "qty", label: "Quantity" },
    ...casteMftColumns("No. of Participants", { grandLabel: "Grand Total" }),
  ];
  type R = (typeof records)[number];
  const blank = { item: "", nameSpec: "", unit: "", qty: "" } as Record<string, string>;
  const rowsFor = (items: R["items"]) => {
    const byKey = new Map(items.map((it) => [it.itemKey, it]));
    return DRMR_ROWS.map((def) => {
      if (def.band) return { ...blank, item: def.band };
      const it = def.itemKey ? byKey.get(def.itemKey) : undefined;
      return {
        item: def.label,
        nameSpec: it?.nameSpecification ?? "-",
        unit: it?.unit ?? def.unit,
        qty: it?.quantity != null ? stringifyValue(it.quantity) : "",
        ...casteMftRow([casteFromJson(it?.farmersByCategory ?? null)], "", true),
      };
    });
  };
  if (records.length === 0) {
    return { caption: CAPTION, columns, noSerial: true, keepEmpty: true, rows: rowsFor([]) };
  }
  const blocks: ReportBlock[] = records.map((r: R) => ({
    heading: `${r.kvk.name} | Reporting Year: ${r.startDate ? stringifyValue(r.startDate) : "-"}`,
    parts: [{ kind: "grid" as const, noSerial: true, columns, rows: rowsFor(r.items) }],
  }));
  return { caption: CAPTION, blocks };
}

/** 3.11.A "CRA Details" (super-v2-prod.pdf p.81) - one block per state ("A. State: Bihar" ...), a serial column, farming-system+crop merged, and the caste participant block from `farmersByCategory`. */
async function buildCraDetails(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.craDetail.findMany({
    where: scopeAndPeriod(scope, "craDetail"),
    select: {
      season: true, technologyDemonstrated: true, croppingSystem: true, areaHa: true,
      farmingSystem: true, crop: true, cropYieldQha: true, systemProductivityQha: true, totalReturnRsHa: true,
      yieldFarmerPracticeQha: true, farmersByCategory: true,
      kvk: { select: { name: true, state: { select: { name: true } } } },
    },
    orderBy: [{ kvk: { state: { name: "asc" } } }, { kvk: { name: "asc" } }],
  });
  // Real bug fix, 2026-09-14 - blocks, per-KVK/state. Field keys match the
  // list's own column keys (page.tsx's "cra-details" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    season: (r) => r.season,
    technologyDemonstrated: (r) => r.technologyDemonstrated,
    croppingSystem: (r) => r.croppingSystem,
    areaHa: (r) => String(r.areaHa),
  });
  const columns: ReportColumn[] = [
    { key: "season", label: "Season" },
    { key: "tech", label: "Technology demonstrated / interventions" },
    { key: "croppingSystem", label: "Cropping system" },
    { key: "farmingCrop", label: "Farming system crop under demonstration" },
    { key: "area", label: "Area under demonstration (in ac)" },
    { key: "cropYield", label: "Crop yield (q/ha)" },
    { key: "sysProd", label: "System productivity (q/ha)" },
    { key: "totalReturn", label: "Total return (Rs./ha)" },
    { key: "yieldFp", label: "Yield obtained under farmer practice (q/ha)" },
    ...casteMftColumns("No. of farmers under demonstration", { grandLabel: "Total" }),
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const rowOf = (r: (typeof records)[number]) => ({
    season: r.season,
    tech: r.technologyDemonstrated,
    croppingSystem: r.croppingSystem,
    farmingCrop: [r.farmingSystem, r.crop].filter(Boolean).join(" - "),
    area: stringifyValue(r.areaHa),
    cropYield: stringifyValue(r.cropYieldQha),
    sysProd: stringifyValue(r.systemProductivityQha),
    totalReturn: stringifyValue(r.totalReturnRsHa),
    yieldFp: stringifyValue(r.yieldFarmerPracticeQha),
    ...jsonCasteRow(r.farmersByCategory),
  });
  const letters = ["A", "B", "C", "D", "E", "F"];
  // Single-KVK report groups by KVK ("A. KVK: <name>"), not by state, so no
  // Bihar/Jharkhand appears in a KVK's own report (client 2026-09-08).
  const grouped = scope.kvkId
    ? [...groupInto(records, (r) => r.kvk.name).entries()]
    : [...groupInto(records, (r) => r.kvk.state?.name ?? "").entries()];
  const blocks: ReportBlock[] = grouped.map(([name, list], i) => ({
    heading: `${letters[i] ?? String(i + 1)}. ${scope.kvkId ? "KVK" : "State"}: ${name}`,
    parts: [{ kind: "grid", noSerial: false, columns, rows: list.map(rowOf) }],
  }));
  return { blocks };
}

/** 3.14.A "Other Programmes" (super-v2-prod.pdf p.82) - flat, plus the caste participant block from `farmersByCategory`. */
async function buildOtherProgrammes(scope: ReportScope): Promise<CustomTableResult> {
  const records = await prisma.otherProgramme.findMany({
    where: scopeAndPeriod(scope, "otherProgramme"),
    select: { programmeName: true, programmeDate: true, venue: true, purpose: true, participants: true, farmersByCategory: true, kvk: { select: { name: true } } },
    orderBy: { kvk: { name: "asc" } },
  });
  return {
    columns: [
      { key: "name", label: "Name of the programme" },
      { key: "date", label: "Date of the programme" },
      { key: "venue", label: "Venue" },
      { key: "purpose", label: "Purpose" },
      ...casteMftColumns("", { flat: true, grandLabel: "Grand Total" }),
    ],
    rows: records.map((r) => ({
      name: r.programmeName,
      date: stringifyValue(r.programmeDate),
      venue: r.venue ?? "",
      purpose: r.purpose ?? "",
      ...jsonCasteRow(r.farmersByCategory),
    })),
  };
}

const AVG = (xs: (number | null)[]): number | null => {
  const vals = xs.filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const FMT = (v: number | null): string => (v == null ? "" : Number.isInteger(v) ? String(v) : v.toFixed(2));
const N = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * 3.1.A "CFLD Technical Parameter", kvk-report-202607270504.pdf p.26 - the four
 * numbered grids the KVK report prints per demonstration: 1. Technical Parameters,
 * 2. Economic parameters, 3. Socio-economic impact parameters, 4. Farmers'
 * perception - straight off CfldTechnicalParameter + its Economic / SocioEconomic
 * / Perception children.
 */
async function buildCfldTechnicalParameterKvk(scope: ReportScope): Promise<CustomTableResult> {
  const kvkId = scope.kvkId as string;
  const rawRecords = await prisma.cfldTechnicalParameter.findMany({
    where: { kvkId },
    include: { economicParameters: true, socioEconomicImpacts: true, farmersPerceptions: true },
    orderBy: [{ season: "asc" }, { crop: "asc" }],
  });
  // Real bug fix, 2026-09-14 - same list filter as the zone-level branch
  // above (buildCfldTechnicalParameter), applied to this KVK-scoped branch too.
  const records = applyListFilter(rawRecords, scope, {
    crop: (r) => r.crop,
    areaHa: (r) => stringifyValue(r.areaHa),
  });
  const S = (v: unknown) => (v == null || v === "" ? "-" : String(v));
  const D = "Number of farmers", FP = "Farmer's existing practice", DT = "Demonstration technology";
  const YD = "Yield obtained in demonstration (q/ha)", YG = "Yield gap (Kg/ha) w.r.to", YM = "Yield gap minimized (%)";
  const PP = "Farmers' Perception parameters";

  const p1cols: ReportColumn[] = [
    { key: "crop", label: "Crop" }, { key: "season", label: "Season" }, { key: "name", label: "Name of crop demonstrated" },
    { key: "area", label: "Area (ha)" },
    ...casteMfTotalColumns(D),
    { key: "tech", label: "Detail of technology demonstrated" }, { key: "practice", label: "Detail of existing farmer practice" },
    { key: "yfield", label: "Yield (q/ha) in farmer field" },
    { key: "ymax", label: "Max", groups: [YD] }, { key: "ymin", label: "Min", groups: [YD] }, { key: "yav", label: "Av.", groups: [YD] },
    { key: "ygd", label: "D", groups: [YG] }, { key: "ygs", label: "S", groups: [YG] }, { key: "ygp", label: "P", groups: [YG] },
    { key: "ymd", label: "D", groups: [YM] }, { key: "yms", label: "S", groups: [YM] }, { key: "ymp", label: "P", groups: [YM] },
    { key: "inc", label: "% Increase" },
  ];
  const p1rows = records.map((r) => ({
    crop: r.crop, season: r.season, name: r.cropDemonstrated, area: stringifyValue(r.areaHa),
    ...casteMfTotalRow([casteFromJson(r.farmersByCategory)]),
    tech: r.detailOfTechnologyDemonstrated, practice: r.existingFarmerPractice ?? "",
    yfield: stringifyValue(r.yieldFarmerFieldQha),
    ymax: stringifyValue(r.yieldDemoMaxQha), ymin: stringifyValue(r.yieldDemoMinQha), yav: stringifyValue(r.yieldDemoAvgQha),
    ygd: stringifyValue(r.yieldGapKgHaDistrict), ygs: stringifyValue(r.yieldGapKgHaState), ygp: stringifyValue(r.yieldGapKgHaPotential),
    ymd: stringifyValue(r.yieldGapMinimizedPercentDistrict), yms: stringifyValue(r.yieldGapMinimizedPercentState), ymp: stringifyValue(r.yieldGapMinimizedPercentPotential),
    inc: stringifyValue(r.percentIncrease),
  }));

  const p2cols: ReportColumn[] = [
    { key: "tech", label: "Detail of technology demonstrated" },
    { key: "fCost", label: "Gross Cost (Rs/ha)", groups: [FP] }, { key: "fRet", label: "Gross return (Rs/ha)", groups: [FP] },
    { key: "fNet", label: "Net Return (Rs/ha)", groups: [FP] }, { key: "fBcr", label: "B:C ratio", groups: [FP] },
    { key: "dCost", label: "Gross Cost (Rs/ha)", groups: [DT] }, { key: "dRet", label: "Gross return (Rs/ha)", groups: [DT] },
    { key: "dNet", label: "Net Return (Rs/ha)", groups: [DT] }, { key: "dBcr", label: "B:C ratio", groups: [DT] },
    { key: "addl", label: "Additional Income (Rs/ha)" },
  ];
  const p2rows = records.flatMap((r) =>
    (r.economicParameters.length ? r.economicParameters : [null]).map((e) => ({
      tech: e?.detailOfTechnology ?? r.detailOfTechnologyDemonstrated,
      fCost: stringifyValue(e?.farmerGrossCost), fRet: stringifyValue(e?.farmerGrossReturn), fNet: stringifyValue(e?.farmerNetReturn), fBcr: stringifyValue(e?.farmerBcRatio),
      dCost: stringifyValue(e?.demoGrossCost), dRet: stringifyValue(e?.demoGrossReturn), dNet: stringifyValue(e?.demoNetReturn), dBcr: stringifyValue(e?.demoBcRatio),
      addl: stringifyValue(e?.additionalIncome),
    })),
  );

  const p3cols: ReportColumn[] = [
    { key: "name", label: "Name of crop demonstrated" },
    { key: "total", label: "Total produce obtained (kg)" }, { key: "sold", label: "Produce sold (Kg/household)" },
    { key: "rate", label: "Selling Rate (Rs/Kg)" }, { key: "own", label: "Produce used for their own farm (Kg)" },
    { key: "dist", label: "Produce distributed to other farmers (Kg)" }, { key: "purpose", label: "Purpose for which income gained was utilized" },
    { key: "emp", label: "Employment Generated (Mandays/household)" },
  ];
  const p3rows = records.flatMap((r) =>
    (r.socioEconomicImpacts.length ? r.socioEconomicImpacts : [null]).map((s) => ({
      name: s?.cropDemonstrated ?? r.cropDemonstrated,
      total: stringifyValue(s?.totalProduceObtainedKg), sold: stringifyValue(s?.produceSoldKgPerHousehold),
      rate: stringifyValue(s?.sellingRatePerKg), own: stringifyValue(s?.produceUsedOwnFarmKg),
      dist: stringifyValue(s?.produceDistributedToOthersKg), purpose: S(s?.purposeOfIncomeUtilized),
      emp: stringifyValue(s?.employmentGeneratedMandays),
    })),
  );

  const p4cols: ReportColumn[] = [
    { key: "tech", label: "Detail of technologies demonstrated" },
    { key: "suit", label: "Suitability of technology to their farming system", groups: [PP] },
    { key: "like", label: "Liking (Preference)", groups: [PP] },
    { key: "afford", label: "Affordability (%)", groups: [PP] },
    { key: "neg", label: "Any negative effect", groups: [PP] },
    { key: "accept", label: "Is Technology acceptable to all in the group/village", groups: [PP] },
    { key: "sugg", label: "Suggestions, for change/improvement, if any", groups: [PP] },
    { key: "fb", label: "Farmer feedback", groups: [PP] },
  ];
  const p4rows = records.flatMap((r) =>
    (r.farmersPerceptions.length ? r.farmersPerceptions : [null]).map((p) => ({
      tech: p?.technologyDetail ?? r.detailOfTechnologyDemonstrated,
      suit: S(p?.suitability), like: S(p?.liking), afford: stringifyValue(p?.affordabilityPercent),
      neg: S(p?.negativeEffect), accept: S(p?.acceptableToGroup), sugg: S(p?.suggestions), fb: S(p?.farmerFeedback),
    })),
  );

  return {
    caption: "PERFORMANCE OF THE DEMONSTRATION UNDER CFLD ON PULSE AND OILSEED CROPS (CFLD)\n(During Kharif, Rabi and Summer)",
    blocks: [
      { heading: "1. Technical Parameters:", parts: [{ kind: "grid", columns: p1cols, rows: p1rows, keepEmpty: true }] },
      { heading: "2. Economic parameters:", parts: [{ kind: "grid", columns: p2cols, rows: p2rows, keepEmpty: true }] },
      { heading: "3. Socio-economic impact parameters:", parts: [{ kind: "grid", columns: p3cols, rows: p3rows, keepEmpty: true }] },
      { heading: "4. Pulses/Oilseed Farmers' perception of the intervention demonstrated:", parts: [{ kind: "grid", columns: p4cols, rows: p4rows, keepEmpty: true }] },
    ],
  };
}

/**
 * 3.1.A "CFLD Technical Parameter" (super-v2-prod.pdf p.55-56) - per CFLD crop-category
 * a state-wise summary, then a per-season crop x state breakdown. Area and demonstration
 * counts sum; the yield figures average across the category's demonstrations (matches the
 * reference's own Grand Total maths). "Target of CFLD Approved" reads the columns added in
 * migration batch #3.
 */
async function buildCfldTechnicalParameter(scope: ReportScope): Promise<CustomTableResult> {
  if (scope.kvkId) return buildCfldTechnicalParameterKvk(scope);
  const rawRecords = await prisma.cfldTechnicalParameter.findMany({
    where: { zoneId: scope.zoneId },
    select: {
      cropType: true, season: true, crop: true,
      areaHa: true, targetAreaHa: true, targetDemonstrations: true,
      yieldFarmerFieldQha: true, yieldDemoAvgQha: true, percentIncrease: true,
      kvk: { select: { name: true, state: { select: { name: true } } } },
    },
    orderBy: [{ cropType: "asc" }, { season: "asc" }, { crop: "asc" }],
  });
  type Rec = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - a state/season/crop rollup with averaged
  // yields, but narrowing the raw records that feed it is still correct.
  // Field keys match the list's own column keys (page.tsx's
  // "technical-parameter" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: Rec) => r.kvk.name,
    crop: (r: Rec) => r.crop,
    areaHa: (r: Rec) => stringifyValue(r.areaHa),
  });
  const localOf = (r: Rec) => N(r.yieldFarmerFieldQha);
  const demoOf = (r: Rec) => N(r.yieldDemoAvgQha);
  const incOf = (r: Rec) => {
    const p = N(r.percentIncrease);
    if (p != null) return p;
    const l = localOf(r), d = demoOf(r);
    return l != null && d != null && l !== 0 ? ((d - l) / l) * 100 : null;
  };
  const diffOf = (r: Rec) => {
    const l = localOf(r), d = demoOf(r);
    return l != null && d != null ? d - l : null;
  };
  const agg = (list: Rec[]) => ({
    tgtArea: FMT(list.reduce((a, r) => a + (N(r.targetAreaHa) ?? 0), 0)),
    tgtDemo: String(list.reduce((a, r) => a + (r.targetDemonstrations ?? 0), 0)),
    achArea: FMT(list.reduce((a, r) => a + (N(r.areaHa) ?? 0), 0)),
    achDemo: String(list.length),
    local: FMT(AVG(list.map(localOf))),
    demo: FMT(AVG(list.map(demoOf))),
    inc: FMT(AVG(list.map(incOf))),
    diff: FMT(AVG(list.map(diffOf))),
  });
  const T = "Target of CFLD Approved", A = "Achievement of CFLD", Y = "Yield (q/ha)";
  const measureCols: ReportColumn[] = [
    { key: "tgtArea", label: "Area (ha)", groups: [T] },
    { key: "tgtDemo", label: "No. of Demonstration", groups: [T] },
    { key: "achArea", label: "Area (ha)", groups: [A] },
    { key: "achDemo", label: "No. of Demonstration", groups: [A] },
    { key: "local", label: "Local", groups: [Y] },
    { key: "demo", label: "Demo", groups: [Y] },
    { key: "inc", label: "Yield Increased (%)" },
    { key: "diff", label: "Average difference of yield between Demo and Local (q/ha)" },
  ];
  const stateCols: ReportColumn[] = [{ key: "state", label: "State" }, ...measureCols];
  const seasonCols: ReportColumn[] = [{ key: "crop", label: "Crop" }, { key: "state", label: "State" }, ...measureCols];
  if (records.length === 0) {
    return {
      blocks: [{
        heading: "State wise details of Cluster Front Line Demonstration",
        parts: [{ kind: "grid", columns: stateCols, rows: [], keepEmpty: true }],
      }],
    };
  }
  const blocks: ReportBlock[] = [];
  [...groupInto(records, (r) => r.cropType ?? "Not Specified").entries()].forEach(([category, catRecords], ci) => {
    const byState = [...groupInto(catRecords, (r) => r.kvk.state?.name ?? "").entries()];
    // super-v2-prod.pdf p.55: "1. Oilseed" is its own heading, then the
    // "State wise details..." / "Cluster Front Line Demonstration on <season>"
    // sub-tables follow without repeating the crop category in their titles.
    blocks.push({ heading: `${ci + 1}. ${category}`, parts: [] });
    blocks.push({
      heading: "State wise details of Cluster Front Line Demonstration",
      parts: [{
        kind: "grid" as const,
        columns: stateCols,
        rows: byState.map(([state, list]) => ({ state, ...agg(list) })),
        totalRow: { state: "Grand Total", ...agg(catRecords) },
      }],
    });
    for (const [season, seasonRecords] of groupInto(catRecords, (r) => r.season || "Not Specified").entries()) {
      const byCropState = [...groupInto(seasonRecords, (r) => `${r.crop}||${r.kvk.state?.name ?? ""}`).entries()];
      blocks.push({
        heading: `Cluster Front Line Demonstration on ${season}`,
        parts: [{
          kind: "grid" as const,
          columns: seasonCols,
          rows: byCropState.map(([k, list]) => {
            const [crop, state] = k.split("||");
            return { crop, state, ...agg(list) };
          }),
          totalRow: { crop: "Grand Total", state: "", ...agg(seasonRecords) },
        }],
      });
    }
  });
  return { blocks };
}

/**
 * 3.2.A "NICRA Basic Information" (super-v2-prod.pdf p.59) - one row per state, values
 * averaged across that state's NICRA KVKs; the NICRA-adopted-village count is summed. All
 * columns beyond rainfall / temperature read the fields added in migration batch #3.
 */
async function buildNicraBasicInfo(scope: ReportScope): Promise<CustomTableResult> {
  if (scope.kvkId) {
    // kvk-report p.28: one row per record, no State / No. of KVKs - leads with a
    // "Period" (Reporting Date / Start Date / End Date) trio.
    const rawRecords = await prisma.nicraBasicInformation.findMany({
      where: { kvkId: scope.kvkId },
      select: {
        reportingDate: true, startDate: true, endDate: true,
        rfDistrictNormal: true, rfDistrictReceived: true, maxTemperature: true, minTemperature: true,
        drySpell10Days: true, drySpell15Days: true, drySpell20Days: true,
        nicraAdoptedVillages: true, floodIntensiveRainMm: true, floodWaterDepthCm: true, floodDurationDays: true,
        kvk: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    });
    // Real bug fix, 2026-09-14 - the single-KVK view wraps everything in one
    // `blocks` band. Field keys match the list's own column keys (page.tsx's
    // "basic-information" mapping).
    const records = applyListFilter(rawRecords, scope, {
      kvk: (r) => r.kvk?.name ?? "",
      rfDistrictNormal: (r) => stringifyValue(r.rfDistrictNormal),
      rfDistrictReceived: (r) => stringifyValue(r.rfDistrictReceived),
      maxTemperature: (r) => stringifyValue(r.maxTemperature),
      minTemperature: (r) => stringifyValue(r.minTemperature),
    });
    const PD = "Period", DD = "Districts data", DS = "Dry spell/ drought", FL = "Flood";
    const columns: ReportColumn[] = [
      { key: "reportingDate", label: "Reporting Date", groups: [PD] },
      { key: "startDate", label: "Start Date", groups: [PD] },
      { key: "endDate", label: "End Date", groups: [PD] },
      { key: "rfNormal", label: "RF (mm) district Normal", groups: [DD] },
      { key: "rfReceived", label: "RF (mm) district Received", groups: [DD] },
      { key: "tMax", label: "Temperature 0C Max.", groups: [DD] },
      { key: "tMin", label: "Temperature 0C Min.", groups: [DD] },
      { key: "d10", label: "> 10 days", groups: [DS] },
      { key: "d15", label: "> 15 days", groups: [DS] },
      { key: "d20", label: "> 20 days", groups: [DS] },
      { key: "villages", label: "NICRA Adopted village" },
      { key: "floodRain", label: "Intensive rain >60 mm", groups: [FL] },
      { key: "floodDepth", label: "Water depth (cm)", groups: [FL] },
      { key: "floodDuration", label: "Duration (days)", groups: [FL] },
    ];
    const kvkName = records[0]?.kvk?.name ?? "";
    const rows = records.map((r) => ({
      reportingDate: stringifyValue(r.reportingDate), startDate: stringifyValue(r.startDate), endDate: stringifyValue(r.endDate),
      rfNormal: stringifyValue(r.rfDistrictNormal), rfReceived: stringifyValue(r.rfDistrictReceived),
      tMax: stringifyValue(r.maxTemperature), tMin: stringifyValue(r.minTemperature),
      d10: r.drySpell10Days != null ? String(r.drySpell10Days) : "", d15: r.drySpell15Days != null ? String(r.drySpell15Days) : "", d20: r.drySpell20Days != null ? String(r.drySpell20Days) : "",
      villages: r.nicraAdoptedVillages != null ? String(r.nicraAdoptedVillages) : "",
      floodRain: stringifyValue(r.floodIntensiveRainMm), floodDepth: stringifyValue(r.floodWaterDepthCm),
      floodDuration: r.floodDurationDays != null ? String(r.floodDurationDays) : "",
    }));
    if (rows.length === 0) return { columns, noSerial: true, keepEmpty: true };
    return { blocks: [{ heading: kvkName, parts: [{ kind: "grid", noSerial: true, columns, rows }] }] };
  }
  const [records, stateNames] = await Promise.all([
    prisma.nicraBasicInformation.findMany({
      where: { zoneId: scope.zoneId },
      select: {
        rfDistrictNormal: true, rfDistrictReceived: true, maxTemperature: true, minTemperature: true,
        drySpell10Days: true, drySpell15Days: true, drySpell20Days: true,
        nicraAdoptedVillages: true, floodIntensiveRainMm: true, floodWaterDepthCm: true, floodDurationDays: true,
        kvk: { select: { state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
  ]);
  const D = "Districts data (avg)", S = "Dry spell / drought (avg)", F = "Flood (avg)";
  const columns: ReportColumn[] = [
    { key: "state", label: "State" },
    { key: "kvks", label: "No. of KVKs" },
    { key: "rfNormal", label: "RF (mm) Normal", groups: [D] },
    { key: "rfReceived", label: "RF (mm) Received", groups: [D] },
    { key: "tMax", label: "Temp °C Max.", groups: [D] },
    { key: "tMin", label: "Temp °C Min.", groups: [D] },
    { key: "d10", label: "> 10 days", groups: [S] },
    { key: "d15", label: "> 15 days", groups: [S] },
    { key: "d20", label: "> 20 days", groups: [S] },
    { key: "villages", label: "NICRA Adopted village" },
    { key: "floodRain", label: "Intensive rain > 60 mm", groups: [F] },
    { key: "floodDepth", label: "Water depth (cm)", groups: [F] },
    { key: "floodDuration", label: "Duration (days)", groups: [F] },
  ];
  const rowFor = (list: typeof records) => ({
    kvks: String(list.length),
    rfNormal: FMT(AVG(list.map((r) => N(r.rfDistrictNormal)))),
    rfReceived: FMT(AVG(list.map((r) => N(r.rfDistrictReceived)))),
    tMax: FMT(AVG(list.map((r) => N(r.maxTemperature)))),
    tMin: FMT(AVG(list.map((r) => N(r.minTemperature)))),
    d10: FMT(AVG(list.map((r) => N(r.drySpell10Days)))),
    d15: FMT(AVG(list.map((r) => N(r.drySpell15Days)))),
    d20: FMT(AVG(list.map((r) => N(r.drySpell20Days)))),
    villages: String(list.reduce((a, r) => a + (r.nicraAdoptedVillages ?? 0), 0)),
    floodRain: FMT(AVG(list.map((r) => N(r.floodIntensiveRainMm)))),
    floodDepth: FMT(AVG(list.map((r) => N(r.floodWaterDepthCm)))),
    floodDuration: FMT(AVG(list.map((r) => N(r.floodDurationDays)))),
  });
  const rows = stateNames
    .map((st) => ({ st, list: records.filter((r) => r.kvk.state?.name === st) }))
    .filter((x) => x.list.length > 0)
    .map((x) => ({ state: x.st, ...rowFor(x.list) }));
  return { columns, rows, noSerial: true, keepEmpty: true };
}

/**
 * 3.2.B "NICRA Details" (super-v2-prod.pdf p.59) - Category / Sub-category rows with a
 * per-state Farmers / Area-Unit / Net-return triple and a Total row per category. Reads
 * the fields added in migration batch #3.
 */
async function buildNicraDetails(scope: ReportScope): Promise<CustomTableResult> {
  if (scope.kvkId) {
    // kvk-report p.28: per-record detail grid grouped Category -> Sub-category,
    // with a caste M/F beneficiary block + Total, Gross cost / Gross return /
    // Net return / BCR, and Sub-total (per sub-category) + Total (per category) rows.
    const records = await prisma.nicraDetails.findMany({
      where: { kvkId: scope.kvkId },
      select: {
        category: true, subCategory: true, cropName: true, seasonName: true, month: true,
        technologyDemonstration: true, areaOrUnit: true, yield: true,
        grossCost: true, grossReturn: true, netReturn: true, bcr: true, ...CASTE_SELECT,
      },
    });
    type KR = (typeof records)[number];
    const CB = "No. of farmers benefitted";
    const casteCells = (["generalMale", "generalFemale", "obcMale", "obcFemale", "scMale", "scFemale", "stMale", "stFemale"] as const);
    const casteLabels = ["Gen M", "Gen F", "OBC M", "OBC F", "SC M", "SC F", "ST M", "ST F"];
    const num = (v: unknown) => Number(v ?? 0);
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
    // kvk-report p.28 leads with an "S.No" column that numbers only the real
    // detail rows (band / sub-total / total rows carry no serial).
    const columns: ReportColumn[] = [
      { key: "sNo", label: "S.No" },
      { key: "crop", label: "Crop" }, { key: "season", label: "Season" }, { key: "month", label: "Month" },
      { key: "tech", label: "Technology demonstrated" }, { key: "area", label: "Area / Unit" }, { key: "yield", label: "Yield" },
      ...casteCells.map((k, i) => ({ key: `c_${k}`, label: casteLabels[i], groups: [CB] })),
      { key: "cTotal", label: "Total", groups: [CB] },
      { key: "gCost", label: "Gross cost" }, { key: "gRet", label: "Gross return" }, { key: "nRet", label: "Net return" }, { key: "bcr", label: "BCR" },
    ];
    const CAPTION = "NICRA — Details of demonstrations / interventions";
    if (records.length === 0) return { columns, noSerial: true, keepEmpty: true, caption: CAPTION };
    const casteRow = (list: KR[]) => {
      const out: Record<string, string> = {};
      let total = 0;
      for (const k of casteCells) { const s = list.reduce((a, r) => a + r[k], 0); out[`c_${k}`] = String(s); total += s; }
      out.cTotal = String(total);
      return out;
    };
    const measureRow = (list: KR[]) => ({
      gCost: fmt(list.reduce((a, r) => a + num(r.grossCost), 0)),
      gRet: fmt(list.reduce((a, r) => a + num(r.grossReturn), 0)),
      nRet: fmt(list.reduce((a, r) => a + num(r.netReturn), 0)),
      bcr: list.length === 1 ? stringifyValue(list[0].bcr) : "",
    });
    const rows: Record<string, string>[] = [];
    let sNo = 0;
    const band = (label: string) => rows.push({ sNo: "", crop: label, season: "", month: "", tech: "", area: "", yield: "" });
    for (const [category, catList] of groupInto(records, (r) => r.category ?? "Not Specified").entries()) {
      band(category);
      for (const [subCategory, subList] of groupInto(catList, (r) => r.subCategory ?? "").entries()) {
        if (subCategory) band(subCategory);
        for (const r of subList) {
          rows.push({
            sNo: String(++sNo),
            crop: r.cropName, season: r.seasonName, month: r.month ?? "",
            tech: r.technologyDemonstration, area: stringifyValue(r.areaOrUnit), yield: stringifyValue(r.yield),
            ...casteRow([r]), ...measureRow([r]),
          });
        }
        rows.push({ sNo: "", crop: `Sub-total — ${subCategory || category}`, season: "", month: "", tech: "", area: "", yield: "", ...casteRow(subList), ...measureRow(subList), bcr: "" });
      }
      rows.push({ sNo: "", crop: `Total — ${category}`, season: "", month: "", tech: "", area: "", yield: "", ...casteRow(catList), ...measureRow(catList), bcr: "" });
    }
    return { columns, rows, noSerial: true, caption: CAPTION };
  }
  const [records, stateNames] = await Promise.all([
    prisma.nicraDetails.findMany({
      where: { zoneId: scope.zoneId },
      select: {
        category: true, subCategory: true, noOfFarmers: true, areaOrUnit: true, netReturn: true,
        kvk: { select: { state: { select: { name: true } } } },
      },
    }),
    reportStates(scope.zoneId),
  ]);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const columns: ReportColumn[] = [
    { key: "category", label: "Category" },
    { key: "subCategory", label: "Sub-category" },
    ...[...stateNames, "Total"].flatMap((s) => [
      { key: `${s}__f`, label: "Farmers", groups: [s] },
      { key: `${s}__a`, label: "Area/Unit", groups: [s] },
      { key: `${s}__n`, label: "Net return", groups: [s] },
    ]),
  ];
  if (records.length === 0) return { columns, noSerial: true, keepEmpty: true };
  const cellFor = (list: typeof records) => {
    const out: Record<string, string> = {};
    const put = (key: string, sub: typeof records) => {
      out[`${key}__f`] = fmt(sub.reduce((a, r) => a + r.noOfFarmers, 0));
      out[`${key}__a`] = fmt(sub.reduce((a, r) => a + Number(r.areaOrUnit ?? 0), 0));
      out[`${key}__n`] = fmt(sub.reduce((a, r) => a + Number(r.netReturn ?? 0), 0));
    };
    for (const st of stateNames) put(st, list.filter((r) => r.kvk.state?.name === st));
    put("Total", list);
    return out;
  };
  const rows: Record<string, string>[] = [];
  for (const [category, catList] of groupInto(records, (r) => r.category ?? "Not Specified").entries()) {
    for (const [subCategory, subList] of groupInto(catList, (r) => r.subCategory ?? "").entries()) {
      rows.push({ category, subCategory, ...cellFor(subList) });
    }
    rows.push({ category: "Total", subCategory: "", ...cellFor(catList) });
  }
  return { columns, rows, noSerial: true };
}

/**
 * 3.4.A "ARYA / SARAL Current Year Details" (super-v2-prod.pdf p.63) - one grid per state,
 * one row per ARYA enterprise (row set taken from the ARYA Enterprise master so every
 * enterprise shows even with a zero row, matching the reference). Reads the per-enterprise
 * economics columns added in migration batch #3.
 */
async function buildAryaCurrentYear(scope: ReportScope): Promise<CustomTableResult> {
  const [rawRecords, enterprises, stateNames] = await Promise.all([
    prisma.aryaCurrentYearDetail.findMany({
      where: scopeAndPeriod(scope, "aryaCurrentYearDetail"),
      select: {
        enterprise: true, viableUnits: true, closedUnits: true,
        trainingsConducted: true, unitsEstablished: true, ruralYouthMale: true, ruralYouthFemale: true,
        avgUnitSize: true, productionPerUnit: true, costPerUnit: true, saleValue: true,
        economicGainsPerUnit: true, employmentMandaysMale: true, employmentMandaysFemale: true,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
    }),
    prisma.masterListItem.findMany({ where: { zoneId: scope.zoneId, type: "ARYA_ENTERPRISE" }, orderBy: { name: "asc" } }),
    reportStates(scope.zoneId),
  ]);
  // Real bug fix, 2026-09-14 - always `blocks` (per-state/per-KVK, each row
  // then a per-enterprise sum). Field keys match the list's own column keys
  // (page.tsx's "arya-safal-current-year" mapping) - narrowing the raw
  // records before summing correctly narrows the per-enterprise totals too.
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    enterprise: (r) => r.enterprise,
    viableUnits: (r) => String(r.viableUnits),
    closedUnits: (r) => String(r.closedUnits),
  });
  const RY = "No. of rural youth trained", EM = "Employment generated (mandays)";
  const columns: ReportColumn[] = [
    { key: "ent", label: "Name of Enterprise" },
    { key: "training", label: "No. of Training conducted" },
    { key: "units", label: "No. of entrepreneurial units established (Progressive)" },
    { key: "youthM", label: "Male", groups: [RY] },
    { key: "youthF", label: "Female", groups: [RY] },
    { key: "viable", label: "Viable units (functional units)" },
    { key: "closed", label: "Closed units (non functional)" },
    { key: "avgSize", label: "Average size of each entrepreneurial unit" },
    { key: "prod", label: "Total Production/unit/year" },
    { key: "cost", label: "Per unit cost of Production" },
    { key: "sale", label: "Sale value of produce" },
    { key: "gains", label: "Economic Gains / unit" },
    { key: "empM", label: "Male", groups: [EM] },
    { key: "empF", label: "Female", groups: [EM] },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const num = (v: unknown) => Number(v ?? 0);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const rowFor = (ent: string, list: typeof records) => ({
    ent,
    training: String(list.reduce((a, r) => a + num(r.trainingsConducted), 0)),
    units: String(list.reduce((a, r) => a + num(r.unitsEstablished), 0)),
    youthM: String(list.reduce((a, r) => a + num(r.ruralYouthMale), 0)),
    youthF: String(list.reduce((a, r) => a + num(r.ruralYouthFemale), 0)),
    viable: String(list.reduce((a, r) => a + num(r.viableUnits), 0)),
    closed: String(list.reduce((a, r) => a + num(r.closedUnits), 0)),
    avgSize: fmt(list.reduce((a, r) => a + num(r.avgUnitSize), 0)),
    prod: fmt(list.reduce((a, r) => a + num(r.productionPerUnit), 0)),
    cost: fmt(list.reduce((a, r) => a + num(r.costPerUnit), 0)),
    sale: fmt(list.reduce((a, r) => a + num(r.saleValue), 0)),
    gains: fmt(list.reduce((a, r) => a + num(r.economicGainsPerUnit), 0)),
    empM: String(list.reduce((a, r) => a + num(r.employmentMandaysMale), 0)),
    empF: String(list.reduce((a, r) => a + num(r.employmentMandaysFemale), 0)),
  });
  const entNames = enterprises.length ? enterprises.map((e) => e.name) : [...new Set(records.map((r) => r.enterprise))];
  // Single-KVK report: one "KVK: <name>" block, not "State: Bihar" (50pg
  // kvk-report p.31, client 2026-09-08).
  const groups = scope.kvkId
    ? [...groupInto(records, (r) => r.kvk.name).entries()].map(([name, list]) => ({ heading: `KVK: ${name}`, list }))
    : stateNames
        .map((st) => ({ heading: `State: ${st}`, list: records.filter((r) => r.kvk.state?.name === st) }))
        .filter((x) => x.list.length > 0);
  const blocks: ReportBlock[] = groups.map((x) => ({
    heading: x.heading,
    parts: [{ kind: "grid" as const, columns, rows: entNames.map((ent) => rowFor(ent, x.list.filter((r) => r.enterprise === ent))) }],
  }));
  return { blocks };
}

/**
 * 3.4.B "ARYA / SARAL Previous Year Evaluation" (super-v2-prod.pdf p.64) - same per-state,
 * per-enterprise layout as 3.4.A with the reference's ~17-column evaluation grid. Reads the
 * columns added in migration batch #3.
 */
async function buildAryaPreviousYear(scope: ReportScope): Promise<CustomTableResult> {
  const [rawRecords, enterprises, stateNames] = await Promise.all([
    prisma.aryaPreviousYearEvaluation.findMany({
      where: scopeAndPeriod(scope, "aryaPreviousYearEvaluation"),
      select: {
        enterprise: true, totalClosed: true, totalRestarted: true, unitsEstablishedProgressive: true,
        closingDate: true, restartedDate: true,
        sizeMale: true, sizeFemale: true, sizeNoOfUnit: true, sizeUnitCapacity: true,
        costFixed: true, costVariable: true, totalProductionPerUnitYear: true, grossCostPerUnitYear: true,
        grossReturnPerUnitYear: true, netBenefitPerUnitYear: true,
        employmentFamily: true, employmentOtherThanFamily: true, personsVisited: true,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
    }),
    prisma.masterListItem.findMany({ where: { zoneId: scope.zoneId, type: "ARYA_ENTERPRISE" }, orderBy: { name: "asc" } }),
    reportStates(scope.zoneId),
  ]);
  // Real bug fix, 2026-09-14 - same class as buildAryaCurrentYear above.
  // Field keys match the list's own column keys (page.tsx's
  // "arya-safal-previous-year" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    enterprise: (r) => r.enterprise,
    totalClosed: (r) => String(r.totalClosed),
    closingDate: (r) => (r.closingDate ? r.closingDate.toISOString().slice(0, 10) : ""),
    totalRestarted: (r) => String(r.totalRestarted),
    restartedDate: (r) => (r.restartedDate ? r.restartedDate.toISOString().slice(0, 10) : ""),
  });
  const SZ = "Entrepreneurial Unit Size (capacity per year)", CO = "Entrepreneurial Establishment Cost / unit", EM = "Employment generated / year (mandays)";
  // kvk-report p.31 also shows "Date of Closing" / "Date of Restart" next to the
  // closed / restarted counts; super-v2-prod.pdf's 3.4.B has no such columns.
  const withDates = !!scope.kvkId;
  const columns: ReportColumn[] = [
    { key: "ent", label: "Name of Enterprise" },
    { key: "estab", label: "No. of entrepreneurial units established (up to previous year progressive)" },
    { key: "closed", label: "No. of non-functional entrepreneurial unit closed" },
    ...(withDates ? [{ key: "closedDate", label: "Date of Closing" }] : []),
    { key: "restarted", label: "No. of non-functional entrepreneurial unit restarted (i.e. previously closed)" },
    ...(withDates ? [{ key: "restartDate", label: "Date of Restart" }] : []),
    { key: "sMale", label: "Male", groups: [SZ] },
    { key: "sFemale", label: "Female", groups: [SZ] },
    { key: "sUnits", label: "No. of Unit", groups: [SZ] },
    { key: "sCapacity", label: "Unit capacity", groups: [SZ] },
    { key: "cFixed", label: "Fixed cost", groups: [CO] },
    { key: "cVariable", label: "Variable cost", groups: [CO] },
    { key: "prodYear", label: "Total production/unit/year" },
    { key: "grossCost", label: "Gross cost of production/unit/year" },
    { key: "grossReturn", label: "Gross return per unit/year" },
    { key: "netBenefit", label: "Net benefit / unit/year" },
    { key: "emFamily", label: "Family", groups: [EM] },
    { key: "emOther", label: "Other than Family", groups: [EM] },
    { key: "emTotal", label: "Total", groups: [EM] },
    { key: "visited", label: "No. of persons visited entrepreneur unit" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const num = (v: unknown) => Number(v ?? 0);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const rowFor = (ent: string, list: typeof records) => {
    const fam = list.reduce((a, r) => a + num(r.employmentFamily), 0);
    const oth = list.reduce((a, r) => a + num(r.employmentOtherThanFamily), 0);
    const firstDate = (key: "closingDate" | "restartedDate") => {
      const d = list.map((r) => r[key]).find((v) => v != null);
      return d ? stringifyValue(d) : "";
    };
    return {
      ent,
      estab: String(list.reduce((a, r) => a + num(r.unitsEstablishedProgressive), 0)),
      closed: String(list.reduce((a, r) => a + num(r.totalClosed), 0)),
      ...(withDates ? { closedDate: firstDate("closingDate") } : {}),
      restarted: String(list.reduce((a, r) => a + num(r.totalRestarted), 0)),
      ...(withDates ? { restartDate: firstDate("restartedDate") } : {}),
      sMale: String(list.reduce((a, r) => a + num(r.sizeMale), 0)),
      sFemale: String(list.reduce((a, r) => a + num(r.sizeFemale), 0)),
      sUnits: String(list.reduce((a, r) => a + num(r.sizeNoOfUnit), 0)),
      sCapacity: fmt(list.reduce((a, r) => a + num(r.sizeUnitCapacity), 0)),
      cFixed: fmt(list.reduce((a, r) => a + num(r.costFixed), 0)),
      cVariable: fmt(list.reduce((a, r) => a + num(r.costVariable), 0)),
      prodYear: fmt(list.reduce((a, r) => a + num(r.totalProductionPerUnitYear), 0)),
      grossCost: fmt(list.reduce((a, r) => a + num(r.grossCostPerUnitYear), 0)),
      grossReturn: fmt(list.reduce((a, r) => a + num(r.grossReturnPerUnitYear), 0)),
      netBenefit: fmt(list.reduce((a, r) => a + num(r.netBenefitPerUnitYear), 0)),
      emFamily: String(fam),
      emOther: String(oth),
      emTotal: String(fam + oth),
      visited: String(list.reduce((a, r) => a + num(r.personsVisited), 0)),
    };
  };
  const entNames = enterprises.length ? enterprises.map((e) => e.name) : [...new Set(records.map((r) => r.enterprise))];
  // Single-KVK report: "KVK: <name>" block, no state suffix - the client wants
  // no Bihar/Jharkhand anywhere in a KVK's own report, even though the 50pg
  // reference prints "— Bihar" here (client 2026-09-08).
  const groups = scope.kvkId
    ? [...groupInto(records, (r) => r.kvk.name).entries()].map(([name, list]) => ({ heading: `KVK: ${name}`, list }))
    : stateNames
        .map((st) => ({ heading: `State: ${st}`, list: records.filter((r) => r.kvk.state?.name === st) }))
        .filter((x) => x.list.length > 0);
  const blocks: ReportBlock[] = groups.map((x) => ({
    heading: x.heading,
    parts: [{ kind: "grid" as const, columns, rows: entNames.map((ent) => rowFor(ent, x.list.filter((r) => r.enterprise === ent))) }],
  }));
  return { blocks };
}

/**
 * 3.5.B "Natural Farming Physical Information" (super-v2-prod.pdf p.65) - a state-wise
 * overall count table, then a Training grid and an Awareness grid (each with the caste
 * M/F/T participant block + remark added in migration batch #3).
 */
async function buildNfPhysical(scope: ReportScope): Promise<CustomTableResult> {
  const [rawRecords, stateNames] = await Promise.all([
    prisma.nfPhysicalInfo.findMany({
      where: scopeAndPeriod(scope, "nfPhysicalInfo"),
      select: {
        activityName: true, trainingTitle: true, trainingDate: true, venue: true, remarks: true, participants: true, ...CASTE_SELECT,
        kvk: { select: { name: true, state: { select: { name: true } } } },
      },
      orderBy: [{ kvk: { name: "asc" } }, { trainingDate: "asc" }],
    }),
    reportStates(scope.zoneId),
  ]);
  type R = (typeof rawRecords)[number];
  // Real bug fix, 2026-09-14 - always `blocks`. Field keys match the list's
  // own column keys (page.tsx's "nf-physical" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r: R) => r.kvk.name,
    activityName: (r: R) => r.activityName,
    trainingTitle: (r: R) => r.trainingTitle,
    trainingDate: (r: R) => r.trainingDate.toISOString().slice(0, 10),
    venue: (r: R) => r.venue,
    participants: (r: R) => String(r.participants),
  });
  const kind = (r: R) => {
    const a = (r.activityName || "").toLowerCase();
    if (a.includes("train")) return "Training";
    if (a.includes("aware")) return "Awareness";
    return "Other";
  };
  const mSum = (r: R) => r.generalMale + r.obcMale + r.scMale + r.stMale;
  const fSum = (r: R) => r.generalFemale + r.obcFemale + r.scFemale + r.stFemale;
  const overallCols: ReportColumn[] = [
    { key: "state", label: "State" },
    { key: "training", label: "Training" },
    { key: "awareness", label: "Awareness" },
    { key: "other", label: "Other activities" },
    { key: "totalProg", label: "Total programmes" },
    { key: "totM", label: "Total M" },
    { key: "totF", label: "Total F" },
    { key: "totT", label: "Total T" },
  ];
  const overallRows = stateNames
    .map((st) => ({ st, list: records.filter((r) => r.kvk.state?.name === st) }))
    .filter((x) => x.list.length > 0)
    .map(({ st, list }) => {
      const m = list.reduce((a, r) => a + mSum(r), 0);
      const f = list.reduce((a, r) => a + fSum(r), 0);
      return {
        state: st,
        training: String(list.filter((r) => kind(r) === "Training").length),
        awareness: String(list.filter((r) => kind(r) === "Awareness").length),
        other: String(list.filter((r) => kind(r) === "Other").length),
        totalProg: String(list.length),
        totM: String(m), totF: String(f), totT: String(m + f),
      };
    });
  const detailCols = (titleLabel: string): ReportColumn[] => [
    // Single-KVK report drops the "KVK" column (one value) - the 50pg
    // kvk-report has none here (client, 2026-09-08).
    ...(scope.kvkId ? [] : [{ key: "kvk", label: "KVK" }]),
    { key: "title", label: titleLabel },
    { key: "date", label: "Date of programme" },
    { key: "venue", label: "Venue of programme" },
    ...casteMftColumns("", { flat: true, grandLabel: "Total" }),
    { key: "remarks", label: "Remarks/Observation/Feedback Recorded" },
  ];
  const detailRow = (r: R) => ({
    kvk: r.kvk.name,
    title: r.trainingTitle,
    date: stringifyValue(r.trainingDate),
    venue: r.venue,
    ...casteMftRow([r], "", true),
    remarks: r.remarks ?? "",
  });
  if (records.length === 0) {
    return {
      columns: scope.kvkId ? detailCols("Title of Natural Farming Training programme") : overallCols,
      keepEmpty: true,
    };
  }
  // The "State-wise overall" summary has no meaning for one KVK - the 50pg
  // kvk-report goes straight to the Training / Awareness detail grids.
  const blocks: ReportBlock[] = scope.kvkId
    ? []
    : [{ heading: "State-wise overall Physical Information", parts: [{ kind: "grid" as const, columns: overallCols, rows: overallRows }] }];
  const training = records.filter((r) => kind(r) === "Training");
  const awareness = records.filter((r) => kind(r) === "Awareness");
  if (training.length) blocks.push({ heading: "Training", parts: [{ kind: "grid" as const, columns: detailCols("Title of Natural Farming Training programme"), rows: training.map(detailRow) }] });
  if (awareness.length) blocks.push({ heading: "Awareness", parts: [{ kind: "grid" as const, columns: detailCols("Title of Natural Farming Awareness programme"), rows: awareness.map(detailRow) }] });
  return { blocks };
}

/**
 * 3.5.E "Natural Farming Beneficiaries" (super-v2-prod.pdf p.75) - per KVK, one row per
 * reporting year. Reads the year / engaged-farmer / remark columns added in migration batch #3.
 */
async function buildNfBeneficiary(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nfBeneficiary.findMany({
    where: scopeAndPeriod(scope, "nfBeneficiary"),
    select: {
      reportingYear: true, numberOfBlock: true, numberOfVillage: true, numberOfTraining: true,
      farmersInfluenced: true, farmersEngagedAllSeason: true, farmersEngagedOneSeason: true, remarks: true,
      kvk: { select: { name: true } },
    },
    orderBy: { kvk: { name: "asc" } },
  });
  // Real bug fix, 2026-09-14 - always `blocks` (per-KVK). Field keys match
  // the list's own column keys (page.tsx's "nf-beneficiaries" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    numberOfBlock: (r) => String(r.numberOfBlock),
    numberOfVillage: (r) => String(r.numberOfVillage),
    numberOfTraining: (r) => String(r.numberOfTraining),
    farmersInfluenced: (r) => String(r.farmersInfluenced),
  });
  const columns: ReportColumn[] = [
    { key: "year", label: "Reporting year" },
    { key: "blocks", label: "No. of blocks covered" },
    { key: "villages", label: "No. of villages covered" },
    { key: "trained", label: "Total no. of Trained/Practicing NF Farmer" },
    { key: "influenced", label: "No. of farmers influenced to adopt NF" },
    { key: "allSeason", label: "No. of farmers engaged all season" },
    { key: "oneSeason", label: "No. of farmers engaged in 1 season" },
    { key: "remarks", label: "Remarks" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  const blocks: ReportBlock[] = [...groupInto(records, (r) => r.kvk.name).entries()].map(([kvkName, list]) => ({
    heading: kvkName,
    parts: [{
      kind: "grid" as const,
      columns,
      rows: list.map((r) => ({
        year: r.reportingYear != null ? String(r.reportingYear) : "",
        blocks: String(r.numberOfBlock),
        villages: String(r.numberOfVillage),
        trained: String(r.numberOfTraining),
        influenced: String(r.farmersInfluenced),
        allSeason: r.farmersEngagedAllSeason != null ? String(r.farmersEngagedAllSeason) : "",
        oneSeason: r.farmersEngagedOneSeason != null ? String(r.farmersEngagedOneSeason) : "",
        remarks: r.remarks ?? "",
      })),
    }],
  }));
  return { blocks };
}

/**
 * 3.5.F "Natural Farming Soil Data" (super-v2-prod.pdf p.76) - one grid per plot type, each
 * with the before/after pH-EC-OC-N-P-K-Microbes grid (N/P/K/Microbes added in migration batch #3).
 */
async function buildNfSoilData(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nfSoilData.findMany({
    where: scopeAndPeriod(scope, "nfSoilData"),
    select: {
      season: true, type: true, crop: true,
      beforePh: true, beforeEc: true, beforeEcOc: true, beforeN: true, beforeP: true, beforeK: true, beforeMicrobes: true,
      afterPh: true, afterEc: true, afterEcOc: true, afterN: true, afterP: true, afterK: true, afterMicrobes: true,
    },
    orderBy: [{ type: "asc" }, { season: "asc" }],
  });
  // Real bug fix, 2026-09-14 - always `blocks` (per plot type). Field keys
  // match the list's own column keys (page.tsx's "nf-soil-data" mapping) -
  // no `kvk` accessor since this model has no kvk field selected here.
  const records = applyListFilter(rawRecords, scope, {
    season: (r) => r.season,
    type: (r) => r.type,
    crop: (r) => r.crop,
    beforePh: (r) => stringifyValue(r.beforePh),
    beforeEc: (r) => stringifyValue(r.beforeEc),
    beforeEcOc: (r) => stringifyValue(r.beforeEcOc),
    afterPh: (r) => stringifyValue(r.afterPh),
    afterEc: (r) => stringifyValue(r.afterEc),
    afterEcOc: (r) => stringifyValue(r.afterEcOc),
  });
  const B = "Before crop sowing", A = "After harvesting";
  const columns: ReportColumn[] = [
    { key: "season", label: "Season" },
    { key: "crop", label: "Crop" },
    ...([["b", B], ["a", A]] as const).flatMap(([p, g]) => [
      { key: `${p}Ph`, label: "pH", groups: [g] },
      { key: `${p}Ec`, label: "EC (dS/m)", groups: [g] },
      { key: `${p}Oc`, label: "OC (%)", groups: [g] },
      { key: `${p}N`, label: "N (Kg/ha)", groups: [g] },
      { key: `${p}P`, label: "P (Kg/ha)", groups: [g] },
      { key: `${p}K`, label: "K (Kg/ha)", groups: [g] },
      { key: `${p}Mic`, label: "Soil Microbes (cfu)", groups: [g] },
    ]),
  ];
  if (records.length === 0) return { columns, noSerial: true, keepEmpty: true };
  const rowOf = (r: (typeof records)[number]) => ({
    season: r.season, crop: r.crop,
    bPh: stringifyValue(r.beforePh), bEc: stringifyValue(r.beforeEc), bOc: stringifyValue(r.beforeEcOc),
    bN: stringifyValue(r.beforeN), bP: stringifyValue(r.beforeP), bK: stringifyValue(r.beforeK), bMic: stringifyValue(r.beforeMicrobes),
    aPh: stringifyValue(r.afterPh), aEc: stringifyValue(r.afterEc), aOc: stringifyValue(r.afterEcOc),
    aN: stringifyValue(r.afterN), aP: stringifyValue(r.afterP), aK: stringifyValue(r.afterK), aMic: stringifyValue(r.afterMicrobes),
  });
  const blocks: ReportBlock[] = [...groupInto(records, (r) => (r.type || "").trim()).entries()].map(([type, list]) => ({
    heading: type ? `Soil Parameter for Demo plot at ${type}` : "Soil Parameter for Demo plot",
    parts: [{ kind: "grid" as const, noSerial: true, columns, rows: list.map(rowOf) }],
  }));
  return { blocks };
}

/** 3.5.G "Natural Farming Budget Expenditure" (super-v2-prod.pdf p.76) - flat, with a Total row. */
async function buildNfBudgetExpenditure(scope: ReportScope): Promise<CustomTableResult> {
  const records = await prisma.nfBudgetExpenditure.findMany({
    where: scopeAndPeriod(scope, "nfBudgetExpenditure"),
    select: { activityName: true, activitiesOrganised: true, budgetSanction: true, budgetExpenditure: true, totalBudgetExpenditure: true },
    orderBy: { activityName: "asc" },
  });
  const num = (v: unknown) => Number(v ?? 0);
  const columns: ReportColumn[] = [
    { key: "activity", label: "Name of activity" },
    { key: "count", label: "Number of activities organized" },
    { key: "sanction", label: "Budget sanction (Rs)" },
    { key: "expenditure", label: "Budget expenditure (Rs)" },
    { key: "total", label: "Total Budget Expenditure (Rs)" },
  ];
  if (records.length === 0) return { columns, noSerial: true, keepEmpty: true };
  return {
    columns,
    noSerial: true,
    rows: records.map((r) => ({
      activity: r.activityName,
      count: String(r.activitiesOrganised),
      sanction: String(num(r.budgetSanction)),
      expenditure: String(num(r.budgetExpenditure)),
      total: String(num(r.totalBudgetExpenditure)),
    })),
    totalRow: {
      activity: "Total",
      count: String(records.reduce((a, r) => a + r.activitiesOrganised, 0)),
      sanction: String(records.reduce((a, r) => a + num(r.budgetSanction), 0)),
      expenditure: String(records.reduce((a, r) => a + num(r.budgetExpenditure), 0)),
      total: String(records.reduce((a, r) => a + num(r.totalBudgetExpenditure), 0)),
    },
  };
}

/** The fixed Without/With NF parameter comparison grid (super-v2-prod.pdf p.66-74), read from a record's `parameters` JSON. */
function nfParameterGrid(parameters: unknown): ReportBlockPart {
  const j = (parameters ?? {}) as Record<string, { without?: unknown; with?: unknown } | undefined>;
  return {
    kind: "grid",
    noSerial: true,
    columns: [
      { key: "param", label: "Name of parameter" },
      { key: "without", label: "Performance Without NF Practice" },
      { key: "with", label: "Performance With NF Practice" },
    ],
    rows: NF_COMPARISON_PARAMETERS.map((p) => ({
      param: p.label,
      without: j[p.key]?.without != null ? String(j[p.key]!.without) : "",
      with: j[p.key]?.with != null ? String(j[p.key]!.with) : "",
    })),
  };
}

/**
 * 3.5.C "Natural Farming Demonstration Information" (super-v2-prod.pdf p.65-68) - one
 * per-farmer block: the KVK/farmer/site pairs, the activity meta, then the fixed
 * Without/With NF parameter comparison grid from `parameters` JSON.
 */
async function buildNfDemonstration(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nfDemonstrationInfo.findMany({
    where: scopeAndPeriod(scope, "nfDemonstrationInfo"),
    include: { kvk: { select: { name: true, state: { select: { name: true } } } } },
    orderBy: [{ kvk: { name: "asc" } }, { createdAt: "asc" }],
  });
  // Real bug fix, 2026-09-14 - one `pairs` block per farmer (not a grid, so
  // even the general client-side blocks fix can't reach it - this needs the
  // server-side narrowing). Field keys match the list's own column keys
  // (page.tsx's "nf-demonstration" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    farmerName: (r) => r.farmerName,
    activityName: (r) => r.activityName,
    crop: (r) => r.crop,
    variety: (r) => r.variety,
    farmerAddress: (r) => r.farmerAddress ?? "",
    farmerContact: (r) => r.farmerContact ?? "",
    agroClimaticZone: (r) => r.agroClimaticZone ?? "",
    croppingPattern: (r) => r.croppingPattern ?? "",
    farmingSituation: (r) => r.farmingSituation ?? "",
    latitude: (r) => (r.latitude != null ? String(r.latitude) : ""),
    longitude: (r) => (r.longitude != null ? String(r.longitude) : ""),
  });
  const DEMO_LABELS = [
    "Name of KVK/Farmer where demonstration conducted", "Address of Farmer with contact detail",
    "Agro Climatic Zone of Village/KVK", "Cropping pattern of KVK plot/ Farmer plot",
    "Farming Situation of the Selected Farmer/KVK", "Latitude (N)", "Longitude (E)",
    "Name of Activity", "Crop", "Variety", "Season (Kharif / Rabi / Summer)",
    "Name of Natural Farming components/Technology demonstrated", "Area (ha) in Natural farming practice",
    "Detail of farmer practice", "Farmer Feedback",
  ];
  if (records.length === 0) {
    return {
      blocks: [{
        heading: "A) KVK/ Farmer wise information of demonstration conducted.",
        parts: [{ kind: "pairs", pairs: DEMO_LABELS.map((label) => ({ label, value: "" })) }, nfParameterGrid(null)],
      }],
    };
  }
  const blocks: ReportBlock[] = records.map((r) => ({
    heading: `${r.kvk.name} — ${r.farmerName}`,
    parts: [
      {
        kind: "pairs",
        pairs: [
          { label: "Name of State", value: r.kvk.state?.name ?? "" },
          { label: "Name of KVK/Farmer where demonstration conducted", value: `${r.kvk.name} — ${r.farmerName}` },
          { label: "Address of Farmer with contact detail", value: [r.farmerAddress, r.farmerContact ? `Contact: ${r.farmerContact}` : ""].filter(Boolean).join(" | ") },
          { label: "Agro Climatic Zone of Village/KVK", value: r.agroClimaticZone ?? "" },
          { label: "Cropping pattern of KVK plot/ Farmer plot", value: r.croppingPattern ?? "" },
          { label: "Farming Situation of the Selected Farmer/KVK", value: r.farmingSituation ?? "" },
          { label: "Latitude (N)", value: stringifyValue(r.latitude) },
          { label: "Longitude (E)", value: stringifyValue(r.longitude) },
          { label: "Name of Activity", value: r.activityName },
          { label: "Crop", value: r.crop },
          { label: "Variety", value: r.variety },
          { label: "Season (Kharif / Rabi / Summer)", value: r.season ?? "" },
          { label: "Name of Natural Farming components/Technology demonstrated", value: r.technologyDemonstrated ?? "" },
          { label: "Area (ha) in Natural farming practice", value: stringifyValue(r.areaHa) },
          { label: "Detail of farmer practice", value: r.farmerPracticeDetail ?? "" },
          { label: "Farmer Feedback", value: r.farmerFeedback ?? "" },
        ],
      },
      nfParameterGrid(r.parameters),
    ],
  }));
  return { blocks };
}

/**
 * 3.5.D "Natural Farming Farmers Practicing" (super-v2-prod.pdf p.68-74) - one per-farmer
 * block: the farmer pairs, then the same Without/With NF parameter comparison grid.
 */
async function buildNfAlreadyPracticing(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.nfAlreadyPracticing.findMany({
    where: scopeAndPeriod(scope, "nfAlreadyPracticing"),
    include: { kvk: { select: { name: true } } },
    orderBy: [{ kvk: { name: "asc" } }, { createdAt: "asc" }],
  });
  // Real bug fix, 2026-09-14 - one `pairs` block per farmer (needs the
  // server-side narrowing, same as buildNfDemonstration above). Field keys
  // match the list's own column keys (page.tsx's "nf-already-practicing" mapping).
  const records = applyListFilter(rawRecords, scope, {
    kvk: (r) => r.kvk.name,
    farmerName: (r) => r.farmerName,
    address: (r) => r.address ?? "",
    normalCropsGrown: (r) => r.normalCropsGrown ?? "",
    practicingYear: (r) => String(r.practicingYear),
    contactNumber: (r) => r.contactNumber ?? "",
    activityName: (r) => r.activityName ?? "",
    crop: (r) => r.crop ?? "",
    technologyDemonstrated: (r) => r.technologyDemonstrated ?? "",
    areaHa: (r) => (r.areaHa != null ? String(r.areaHa) : ""),
    farmerFeedback: (r) => r.farmerFeedback ?? "",
  });
  const PRAC_LABELS = [
    "Name of Farmer", "Address", "Contact Number", "Name of Activity", "Crop",
    "Name of Natural Farming components/Technology demonstrated", "Area (ha) in Natural farming practice",
    "Practicing Year Of Natural Farming", "Farmer Feedback",
  ];
  if (records.length === 0) {
    return {
      blocks: [{
        heading: "Information of Farmer Already Practicing Natural Farming",
        parts: [{ kind: "pairs", pairs: PRAC_LABELS.map((label) => ({ label, value: "" })) }, nfParameterGrid(null)],
      }],
    };
  }
  const blocks: ReportBlock[] = records.map((r) => ({
    heading: `${r.kvk.name} — ${r.farmerName}`,
    parts: [
      {
        kind: "pairs",
        caption: "Information of Farmer Already Practicing Natural Farming",
        pairs: [
          { label: "Name of Farmer", value: r.farmerName },
          { label: "Address", value: r.address ?? "" },
          { label: "Contact Number", value: r.contactNumber ?? "" },
          { label: "Name of Activity", value: r.activityName ?? "" },
          { label: "Crop", value: r.crop ?? "" },
          { label: "Name of Natural Farming components/Technology demonstrated", value: r.technologyDemonstrated ?? "" },
          { label: "Area (ha) in Natural farming practice", value: stringifyValue(r.areaHa) },
          { label: "Practicing Year Of Natural Farming", value: String(r.practicingYear) },
          { label: "Farmer Feedback", value: r.farmerFeedback ?? "" },
        ],
      },
      nfParameterGrid(r.parameters),
    ],
  }));
  return { blocks };
}

/**
 * 3.8.B "Agri-Drone Demonstration" (super-v2-prod.pdf p.79) - flat, with the "No. of
 * Participants" caste M/F/T block + Grand Total added in migration batch #3.
 */
async function buildAgriDroneDemonstration(scope: ReportScope): Promise<CustomTableResult> {
  const records = await prisma.agriDroneDemonstration.findMany({
    where: scopeAndPeriod(scope, "agriDroneDemonstration"),
    select: {
      centreName: true, district: true, dateOfDemos: true, placeOfDemos: true, cropName: true,
      noOfDemos: true, areaCovered: true, ...CASTE_SELECT,
    },
    orderBy: { dateOfDemos: "asc" },
  });
  const columns: ReportColumn[] = [
    { key: "demosOn", label: "Demos on" },
    { key: "district", label: "Name of district" },
    { key: "date", label: "Date of demonstration" },
    { key: "place", label: "Place of demonstration" },
    { key: "crop", label: "Crop Name" },
    { key: "noOfDemos", label: "No. of demos" },
    { key: "area", label: "Area covered under demos (area in ha)" },
    ...casteMftColumns("No. of Participants", { grandLabel: "Grand Total" }),
  ];
  if (records.length === 0) return { columns, noSerial: true, keepEmpty: true };
  return {
    columns,
    noSerial: true,
    rows: records.map((r) => ({
      demosOn: r.centreName,
      district: r.district,
      date: stringifyValue(r.dateOfDemos),
      place: r.placeOfDemos,
      crop: r.cropName,
      noOfDemos: String(r.noOfDemos),
      area: stringifyValue(r.areaCovered),
      ...casteMftRow([r], "", true),
    })),
  };
}

/**
 * 3.9.A "Details FPO and CBBO" (super-v2-prod.pdf p.79) - flat state/district-led row with
 * the reference's ~15 columns (most added in migration batch #3).
 */
async function buildFpoCbboDetails(scope: ReportScope): Promise<CustomTableResult> {
  const rawRecords = await prisma.fpoCbboDetail.findMany({
    where: scopeAndPeriod(scope, "fpoCbboDetail"),
    select: {
      noOfBlocksAllocated: true, noOfFposRegistered: true, avgMembersPerFpo: true,
      noOfFpoManagementCost: true, noOfFpoEquityGrant: true, techBackstoppingFpos: true,
      noOfTrainingProgrammes: true, trainingReceived: true, assistanceEconomicActivities: true,
      businessPlanPrepared: true, businessPlanWithoutCbbo: true, noOfFposDoingBusiness: true,
      kvk: { select: { name: true, state: { select: { name: true } }, district: { select: { name: true } } } },
    },
    orderBy: { kvk: { state: { name: "asc" } } },
  });
  // Real bug fix, 2026-09-14 - this table rolls up by state/district (no
  // "kvk" column at all), but the list's own "kvk" filter should still
  // narrow which underlying records feed that rollup.
  const records = applyListFilter(rawRecords, scope, { kvk: (r) => r.kvk?.name ?? "" });
  const yn = (b: boolean) => (b ? "Yes" : "No");
  const opt = (v: number | null) => (v != null ? String(v) : "");
  const columns: ReportColumn[] = [
    { key: "state", label: "Name of state" },
    { key: "district", label: "Name of district" },
    { key: "blocks", label: "No. of blocks allocated" },
    { key: "registered", label: "No. of FPOs registered as CBBO" },
    { key: "avgMembers", label: "Average no of members per FPO" },
    { key: "mgmtCost", label: "No. of FPO received management cost" },
    { key: "equityGrant", label: "No. of FPO received equity grant" },
    { key: "techBackstop", label: "Tech. backstopping provided to no. of FPOs" },
    { key: "trainingProg", label: "No. of training programme organized for FPOs for technology backstopping as CBBO", listKey: "noOfTrainingProgrammes" },
    { key: "trainingReceived", label: "Training received by FPO members" },
    { key: "assistance", label: "Assistance to no. of FPOs in economic activities" },
    { key: "bpCbbo", label: "Is business plan prepared for FPOs as CBBOs" },
    { key: "bpWithout", label: "Is business plan prepared for FPOs as without CBBOs" },
    { key: "doingBusiness", label: "No. of FPOs doing business" },
  ];
  if (records.length === 0) return { columns, keepEmpty: true };
  return {
    columns,
    rows: records.map((r) => ({
      state: r.kvk.state?.name ?? "",
      district: r.kvk.district?.name ?? "",
      blocks: String(r.noOfBlocksAllocated),
      registered: String(r.noOfFposRegistered),
      avgMembers: opt(r.avgMembersPerFpo),
      mgmtCost: opt(r.noOfFpoManagementCost),
      equityGrant: opt(r.noOfFpoEquityGrant),
      techBackstop: opt(r.techBackstoppingFpos),
      trainingProg: opt(r.noOfTrainingProgrammes),
      trainingReceived: r.trainingReceived ?? "",
      assistance: opt(r.assistanceEconomicActivities),
      bpCbbo: yn(r.businessPlanPrepared),
      bpWithout: yn(r.businessPlanWithoutCbbo),
      doingBusiness: String(r.noOfFposDoingBusiness),
    })),
  };
}

/** Section 3 model-name -> builder map (consulted by `fetchTable`, same mechanism as SECTION_456_BUILDERS). */
const SECTION_3_BUILDERS: Record<string, (scope: ReportScope) => Promise<CustomTableResult>> = {
  nfGeographicalInfo: buildNfGeographical,
  agriDroneIntroduction: buildAgriDroneIntroduction,
  drmrActivity: buildDrmrActivity,
  craDetail: buildCraDetails,
  otherProgramme: buildOtherProgrammes,
  cfldTechnicalParameter: buildCfldTechnicalParameter,
  nicraBasicInformation: buildNicraBasicInfo,
  nicraDetails: buildNicraDetails,
  aryaCurrentYearDetail: buildAryaCurrentYear,
  aryaPreviousYearEvaluation: buildAryaPreviousYear,
  nfPhysicalInfo: buildNfPhysical,
  nfDemonstrationInfo: buildNfDemonstration,
  nfAlreadyPracticing: buildNfAlreadyPracticing,
  nfBeneficiary: buildNfBeneficiary,
  nfSoilData: buildNfSoilData,
  nfBudgetExpenditure: buildNfBudgetExpenditure,
  agriDroneDemonstration: buildAgriDroneDemonstration,
  fpoCbboDetail: buildFpoCbboDetails,
  fpoManagement: flatReportTable({
    model: "fpoManagement",
    columns: [
      { key: "fpoName", label: "Name of the FPO" },
      { key: "fpoAddress", label: "Address of FPO" },
      { key: "registrationNo", label: "Registration No" },
      { key: "dateOfRegistration", label: "Date of Registration" },
      { key: "proposedActivity", label: "Proposed Activity" },
      { key: "commodityIdentified", label: "Commodity identified" },
      { key: "areaHa", label: "Area (ha)" },
      { key: "totalBomMembers", label: "Total No. of BOM Members" },
      { key: "totalFarmersAttached", label: "Total no of farmers attached" },
      { key: "financialPosition", label: "Financial position (Rupees in lakh)" },
      { key: "successIndicator", label: "Success indicator" },
    ],
  }),
  drmrDetail: flatReportTable({
    model: "drmrDetail",
    lead: [{ key: "kvk", label: "Name of KVK" }],
    columns: [
      { key: "varietiesUsedInIp", label: "Varieties used in IP" },
      { key: "situations", label: "Situations (Irrigated/Rain fed)" },
      { key: "varietiesUsedInFp", label: "Varieties used in FP" },
      { key: "yieldKgHaIp", label: "IP", groups: ["Yield (Kg/ha)"] },
      { key: "yieldKgHaFp", label: "FP", groups: ["Yield (Kg/ha)"] },
      { key: "yiofpPercentIp", label: "IP", groups: ["YIOFP (%)"] },
      { key: "yiofpPercentFp", label: "FP", groups: ["YIOFP (%)"] },
      { key: "cocRsHaIp", label: "IP", groups: ["COC (Rs./ha)"] },
      { key: "cocRsHaFp", label: "FP", groups: ["COC (Rs./ha)"] },
      { key: "gmrRsHaIp", label: "IP", groups: ["GMR (Rs./ha)"] },
      { key: "gmrRsHaFp", label: "FP", groups: ["GMR (Rs./ha)"] },
      { key: "anmrRsHaIp", label: "IP", groups: ["ANMR (Rs./ha)"] },
      { key: "anmrRsHaFp", label: "FP", groups: ["ANMR (Rs./ha)"] },
      { key: "bcRatioIp", label: "IP", groups: ["B:C ratio GMR/COC"] },
      { key: "bcRatioFp", label: "FP", groups: ["B:C ratio GMR/COC"] },
    ],
    noSerial: true,
  }),
  craExtensionActivity: buildCraExtension,
  csisaDetail: flatReportTable({
    model: "csisaDetail",
    lead: [KVK],
    caption: "Details of Cereal Systems Initiative for South Asia (CSISA)",
    columns: [
      { key: "season", label: "Season" },
      { key: "villageCovered", label: "Village Covered" },
      { key: "blockCovered", label: "Block Covered" },
      { key: "districtCovered", label: "District Covered" },
      { key: "respondent", label: "Respondent" },
      { key: "trailName", label: "Trial Name" },
      { key: "areaCoveredHa", label: "Area Covered(ha)" },
      { key: "cropName", label: "Name of Crop" },
      { key: "techOptions", label: "Tech. Options" },
      { key: "varietyName", label: "Variety Name" },
      { key: "durationDays", label: "Duration(Days)" },
      { key: "sowingDate", label: "Sowing Date" },
      { key: "harvestingDate", label: "Harvesting Date" },
      { key: "maturityDays", label: "Maturity Days" },
      { key: "grainYieldQha", label: "Grain Yield(q/ha)" },
      { key: "costOfCultivationRsHa", label: "Cost of Cult.(Rs/ha)" },
      { key: "grossReturnRsHa", label: "Gross Return(Rs/ha)" },
      { key: "netReturnRsHa", label: "Net Return(Rs/ha)" },
      { key: "bcr", label: "BCR" },
    ],
  }),
  seedHubProgram: flatReportTable({
    model: "seedHubProgram",
    lead: [KVK],
    // Labels transcribed from super-v2-prod.pdf 3.13.A.
    columns: [
      { key: "season", label: "Season" },
      { key: "cropName", label: "Name of crop taken under seed production" },
      { key: "variety", label: "Name of variety taken under seed production" },
      { key: "areaHa", label: "Crop and variety wise area (ha) covered under seed production" },
      { key: "yieldHa", label: "Crop and variety wise Yield (Q/ha)" },
      { key: "qtySeedProducedQ", label: "Crop and variety wise quantity of seed produced (Q)" },
      { key: "qtySeedSaleOutQ", label: "Crop and variety wise quantity of seed sale out (Q)" },
      { key: "farmersPurchased", label: "Crop and variety wise number of farmers purchased seed from KVK" },
      { key: "qtySeedSaleOutToFarmersQ", label: "Quantity of seed sale out to farmers (Q)" },
      { key: "villagesCovered", label: "No of village covered through sale of seed" },
      { key: "qtySeedSaleOutOtherOrgQ", label: "Quantity of seed sale out to other organization (Q)" },
      { key: "amountGeneratedLakh", label: "Amount generated (Lakh)" },
      { key: "totalAmountInProjectLakh", label: "Total amount (Lakh) in Seed Hub project presently" },
    ],
  }),
};

/** The exact section/subsection/table tree from the client's real "ATARI AMS REPORT" export (super-v2-prod.pdf), in TOC order. */
/** Shared between both report variants - identical in both the 93pg (Super Admin) and 50pg (KVK-scoped) real source PDFs' TOCs. */
const PROJECTS_SECTION: Sec = {
    num: "3", title: "PROJECTS", subs: [
      { num: "3.1", title: "CFLD", items: [
        { code: "3.1.A", title: "Technical Parameter", model: "cfldTechnicalParameter", scope: "direct" },
        { code: "3.1.B", title: "Extension Activity", model: "cfldExtensionActivity", scope: "direct", custom: buildCfldExtensionActivity },
        { code: "3.1.C", title: "Budget Utilization", model: "cfldBudgetUtilization", scope: "direct", custom: buildCfldBudgetUtilization },
      ]},
      { num: "3.2", title: "NICRA", items: [
        { code: "3.2.A", title: "Basic Information", model: "nicraBasicInformation", scope: "direct" },
        { code: "3.2.B", title: "Details", model: "nicraDetails", scope: "direct" },
        { code: "3.2.C", title: "Training", model: "nicraTraining", scope: "direct", custom: buildNicraStatePivot("nicraTraining", "No. of Trainings") },
        { code: "3.2.D", title: "Extension Activity", model: "nicraExtensionActivity", scope: "direct", custom: buildNicraStatePivot("nicraExtensionActivity", "No. of Programmes") },
      ]},
      { num: "3.3", title: "NICRA Others", items: [
        { code: "3.3.A", title: "Intervention", model: "nicraIntervention", scope: "direct", custom: buildNicraIntervention },
        { code: "3.3.B", title: "Revenue Generated", model: "nicraRevenueGenerated", scope: "direct", custom: buildNicraRevenue },
        { code: "3.3.C", title: "Custom Hiring", model: "nicraCustomHiringFarmImplement", scope: "direct", custom: buildNicraCustomHiring },
        { code: "3.3.D", title: "VCRMC", model: "nicraVillageWiseVcrmc", scope: "direct", custom: buildNicraVcrmc },
        { code: "3.3.E", title: "Soil Health Card", model: "nicraSoilHealthCard", scope: "direct", custom: buildNicraSoilHealthCard },
        { code: "3.3.F", title: "Convergence Programme", model: "nicraConvergenceProgramme", scope: "direct", custom: buildNicraConvergence },
        { code: "3.3.G", title: "Dignitaries Visited", model: "nicraDignitaryVisit", scope: "direct", custom: buildNicraDignitaries },
        { code: "3.3.H", title: "PI/Co-PI List", model: "nicraPiCoPi", scope: "direct", custom: buildNicraPiCoPi },
      ]},
      { num: "3.4", title: "ARYA / SARAL", items: [
        { code: "3.4.A", title: "Current Year Details", model: "aryaCurrentYearDetail", scope: "direct" },
        { code: "3.4.B", title: "Previous Year Evaluation", model: "aryaPreviousYearEvaluation", scope: "direct" },
      ]},
      { num: "3.5", title: "Natural Farming", items: [
        { code: "3.5.A", title: "Geographical Information", model: "nfGeographicalInfo", scope: "direct" },
        { code: "3.5.B", title: "Physical Information", model: "nfPhysicalInfo", scope: "direct" },
        { code: "3.5.C", title: "Demonstration Information", model: "nfDemonstrationInfo", scope: "direct" },
        { code: "3.5.D", title: "Farmers Practicing", model: "nfAlreadyPracticing", scope: "direct" },
        { code: "3.5.E", title: "Beneficiaries", model: "nfBeneficiary", scope: "direct" },
        { code: "3.5.F", title: "Soil Data", model: "nfSoilData", scope: "direct" },
        { code: "3.5.G", title: "Budget Expenditure", model: "nfBudgetExpenditure", scope: "direct" },
      ]},
      { num: "3.6", title: "TSP/SCSP", items: [
        { code: "3.6.A", title: "TSP Activities", model: "subPlanActivity", scope: "direct", custom: buildSubPlanByType("TSP") },
        { code: "3.6.B", title: "SCSP Activities", model: "subPlanActivity", scope: "direct", custom: buildSubPlanByType("SCSP") },
      ]},
      { num: "3.7", title: "NARI", items: [
        { code: "3.7.A", title: "Nutrition Garden", model: "nariNutritionGarden", scope: "direct", custom: buildNariByActivity("nariNutritionGarden", "numbers", "No. of Gardens") },
        { code: "3.7.B", title: "Bio-fortified Crops", model: "nariBioFortified", scope: "direct", custom: buildNariByActivity("nariBioFortified", "numberOfCrops", "No. of Crops") },
        { code: "3.7.C", title: "Value Addition", model: "nariValueAddition", scope: "direct", custom: buildNariByActivity("nariValueAddition", "numberOfProducts", "No. of Products") },
        { code: "3.7.D", title: "Training Program", model: "nariTraining", scope: "direct", custom: buildNariByActivity("nariTraining", "numberOfCourses", "No. of Courses") },
        { code: "3.7.E", title: "Extension Activities", model: "nariExtension", scope: "direct", custom: buildNariByActivity("nariExtension", "noOfActivities", "No. of Activities") },
      ]},
      { num: "3.8", title: "Agri-Drone", items: [
        { code: "3.8.A", title: "Introduction", model: "agriDroneIntroduction", scope: "direct" },
        { code: "3.8.B", title: "Demonstration", model: "agriDroneDemonstration", scope: "direct" },
      ]},
      { num: "3.9", title: "FPO and CBBO", items: [
        { code: "3.9.A", title: "Details FPO and CBBO", model: "fpoCbboDetail", scope: "direct" },
        { code: "3.9.B", title: "FPO Management", model: "fpoManagement", scope: "direct" },
      ]},
      { num: "3.10", title: "DRMR", items: [
        { code: "3.10.A", title: "DRMR Details", model: "drmrDetail", scope: "direct" },
        { code: "3.10.B", title: "DRMR Activity", model: "drmrActivity", scope: "direct" },
      ]},
      { num: "3.11", title: "Climate Resilient Agriculture (CRA)", items: [
        { code: "3.11.A", title: "CRA Details", model: "craDetail", scope: "direct" },
        { code: "3.11.B", title: "Extension Activity", model: "craExtensionActivity", scope: "direct" },
      ]},
      { num: "3.12", title: "CSISA", items: [
        { code: "3.12.A", title: "CSISA", model: "csisaDetail", scope: "direct" },
      ]},
      { num: "3.13", title: "Seed Hub Program", items: [
        { code: "3.13.A", title: "Seed Hub Program", model: "seedHubProgram", scope: "direct" },
      ]},
      { num: "3.14", title: "Other Programmes", items: [
        { code: "3.14.A", title: "Other Programmes", model: "otherProgramme", scope: "direct" },
      ]},
    ],
};

const MEETINGS_SECTION: Sec = {
    num: "6", title: "MEETINGS", subs: [
      { num: "6.1", title: "SAC Meetings", items: [
        { code: "6.1", title: "SAC Meetings", model: "sacMeeting", scope: "direct" },
      ]},
      { num: "6.2", title: "Other Meetings", items: [
        { code: "6.2", title: "Other Meetings", model: "otherMeeting", scope: "direct" },
      ]},
    ],
};

/**
 * Two real, distinct section trees - the client's own 93pg "Super Admin"
 * export (all KVKs) and 50pg "KVK Report" export (one KVK) use different
 * numbering in several places, confirmed by diffing both source PDFs' own
 * Tables of Contents line by line (not assumed to be the same document at
 * two scopes). Sections 3 (PROJECTS) and 6 (MEETINGS) are identical between
 * them - only 1/2/4/5 diverge. Where a real code exists in the source PDF
 * but this app has no distinct backing data for it (e.g. KVK-report's
 * "2.3.B FLD Details" has no separate model from "2.3.A FLD Summary" -
 * same for Super Admin's "2.2.B/C State Wise / KVK Wise OFT Details"),
 * the code is skipped entirely rather than renumbered or duplicated - so a
 * later session that finds real distinct data for it can slot the exact
 * letter back in without shifting every later item.
 */
const SUPER_ADMIN_TREE: Sec[] = [
  {
    num: "1", title: "ABOUT KVK", subs: [
      { num: "1.1", title: "Basic Information", items: [
        {
          code: "1.1.A.1",
          title: "Name and address of KVK with phone, fax and e-mail",
          groupCode: "1.1.A",
          groupTitle: "KVKs Details",
          model: "kvk",
          scope: "direct",
          custom: buildKvkAddressTable,
        },
        {
          code: "1.1.A.2",
          title: "Name and address of host organization with phone, fax and e-mail",
          groupCode: "1.1.A",
          groupTitle: "KVKs Details",
          model: "hostOrganization",
          scope: "direct",
          custom: buildHostOrgAddressTable,
        },
        {
          code: "1.1.B",
          title: "Bank Account Details",
          model: "bankAccount",
          scope: "direct",
          custom: kvkOwnedTable(
            "bankAccount",
            [
              { key: "accountType", label: "Account Type" },
              { key: "accountName", label: "Account Name" },
              { key: "bankName", label: "Name of the bank" },
              { key: "location", label: "Location" },
              { key: "accountNumber", label: "Account Number" },
            ],
            { kvkLabel: "KVK Name" },
          ),
        },
      ]},
      { num: "1.2", title: "Employee Information", items: [
        {
          code: "1.2.A",
          title: "All KVK Staff",
          model: "staff",
          scope: "direct",
          custom: kvkOwnedTable("staff", [
            { key: "sanctionedPost", label: "Sanctioned post" },
            { key: "name", label: "Name of the Incumbent", listKey: "staffName" },
            { key: "dateOfBirth", label: "Date of Birth" },
            { key: "discipline", label: "Discipline" },
            { key: "payScale", label: "Pay Scale with Present Basic" },
            { key: "dateOfJoining", label: "Date of joining" },
            { key: "category", label: "Category (SC/ST/ OBC/ General)" },
            { key: "jobType", label: "Job Type" },
            { key: "mobile", label: "Mobile" },
            { key: "email", label: "Email" },
          ]),
        },
        { code: "1.2.B", title: "Staff Transferred", model: "staffTransfer", scope: "direct", custom: buildStaffTransferred },
      ]},
      { num: "1.3", title: "Land & Infrastructure Information", items: [
        {
          code: "1.3.A",
          title: "Infrastructure Details",
          model: "infrastructure",
          scope: "direct",
          custom: kvkOwnedTable(
            "infrastructure",
            [
              { key: "infrastructureName", label: "Infrastructure Name", listKey: "infraMasterName" },
              { key: "notYetStarted", label: "Not Yet Started" },
              { key: "completedPlinthLevel", label: "Completed Plinth Level" },
              { key: "completedLintelLevel", label: "Completed Lintel Level" },
              { key: "completedRoofLevel", label: "Completed Roof Level" },
              { key: "totallyCompleted", label: "Totally Completed" },
              { key: "plinthAreaSqM", label: "Plinth Area (sq m)" },
              { key: "underUse", label: "Under Use" },
              { key: "sourceOfFunding", label: "Source of Funding" },
            ],
            { kvkLabel: "KVK Name" },
          ),
        },
        {
          code: "1.3.B",
          title: "Land Details",
          model: "land",
          scope: "direct",
          custom: kvkOwnedTable(
            "land",
            [
              { key: "item", label: "Item" },
              { key: "description", label: "Description" },
              { key: "areaHa", label: "Area (ha)" },
            ],
            { totalField: "areaHa", totalLabel: "Total" },
          ),
        },
        { code: "1.3.C", title: "Staff Quarters Details", model: "staffQuarters", scope: "direct", custom: buildStaffQuarters },
      ]},
      { num: "1.4", title: "Vehicles Information", items: [
        {
          code: "1.4.A",
          title: "Vehicles Details",
          model: "vehicle",
          scope: "direct",
          custom: kvkOwnedTable("vehicle", [
            { key: "name", label: "Name of vehicle", listKey: "vehicleName" },
            { key: "registrationNo", label: "Registration No." },
            { key: "yearOfPurchase", label: "Year of purchase" },
            { key: "cost", label: "Cost (Rs.)", listKey: "totalCost" },
          ]),
        },
        { code: "1.4.B", title: "Vehicle Status", model: "vehicleStatus", scope: "direct", custom: buildVehicleStatus },
      ]},
      { num: "1.5", title: "Equipments Information", items: [
        {
          code: "1.5.A",
          title: "Equipments Details",
          model: "equipment",
          scope: "direct",
          custom: kvkOwnedTable("equipment", [
            { key: "name", label: "Equipment Name", listKey: "equipmentName" },
            { key: "yearOfPurchase", label: "Year of Purchase" },
            { key: "cost", label: "Cost (Rs.)", listKey: "totalCost" },
          ]),
        },
        { code: "1.5.B", title: "Equipment Status", model: "equipmentStatus", scope: "direct", custom: buildEquipmentStatus },
      ]},
    ],
  },
  {
    num: "2", title: "ACHIEVEMENTS", subs: [
      { num: "2.1", title: "Technical Achievement", items: [
        { code: "2.1.A", title: "Technical Achievement Summary", model: "technicalAchievementSummaryEntry", scope: "direct", custom: buildTechnicalAchievementSummary },
      ]},
      { num: "2.2", title: "On Farm Trial", items: [
        { code: "2.2.A", title: "OFT Summary", model: "oft", scope: "direct", custom: buildOftTechnologySummary },
        { code: "2.2.B", title: "State Wise OFT Details", model: "oft", scope: "direct", custom: buildOftStateWiseDetails },
        { code: "2.2.C", title: "KVK Wise OFT Details", model: "oft", scope: "direct", custom: buildOftKvkWiseDetails("2.2.C") },
      ]},
      { num: "2.3", title: "Front Line Demonstration", items: [
        { code: "2.3.A", title: "FLD Summary", model: "fld", scope: "direct", custom: buildFldSectorSummary },
        { code: "2.3.B", title: "State Wise FLD Details", model: "fld", scope: "direct", custom: buildFldStateWiseDetails },
        ...FLD_SECTORS.map((sector, index) => ({
          code: `2.3.C.${index + 1}`,
          title: sector.label,
          groupCode: "2.3.C",
          groupTitle: "Details of Front-Line Demonstration",
          // Real bug fix, 2026-09-14 - was "fldDemonstrationDetail" (the
          // schema table this table's builder used to read, always empty).
          // Now that buildFldDetailsSubTable reads Fld directly, tagging it
          // "fld" too means a View FLD download's own leafModel narrowing
          // (LEAF_MODEL_MAP: "fld") actually includes this table, instead of
          // silently dropping it alongside FLD Summary/State-wise's own
          // real fix.
          model: "fld",
          scope: "direct" as const,
          custom: buildFldDetailsSubTable(sector.key),
        })),
        { code: "2.3.D", title: "Extension & Training activities under FLD", model: "fldExtensionTraining", scope: "direct", custom: buildFldExtensionTraining },
        { code: "2.3.E", title: "Technical Feedback on FLD", model: "fldTechnicalFeedback", scope: "direct", custom: buildFldTechnicalFeedback },
      ]},
      { num: "2.4", title: "Training", items: [
        { code: "2.4.A", title: "Trainings", model: "training", scope: "direct", custom: buildTrainings },
      ]},
      { num: "2.5", title: "Extension", items: [
        { code: "2.5.A", title: "Extension Activities", model: "extensionActivity", scope: "direct", custom: buildExtensionActivities },
        { code: "2.5.B", title: "Other Extension Activities", model: "otherExtensionActivity", scope: "direct", custom: buildOtherExtensionActivities },
      ]},
      { num: "2.6", title: "Special Days", items: [
        { code: "2.6.A", title: "Technology Week", model: "technologyWeekCelebration", scope: "direct", custom: buildTechnologyWeek },
        { code: "2.6.B", title: "Celebration Days", model: "celebrationDay", scope: "direct", custom: buildCelebrationDays },
        { code: "2.6.C", title: "World Soil Day", model: "worldSoilDay", scope: "direct", custom: buildWorldSoilDay },
        { code: "2.6.D", title: "Poshan Maah", model: "poshanMaaha", scope: "direct", custom: buildPoshanMaah },
      ]},
      { num: "2.7", title: "Swacha Bharat Abhiyan", items: [
        { code: "2.7.A", title: "Swachhta hi Sewa", model: "swachhtaObservance", scope: "direct", custom: buildSwachhtaByKind("SEWA") },
        { code: "2.7.B", title: "Swachta Pakhwada", model: "swachhtaObservance", scope: "direct", custom: buildSwachhtaByKind("PAKHWADA") },
        { code: "2.7.C", title: "Budget Expenditure", model: "swachhtaBudgetExpenditure", scope: "direct", custom: buildSwachhtaBudget },
      ]},
      { num: "2.8", title: "Production & Supply", items: [
        { code: "2.8.A", title: "Production and Supply", model: "technologyProductProduction", scope: "direct", custom: buildProductionAndSupply },
      ]},
      { num: "2.9", title: "Soil and Water Testing", items: [
        { code: "2.9.A", title: "Analysis Details", model: "soilWaterPlantAnalysis", scope: "direct", custom: buildSoilWaterAnalysis },
      ]},
      { num: "2.10", title: "Publications", items: [
        { code: "2.10.A", title: "Publications", model: "publication", scope: "direct", custom: buildPublications },
      ]},
      { num: "2.11", title: "Human Resources Development", items: [
        { code: "2.11.A", title: "Human Resources Development", model: "humanResourceDevelopment", scope: "direct", custom: buildHrd },
      ]},
      { num: "2.12", title: "Award and Recognition", items: [
        {
          code: "2.12.A",
          title: "KVK Awards",
          model: "kvkAward",
          scope: "direct",
          custom: kvkOwnedTable(
            "kvkAward",
            [
              { key: "award", label: "Name of the Award" },
              { key: "amount", label: "Amount" },
              { key: "achievement", label: "Achievement" },
              { key: "conferringAuthority", label: "Conferring Authority" },
            ],
            { kvkLabel: "Name of the KVK" },
          ),
        },
        { code: "2.12.B", title: "Scientist Awards", model: "scientistAward", scope: "direct", custom: buildAwardCountByPerson("scientistAward", "headScientist", "Name of the Head/Scientist") },
        { code: "2.12.C", title: "Farmer Awards", model: "farmerAward", scope: "direct", custom: buildAwardCountByPerson("farmerAward", "farmerName", "Name of the Farmer") },
      ]},
    ],
  },
  PROJECTS_SECTION,
  PERFORMANCE_SECTION,
  MISCELLANEOUS_SECTION,
  MEETINGS_SECTION,
];

/** Diverges from SUPER_ADMIN_TREE in sections 1/2/4/5 only - confirmed against kvk-report-202607270504.pdf's own TOC. */
const KVK_TREE: Sec[] = [
  {
    num: "1", title: "ABOUT KVK", subs: [
      { num: "1.1", title: "Basic Information", items: [
        { code: "1.1.A.1", title: "Name and address of KVK with phone, fax and e-mail", groupCode: "1.1.A", groupTitle: "KVKs Details", model: "kvk", scope: "direct", custom: buildKvkAddressTable },
        { code: "1.1.A.2", title: "Name and address of host organization with phone, fax and e-mail", groupCode: "1.1.A", groupTitle: "KVKs Details", model: "hostOrganization", scope: "direct", custom: buildHostOrgAddressTable },
        { code: "1.1.B", title: "Bank Account Details", model: "bankAccount", scope: "direct", custom: kvkOwnedTable("bankAccount", [
          { key: "accountType", label: "Account Type" },
          { key: "accountName", label: "Account Name" },
          { key: "bankName", label: "Name of the bank" },
          { key: "location", label: "Location" },
          { key: "accountNumber", label: "Account Number" },
        ], { kvkLabel: "KVK Name" }) },
      ]},
      { num: "1.2", title: "Employee Information", items: [
        { code: "1.2.A", title: "All KVK Staff", model: "staff", scope: "direct", custom: kvkOwnedTable("staff", [
          { key: "sanctionedPost", label: "Sanctioned post" },
          { key: "name", label: "Name of the Incumbent", listKey: "staffName" },
          { key: "dateOfBirth", label: "Date of Birth" },
          { key: "discipline", label: "Discipline" },
          { key: "payScale", label: "Pay Scale with Present Basic" },
          { key: "dateOfJoining", label: "Date of joining" },
          { key: "category", label: "Category (SC/ST/ OBC/ General)" },
          { key: "jobType", label: "Job Type" },
          { key: "mobile", label: "Mobile" },
          { key: "email", label: "Email" },
        ]) },
        { code: "1.2.B", title: "Staff Transferred", model: "staffTransfer", scope: "direct", custom: buildStaffTransferred },
      ]},
      { num: "1.3", title: "Infrastructure Information", items: [
        { code: "1.3.A", title: "Infrastructure Details", model: "infrastructure", scope: "direct", custom: kvkOwnedTable("infrastructure", [
          { key: "infrastructureName", label: "Name of Infrastructure", listKey: "infraMasterName" },
          { key: "underUse", label: "Under use or not" },
          { key: "sourceOfFunding", label: "Source of Funding" },
          { key: "fundingAgencyName", label: "Funding Agency Name" },
          { key: "plinthAreaSqM", label: "Total Area (m²)" },
        ]) },
        // "Land Details" was missing from the KVK tree entirely (it only
        // existed in the Super Admin tree at 1.3.B), so a per-form report
        // download from the Land Details leaf fell through to the whole 1.3
        // subsection - it "showed another form instead" (client report,
        // 2026-09-04, Bhagalpur). Mirrors the Super Admin 1.3.B table.
        { code: "1.3.B", title: "Land Details", model: "land", scope: "direct", custom: kvkOwnedTable("land", [
          { key: "item", label: "Item" },
          { key: "description", label: "Description" },
          { key: "areaHa", label: "Area (ha)" },
        ], { totalField: "areaHa", totalLabel: "Total" }) },
        { code: "1.3.C", title: "Staff Quarters Details", model: "staffQuarters", scope: "direct", custom: buildStaffQuarters },
      ]},
      { num: "1.4", title: "Vehicles Information", items: [
        { code: "1.4.A", title: "Vehicles Details", model: "vehicle", scope: "direct", custom: kvkOwnedTable("vehicle", [
          { key: "vehicleType", label: "Vehicle Type" },
          { key: "name", label: "Name of vehicle", listKey: "vehicleName" },
          { key: "registrationNo", label: "Registration No." },
          { key: "yearOfPurchase", label: "Year of purchase" },
          { key: "cost", label: "Cost (Rs.)", listKey: "totalCost" },
        ]) },
        { code: "1.4.B", title: "Vehicle Status", model: "vehicleStatus", scope: "direct", custom: buildVehicleStatus },
      ]},
      { num: "1.5", title: "Equipments Information", items: [
        { code: "1.5.A", title: "Equipments Details", model: "equipment", scope: "direct", custom: kvkOwnedTable("equipment", [
          { key: "equipmentType", label: "Equipment Type" },
          { key: "name", label: "Equipment Name", listKey: "equipmentName" },
          { key: "yearOfPurchase", label: "Year of Purchase" },
          { key: "cost", label: "Cost (Rs.)", listKey: "totalCost" },
        ]) },
        { code: "1.5.B", title: "Equipment Status", model: "equipmentStatus", scope: "direct", custom: buildEquipmentStatus },
      ]},
    ],
  },
  {
    num: "2", title: "ACHIEVEMENTS", subs: [
      { num: "2.1", title: "Technical Achievement", items: [
        { code: "2.1.A", title: "Technical Achievement Summary", model: "technicalAchievementSummaryEntry", scope: "direct", custom: buildTechnicalAchievementSummary },
      ]},
      { num: "2.2", title: "On Farm Trial", items: [
        { code: "2.2.A", title: "OFT Summary", model: "oft", scope: "direct", custom: buildOftTechnologySummary },
        { code: "2.2.B", title: "KVK Wise OFT Details", model: "oft", scope: "direct", custom: buildOftKvkWiseDetails("2.2.B") },
      ]},
      { num: "2.3", title: "Front Line Demonstration", items: [
        { code: "2.3.A", title: "FLD Summary", model: "fld", scope: "direct", custom: buildFldSectorSummary },
        // kvk-report-202607270504.pdf's "2.3.B FLD Details" is the same per-sector
        // breakdown (its body prints 1.3.C.1..7 "Details of Front-Line Demonstration
        // on <thematicArea>") that super-v2-prod.pdf calls 2.3.C - one grouped
        // sub-table per FLD sector, so KVK just uses a "2.3.B" code prefix.
        ...FLD_SECTORS.map((sector, index) => ({
          code: `2.3.B.${index + 1}`,
          title: sector.label,
          groupCode: "2.3.B",
          groupTitle: "Details of Front-Line Demonstration",
          // Real bug fix, 2026-09-14 - see the matching comment on the
          // Super Admin tree's own 2.3.C.n entries above.
          model: "fld",
          scope: "direct" as const,
          custom: buildFldDetailsSubTable(sector.key),
        })),
        { code: "2.3.C", title: "Extension & Training activities under FLD", model: "fldExtensionTraining", scope: "direct", custom: buildFldExtensionTraining },
        { code: "2.3.D", title: "Technical Feedback on FLD", model: "fldTechnicalFeedback", scope: "direct", custom: buildFldTechnicalFeedback },
      ]},
      { num: "2.4", title: "Training", items: [
        { code: "2.4.A", title: "Trainings", model: "training", scope: "direct", custom: buildTrainings },
      ]},
      { num: "2.5", title: "Extension", items: [
        { code: "2.5.A", title: "Extension Activities", model: "extensionActivity", scope: "direct", custom: buildExtensionActivities },
        { code: "2.5.B", title: "Other Extension Activities", model: "otherExtensionActivity", scope: "direct", custom: buildOtherExtensionActivities },
      ]},
      { num: "2.6", title: "Special Days", items: [
        { code: "2.6.A", title: "Technology Week", model: "technologyWeekCelebration", scope: "direct", custom: buildTechnologyWeek },
        { code: "2.6.B", title: "Important Events", model: "celebrationDay", scope: "direct", custom: buildCelebrationDays },
        { code: "2.6.C", title: "World Soil Day", model: "worldSoilDay", scope: "direct", custom: buildWorldSoilDay },
        { code: "2.6.D", title: "Poshan Maah", model: "poshanMaaha", scope: "direct", custom: buildPoshanMaah },
      ]},
      { num: "2.7", title: "Swacha Bharat Abhiyan", items: [
        { code: "2.7.A", title: "Swachhta hi Sewa", model: "swachhtaObservance", scope: "direct", custom: buildSwachhtaByKind("SEWA") },
        { code: "2.7.B", title: "Swachta Pakhwada", model: "swachhtaObservance", scope: "direct", custom: buildSwachhtaByKind("PAKHWADA") },
        { code: "2.7.C", title: "Budget Expenditure", model: "swachhtaBudgetExpenditure", scope: "direct", custom: buildSwachhtaBudget },
      ]},
      { num: "2.8", title: "Production & Supply", items: [
        { code: "2.8.A", title: "Production and Supply", model: "technologyProductProduction", scope: "direct", custom: buildProductionAndSupply },
      ]},
      { num: "2.9", title: "Soil and Water Testing", items: [
        { code: "2.9.A", title: "Analysis Details", model: "soilWaterPlantAnalysis", scope: "direct", custom: buildSoilWaterAnalysis },
      ]},
      { num: "2.10", title: "Publications", items: [
        { code: "2.10.A", title: "Publications", model: "publication", scope: "direct", custom: buildPublications },
      ]},
      { num: "2.11", title: "Human Resources Development", items: [
        { code: "2.11.A", title: "Human Resources Development", model: "humanResourceDevelopment", scope: "direct", custom: buildHrd },
      ]},
      { num: "2.12", title: "Award and Recognition", items: [
        {
          code: "2.12.A",
          title: "KVK Awards",
          model: "kvkAward",
          scope: "direct",
          custom: kvkOwnedTable(
            "kvkAward",
            [
              { key: "award", label: "Name of the Award" },
              { key: "amount", label: "Amount" },
              { key: "achievement", label: "Achievement" },
              { key: "conferringAuthority", label: "Conferring Authority" },
            ],
            { kvkLabel: "Name of the KVK" },
          ),
        },
        { code: "2.12.B", title: "Scientist Awards", model: "scientistAward", scope: "direct", custom: buildAwardCountByPerson("scientistAward", "headScientist", "Name of the Head/Scientist") },
        { code: "2.12.C", title: "Farmer Awards", model: "farmerAward", scope: "direct", custom: buildAwardCountByPerson("farmerAward", "farmerName", "Name of the Farmer") },
      ]},
    ],
  },
  PROJECTS_SECTION,
  {
    num: "4", title: "PERFORMANCE", subs: [
      { num: "4.1", title: "Impact", items: [
        { code: "4.1.A", title: "Impact of KVK activities", model: "kvkActivityImpact", scope: "direct" },
        { code: "4.1.B", title: "Entrepreneurship", model: "entrepreneurshipDetail", scope: "direct" },
        { code: "4.1.C", title: "Success Stories", model: "successStory", scope: "direct" },
      ]},
      { num: "4.2", title: "District and Village Performance", items: [
        // kvk-report-202607270504.pdf's TOC lists 4.2 as A/B/C/D/E/F only - "District
        // Level Data" is the one composite table (buildDistrictLevelData already folds
        // the crop-productivity and livestock-production grids into it), so no separate
        // 4.2.A.1 / 4.2.A.2 the way an earlier draft had (matches PERFORMANCE_SECTION).
        { code: "4.2.A", title: "District Level Data", model: "districtLevelData", scope: "direct" },
        { code: "4.2.B", title: "Operational Area Details", model: "operationalAreaDetail", scope: "direct" },
        { code: "4.2.C", title: "Village Adoption Programme", model: "villageAdoptionProgramme", scope: "direct" },
        { code: "4.2.D", title: "Priority Thrust Area", model: "priorityThrustArea", scope: "direct" },
        { code: "4.2.E", title: "Prevalent diseases in Crops", model: "prevalentDiseaseCrop", scope: "direct" },
        { code: "4.2.F", title: "Prevalent diseases in Livestock/Fishery", model: "prevalentDiseaseLivestock", scope: "direct" },
      ]},
      { num: "4.3", title: "Infrastructure Performance", items: [
        { code: "4.3.A", title: "Demonstration Units", model: "demonstrationUnit", scope: "direct" },
        { code: "4.3.B", title: "Instructional Farm (crops)", model: "instructionalFarmCrop", scope: "direct" },
        { code: "4.3.C", title: "Production Units", model: "productionUnit", scope: "direct" },
        { code: "4.3.D", title: "Instructional Farm (livestock)", model: "instructionalFarmLivestock", scope: "direct" },
        { code: "4.3.E", title: "Hostel Facilities", model: "hostelUtilization", scope: "direct" },
        { code: "4.3.F", title: "Rain Water Harvesting", model: "rainWaterHarvesting", scope: "direct" },
      ]},
      { num: "4.4", title: "Financial Performance", items: [
        { code: "4.4.A", title: "Budget Details", model: "budgetDetail", scope: "direct" },
        { code: "4.4.B", title: "Project-wise Budget Details", model: "projectWiseBudgetPerformance", scope: "direct" },
        { code: "4.4.C", title: "Status of revolving fund", model: "revolvingFund", scope: "direct" },
        { code: "4.4.D", title: "Revenue generation", model: "revenueGeneration", scope: "direct" },
        { code: "4.4.E", title: "Resource Generation", model: "resourceGeneration", scope: "direct" },
      ]},
      { num: "4.5", title: "Linkages", items: [
        { code: "4.5.A", title: "Functional Linkage with Different Organizations", model: "functionalLinkage", scope: "direct" },
      ]},
    ],
  },
  {
    num: "5", title: "MISCELLANEOUS", subs: [
      { num: "5.1", title: "PPV & FRA Sensitization", items: [
        { code: "5.1.A", title: "Training & Awareness Program", model: "ppvFraTrainingProgramme", scope: "direct" },
        { code: "5.1.B", title: "Details of Plant Varieties", model: "ppvFraFarmerDetail", scope: "direct" },
      ]},
      { num: "5.2", title: "RAWE/FET & VIP Visitors", items: [
        { code: "5.2.A", title: "RAWE/FET programme", model: "raweFetFitProgramme", scope: "direct" },
        { code: "5.2.B", title: "List of VIP visitors", model: "vipVisitor", scope: "direct" },
      ]},
      { num: "5.3", title: "Digital Information", items: [
        { code: "5.3.A", title: "Details of Mobile App", model: "digitalMobileApp", scope: "direct" },
        { code: "5.3.B", title: "Details of Web Portal", model: "digitalWebPortal", scope: "direct" },
        { code: "5.3.C", title: "Details of Kisan Sarathi", model: "digitalKisanSarathi", scope: "direct" },
        { code: "5.3.D", title: "Kisan Mobile Advisory Services/KMAS", model: "digitalKmas", scope: "direct" },
        { code: "5.3.E", title: "Details of messages sent through other channels", model: "digitalOtherChannel", scope: "direct" },
      ]},
    ],
  },
  MEETINGS_SECTION,
];

function whereFor(entry: Entry, scope: ReportScope): Record<string, unknown> {
  if (entry.model === "kvk") return scope.kvkId ? { id: scope.kvkId } : { zoneId: scope.zoneId };
  const base = scope.kvkId ? { kvkId: scope.kvkId } : { zoneId: scope.zoneId };
  const period = periodClause(scope, entry.model);
  if (entry.scope === "direct") return { ...base, ...period };
  return scope.kvkId
    ? { [entry.scope.via]: { kvkId: scope.kvkId }, ...period }
    : { zoneId: scope.zoneId, ...period };
}

async function fetchTable(entry: Entry, scope: ReportScope): Promise<ReportTable> {
  const base = {
    code: entry.code,
    title: entry.title,
    model: entry.model,
    groupCode: entry.groupCode,
    groupTitle: entry.groupTitle,
  };
  /** Explicit `custom` wins; otherwise the section-3 / sections-4-5-6 model-name maps (so both trees pick these up despite different numbering). */
  const builder = entry.custom ?? SECTION_3_BUILDERS[entry.model] ?? SECTION_456_BUILDERS[entry.model];
  if (builder) {
    try {
      const r = await builder(scope);
      const cols = r.columns ?? [];
      const hasBlocks = !!(r.blocks && r.blocks.length > 0);
      const hasPairs = !!(r.pairs && r.pairs.length > 0);
      return {
        ...base,
        columns: cols,
        rows: r.rows ?? [],
        totalRow: r.totalRow,
        noSerial: r.noSerial,
        caption: r.caption,
        // Show the column header for an empty grid so a tester sees the exact
        // structure before any data is entered (matches super-v2-prod.pdf's
        // own empty result grids, which print as a bare header).
        keepEmpty: r.keepEmpty ?? (cols.length > 0 && (r.rows?.length ?? 0) === 0 && !hasBlocks && !hasPairs),
        blocks: hasBlocks ? r.blocks : undefined,
        pairs: hasPairs ? r.pairs : undefined,
      };
    } catch (error) {
      // A failing builder shouldn't blank the whole report, but it must be
      // visible in the logs - a silent empty table hid a stale-client bug once.
      console.error(`[report] builder failed for ${entry.code} (${entry.model})`, error);
      return { ...base, columns: [], rows: [] };
    }
  }
  const fields = MODEL_FIELDS[entry.model] ?? [];
  const columns: ReportColumn[] = fields.map((key) => ({ key, label: humanize(key) }));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[entry.model];
    const rawRows: Record<string, unknown>[] = await delegate.findMany({
      where: whereFor(entry, scope),
      select: Object.fromEntries(fields.map((f) => [f, true])),
      take: 200,
    });
    const rows = rawRows.map((r) => Object.fromEntries(fields.map((f) => [f, stringifyValue(r[f])])));
    return { ...base, columns, rows, keepEmpty: columns.length > 0 };
  } catch (error) {
    console.error(`[report] generic fetch failed for ${entry.code} (${entry.model})`, error);
    return { ...base, columns, rows: [] };
  }
}

/**
 * All ~105 tables across every section/subsection are independent - fire
 * every query at once rather than section-by-section, since Promise.all
 * inside a sequential for-loop would otherwise still serialize
 * subsection-to-subsection.
 *
 * Two section trees, one per report the client asked for: a report scoped to
 * exactly one KVK (KVK Admin, or a Super Admin who filtered to a single KVK)
 * follows KVK_TREE, which matches the client's own single-KVK export
 * (Atari_Management_System_Deviation_Report.pdf / kvk-report-*.pdf - "1.3
 * Infrastructure Information", no State-Wise OFT/FLD tables, Prevalent
 * Diseases at 4.2.E/F, section 5 = PPV/RAWE/Digital). Every other scope
 * follows SUPER_ADMIN_TREE, which matches the 93pg "all data" export
 * (super-v2-prod.pdf). The data inside every table is still scoped by
 * `scope.kvkId` regardless of which tree is used.
 */
export async function buildReportSections(scope: ReportScope): Promise<ReportSection[]> {
  const tree = scope.kvkId ? KVK_TREE : SUPER_ADMIN_TREE;
  const allEntries: { entry: Entry; secIdx: number; subIdx: number }[] = [];
  tree.forEach((sec, secIdx) =>
    sec.subs.forEach((sub, subIdx) => sub.items.forEach((entry) => allEntries.push({ entry, secIdx, subIdx }))),
  );

  const [allTables, moduleImages] = await Promise.all([
    Promise.all(allEntries.map(({ entry }) => fetchTable(entry, scope))),
    // Published Module Images for this scope - each carries the Form Management
    // leaf path it was uploaded under (categoryPath), which maps to a report
    // subsection via REPORT_SUBSECTION_BY_LEAF.
    prisma.moduleImage.findMany({
      where: { published: true, ...(scopeAndPeriod(scope, "moduleImage")) },
      select: { categoryPath: true, categoryLabel: true, caption: true, imageUrl: true, reportingYear: true, activityDate: true },
      orderBy: [{ categoryPath: "asc" }, { activityDate: "asc" }],
    }),
  ]);

  // Group the published images by which subsection each categoryPath resolves to.
  const imagesForSub = (sub: { num: string; title: string }): ReportImage[] => {
    const out: ReportImage[] = [];
    for (const img of moduleImages) {
      const ref = reportSubsectionForLeaf(img.categoryPath) ?? REPORT_SUBSECTION_BY_LEAF[img.categoryPath];
      if (!ref || !subsectionMatchesRef(ref, sub)) continue;
      out.push({
        url: `/api/files/view?url=${encodeURIComponent(img.imageUrl)}`,
        caption: img.caption,
        category: img.categoryLabel,
        year: img.reportingYear,
        date: img.activityDate ? stringifyValue(img.activityDate) : undefined,
      });
    }
    return out;
  };

  return tree.map((sec, secIdx) => ({
    num: sec.num,
    title: sec.title,
    subsections: sec.subs.map((sub, subIdx) => {
      const images = imagesForSub(sub);
      return {
        num: sub.num,
        title: sub.title,
        tables: allTables.filter((_, i) => allEntries[i].secIdx === secIdx && allEntries[i].subIdx === subIdx),
        ...(images.length ? { images } : {}),
      };
    }),
  }));
}
