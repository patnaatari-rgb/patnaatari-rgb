/**
 * Training Type -> Training Area -> Thematic Area, as the Training report
 * (2.4.A) groups it. The Add form lets a user pick "Other" and type a new
 * name, and that typed name is what gets saved, so the data holds names the
 * masters never had. The report shows only what the masters define; anything
 * else is grouped under "Other".
 */

export const OTHER_LABEL = "Other";
export const UNSPECIFIED_LABEL = "Not specified";

export type TrainingMasters = {
  types: string[];
  /** `type` is the Training Type this area sits under. */
  areas: { type: string; name: string }[];
  /** `type` and `area` are the Training Type and Training Area this thematic area sits under. */
  themes: { type: string; area: string; name: string }[];
};

export type TrainingChainInput = {
  trainingType: string | null;
  trainingArea: string | null;
  thematicArea: string | null;
};

export type TrainingChain = { type: string; area: string; thematic: string };

/** Typed names differ from the masters in case and spacing ("skill development Training"); that is the same name, not a new one. */
const norm = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function buildTrainingChainResolver(masters: TrainingMasters): (row: TrainingChainInput) => TrainingChain {
  const types = new Map<string, string>();
  for (const name of masters.types) types.set(norm(name), name);

  const areas = new Map<string, string>();
  for (const area of masters.areas) areas.set(`${norm(area.type)}|${norm(area.name)}`, area.name);

  const themes = new Map<string, string>();
  for (const theme of masters.themes) themes.set(`${norm(theme.type)}|${norm(theme.area)}|${norm(theme.name)}`, theme.name);

  /** A blank stays "Not specified"; a value the masters do not know becomes "Other". */
  const fallback = (raw: string | null) => (norm(raw) === "" ? UNSPECIFIED_LABEL : OTHER_LABEL);

  return (row) => {
    const type = types.get(norm(row.trainingType));
    if (!type) {
      return { type: fallback(row.trainingType), area: fallback(row.trainingArea), thematic: fallback(row.thematicArea) };
    }
    const area = areas.get(`${norm(type)}|${norm(row.trainingArea)}`);
    if (!area) {
      return { type, area: fallback(row.trainingArea), thematic: fallback(row.thematicArea) };
    }
    const thematic = themes.get(`${norm(type)}|${norm(area)}|${norm(row.thematicArea)}`);
    return { type, area, thematic: thematic ?? fallback(row.thematicArea) };
  };
}
