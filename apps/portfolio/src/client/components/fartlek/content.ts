/**
 * What the Fartlek page lists. Copy for each entry lives under `fartlek.landing.*` in
 * ../../i18n/fartlekLanding.ts; these arrays only set order and sources. The feature sections and
 * their live screens are in ./live/sections.ts.
 */

export const PILLARS = ["free", "open", "formulas", "research"] as const;

/**
 * A study Fartlek uses, as cited in docs/research/training-blocks.md, docs/decisions/fartlek-best-efforts.md
 * and the Fartlek source. Title, venue and link only where the repo has them.
 */
export interface Source {
  id: SourceId;
  authors: string;
  year: number;
  title?: string;
  venue?: string;
  url?: string;
}

export type SourceId =
  | "frandsen2025" | "molmen2019" | "stoggl2015" | "fokkema2020" | "bosquet2007"
  | "vickers2016" | "smyth2022" | "tanda2011" | "hunter2024";

export const SOURCES: readonly Source[] = [
  {
    id: "frandsen2025",
    authors: "Frandsen JSB et al.",
    year: 2025,
    title: "How much running is too much? Identifying high-risk running sessions in a 5200-person cohort",
    venue: "Br J Sports Med",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/",
  },
  {
    id: "molmen2019",
    authors: "Mølmen KS, Øfsteng SJ, Rønnestad BR",
    year: 2019,
    title: "Block periodization of endurance training: a systematic review and meta-analysis",
    venue: "Open Access J Sports Med 10:145-160",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561",
  },
  {
    id: "stoggl2015",
    authors: "Stöggl TL, Sperlich B",
    year: 2015,
    title: "The training intensity distribution among well-trained and elite endurance athletes",
    venue: "Front Physiol 6:295",
    url: "https://www.frontiersin.org/articles/10.3389/fphys.2015.00295/full",
  },
  {
    id: "fokkema2020",
    authors: "Fokkema T et al.",
    year: 2020,
    title: "Training for a (half-)marathon: training volume and longest endurance run related to performance and running injuries",
    venue: "Scand J Med Sci Sports",
    url: "https://repub.eur.nl/pub/127621/Repub_127621_O-A.pdf",
  },
  {
    id: "bosquet2007",
    authors: "Bosquet L et al.",
    year: 2007,
    title: "Effects of tapering on performance: a meta-analysis",
    venue: "Med Sci Sports Exerc 39(8):1358-65",
    url: "https://coachsci.sdsu.edu/csa/vol131/bosquet.htm",
  },
  // The repo names these by author and year only (code comments and fartlek-best-efforts.md).
  { id: "vickers2016", authors: "Vickers & Vertosick", year: 2016 },
  { id: "smyth2022", authors: "Smyth et al.", year: 2022 },
  { id: "tanda2011", authors: "Tanda", year: 2011 },
  { id: "hunter2024", authors: "Hunter et al.", year: 2024 },
];

export const sourceById = (id: SourceId) => SOURCES.find((s) => s.id === id)!;
/** Short in-text citation: first author's surname, "et al." when there are more, and the year. */
export const cite = (s: Source) => {
  const first = s.authors.split(/,| et al\./)[0].replace(/ [A-ZØÖ]+$/, "");
  const more = s.authors.includes(",") || s.authors.includes("et al.");
  return `${first}${more ? " et al." : ""} ${s.year}`;
};

export type FormulaId =
  | "load" | "fitness" | "fatigue" | "form" | "srpe" | "trimp"
  | "longRun" | "cs" | "riegel" | "vickers" | "tanda" | "smyth";

/** The formula cards, each with the study it comes from when the code cites one. */
export const FORMULAS: readonly { id: FormulaId; source?: SourceId }[] = [
  { id: "load" },
  { id: "fitness" },
  { id: "fatigue" },
  { id: "form" },
  { id: "srpe" },
  { id: "trimp" },
  { id: "longRun", source: "frandsen2025" },
  { id: "cs", source: "hunter2024" },
  { id: "riegel", source: "vickers2016" },
  { id: "vickers", source: "vickers2016" },
  { id: "tanda", source: "tanda2011" },
  { id: "smyth", source: "smyth2022" },
];

export const FAQ = ["q1", "q2", "q3", "q4", "q5", "q6"] as const;
