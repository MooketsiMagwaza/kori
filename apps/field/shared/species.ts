/**
 * The species list used by the prototype.
 *
 * Sensitivity decides how a sighting may be published (see rules.ts). In the prototype rhino and
 * pangolin are sensitive; the real list is to be agreed with the Department of Wildlife and National
 * Parks. Setswana names are included where known and still need checking by a first-language
 * speaker before release.
 */

export type Sensitivity = "standard" | "sensitive";
export type SpeciesGroup = "mammal" | "bird" | "reptile";

export type Species = {
  id: string;
  common: string;
  setswana?: string;
  scientific: string;
  group: SpeciesGroup;
  sensitivity: Sensitivity;
};

export const SPECIES: readonly Species[] = [
  { id: "elephant", common: "African elephant", setswana: "tlou", scientific: "Loxodonta africana", group: "mammal", sensitivity: "standard" },
  { id: "lion", common: "Lion", setswana: "tau", scientific: "Panthera leo", group: "mammal", sensitivity: "standard" },
  { id: "leopard", common: "Leopard", setswana: "nkwe", scientific: "Panthera pardus", group: "mammal", sensitivity: "standard" },
  { id: "cheetah", common: "Cheetah", setswana: "letlotse", scientific: "Acinonyx jubatus", group: "mammal", sensitivity: "standard" },
  { id: "wild-dog", common: "African wild dog", setswana: "leteane", scientific: "Lycaon pictus", group: "mammal", sensitivity: "standard" },
  { id: "spotted-hyena", common: "Spotted hyena", setswana: "phiri", scientific: "Crocuta crocuta", group: "mammal", sensitivity: "standard" },
  { id: "giraffe", common: "Giraffe", setswana: "thutlwa", scientific: "Giraffa camelopardalis", group: "mammal", sensitivity: "standard" },
  { id: "buffalo", common: "Cape buffalo", setswana: "nare", scientific: "Syncerus caffer", group: "mammal", sensitivity: "standard" },
  { id: "zebra", common: "Plains zebra", setswana: "pitse ya naga", scientific: "Equus quagga", group: "mammal", sensitivity: "standard" },
  { id: "hippo", common: "Hippopotamus", setswana: "kubu", scientific: "Hippopotamus amphibius", group: "mammal", sensitivity: "standard" },
  { id: "kudu", common: "Greater kudu", setswana: "tholo", scientific: "Tragelaphus strepsiceros", group: "mammal", sensitivity: "standard" },
  { id: "gemsbok", common: "Gemsbok", setswana: "kukama", scientific: "Oryx gazella", group: "mammal", sensitivity: "standard" },
  { id: "springbok", common: "Springbok", setswana: "tshepe", scientific: "Antidorcas marsupialis", group: "mammal", sensitivity: "standard" },
  { id: "wildebeest", common: "Blue wildebeest", setswana: "kgokong", scientific: "Connochaetes taurinus", group: "mammal", sensitivity: "standard" },
  { id: "impala", common: "Impala", setswana: "phala", scientific: "Aepyceros melampus", group: "mammal", sensitivity: "standard" },
  { id: "kori-bustard", common: "Kori bustard", setswana: "kgori", scientific: "Ardeotis kori", group: "bird", sensitivity: "standard" },
  { id: "ostrich", common: "Common ostrich", setswana: "ntšhwe", scientific: "Struthio camelus", group: "bird", sensitivity: "standard" },
  { id: "white-rhino", common: "White rhino", setswana: "tshukudu", scientific: "Ceratotherium simum", group: "mammal", sensitivity: "sensitive" },
  { id: "black-rhino", common: "Black rhino", setswana: "tshukudu", scientific: "Diceros bicornis", group: "mammal", sensitivity: "sensitive" },
  { id: "pangolin", common: "Temminck's pangolin", scientific: "Smutsia temminckii", group: "mammal", sensitivity: "sensitive" },
];

const BY_ID = new Map(SPECIES.map((species) => [species.id, species]));

export function speciesById(id: string): Species | undefined {
  return BY_ID.get(id);
}

/** Display name, with the Setswana name after it when there is one. */
export function speciesLabel(id: string): string {
  const species = BY_ID.get(id);
  if (!species) return "Unknown species";
  return species.setswana ? `${species.common} (${species.setswana})` : species.common;
}
