/** Packing list groups and the starter suggestions for a car trip with a roof tent (Swedish: that is what the list shows). */

export const PACK_GROUPS = ["tent", "kitchen", "clothes", "car", "other"] as const;
export type PackGroup = (typeof PACK_GROUPS)[number];

export const STARTER_PACK: Record<PackGroup, string[]> = {
  tent: ["Tält", "Extra tältpinnar och spännlinor", "Liggunderlag", "Sovsäckar", "Kuddar", "Pannlampor", "Powerbank"],
  kitchen: ["Stormkök och gas", "Kastrull och stekpanna", "Kaffekokare", "Termos", "Kylväska", "Vattendunk", "Diskmedel och disktrasa", "Tändare"],
  clothes: ["Regnjacka och regnbyxor", "Ullunderställ", "Fleece", "Vandringskängor", "Mössa och vantar", "Extra strumpor"],
  car: ["Pass eller ID", "Bilens papper och försäkring", "Bil- och telefonladdare", "Offlinekartor i Google Maps", "Bompengar: kolla hur ni betalar (AutoPASS)"],
  other: ["Första hjälpen", "Myggmedel", "Solglasögon", "Sopsäckar", "Kamera"],
};
