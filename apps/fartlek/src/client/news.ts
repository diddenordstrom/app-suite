import type { NewsEntry } from "./ui";
import { api } from "./http";

/*
 * Fartlek's "what's new", newest first. Shown once after a release to users who have finished the
 * first-login tour (WhatsNew in packages/ui). Written in Swedish only, short, and only when a
 * release changes how the app is used or needs something from the user; a "Show me" tour is
 * added when the change is easier shown than told. Tour targets are `data-tour` ids in the app.
 */
export const NEWS: NewsEntry[] = [
  {
    // Its own note, not part of the November one.
    id: "2026-12-gym",
    date: "december 2026",
    title: "Nytt i Fartlek: logga gympassen",
    items: [
      "Tryck Öppna pass på dagens gympass i Idag-kortet. Fartlek föreslår pass A (ben och skydd), B (överkropp) eller C (skonsamt) utifrån löpveckan, till exempel överkropp dagen före tröskeln.",
      "Varje set är ifyllt med förra gångens vikt och reps. Klarade du toppen av intervallet i alla set föreslås nästa steg upp.",
      "Byt en övning med ett tryck om maskinen är upptagen, eller lägg till en egen. Historiken följer övningen.",
      "Passet ligger kvar i telefonen om nätet försvinner och sparas när det finns nät igen.",
      "Kört Bolt? Importera din CSV-export under Aktiviteter → Gymhistorik, så har du förra gångens siffror från första passet.",
    ],
  },
  {
    // One note for the whole November release (steps, planned vs actual, the block coach): only the newest entry is shown.
    // A new id when the note grows, so everyone sees it once more (seen notes are stored by id).
    id: "2026-11-november-4",
    date: "november 2026",
    title: "Nytt i Fartlek: pass med steg, en coach i blocket och föreslagna veckor",
    items: [
      "Morgonnotis med dagens pass och dagsformen: slå på under Inställningar → Notiser. På iPhone behöver Fartlek ligga på hemskärmen.",
      "Föreslå veckan: på en vecka som inte har börjat testar Fartlek olika upplägg och föreslår en vecka med långpass och tröskel inom km-ökningen. Ändra, flytta och dra passen som du vill, formen räknas om medan du ändrar.",
      "Förslagen planerar nyckelpassen först: långpasset växer med 1 km i veckan från ditt längsta pass de senaste 30 dagarna, aldrig mer än 10 % över det, och tröskelpasset tar nästa steg på en trappa (3x8, 3x10, 3x12, 2x20 …). Resten fylls med zon 2, och var fjärde vecka blir lättare. ⓘ vid långpasset förklarar regeln och studien bakom.",
      "Passen kan ha steg, som 3x8 min @tröskel / 2 min jogg, och efteråt ser du hur varje steg gick: I mål, Nära eller Utanför. Tryck varv när ett steg byts.",
      "Glömt ett varvtryck? Dela varvet på aktiviteten. Garmin-datan ändras inte.",
      "Bara autovarv, eller varv som inte stämmer med stegen? Fartlek letar upp stegen i tempot och föreslår var de byts. Du väljer själv om du vill använda förslaget.",
      "Blockredigeraren räknar ut formen och km-ökningen medan du skriver, och föreslår ändringar om blocket blir för snällt, för hårt eller för tungt inför ett lopp. Lägg in skriver om texten åt dig.",
      "Cyklar eller simmar du? Ange annan träning per vecka i blocket. Den räknas i formen men inte i km-ökningen.",
      "Nya snabbknappar, en listvy och en liten veckokalender bredvid blocktexten.",
      "Ny inställning: långpassdag. Långpasset hamnar där, söndag om du inte väljer något annat.",
    ],
    // Opens the user's latest run with steps; without one, a card says what will appear.
    tour: async () => {
      const { id } = await api<{ id: string | null }>("/activities/latest-structured").catch(() => ({ id: null }));
      if (!id) {
        return {
          id: "news-results-tour",
          steps: [{ route: "/plan", title: "Plan mot utfört", body: "När du har sprungit ett pass med steg visas här hur varje steg gick. Skriv steg på ett pass under Struktur och tryck varv när ett steg byts." }],
        };
      }
      const route = `/activities/${encodeURIComponent(id)}`;
      return {
        id: "news-results-tour",
        steps: [
          { route, target: "activity-steps", title: "Plan mot utfört", body: "Ditt senaste pass med steg. Varje steg jämförs med det du sprang: drag på tempo, lugna steg på puls." },
          { route, target: "activity-steps-summary", optional: true, title: "Hur dragen gick", body: "Sammanfattningen räknar dragen i mål. Bredvid står det drag som hamnade längst ifrån och hur pulsen drev mellan dragen." },
          { route, target: "activity-split", optional: true, title: "Glömt varvtryck?", body: "Ett varv som täcker både drag och vila går att dela här. Tiden är där tempot byts, annars planens, och Garmin-datan ändras inte." },
          { route, target: "activity-curves", optional: true, title: "Dragen i kurvorna", body: "Dragen är skuggade och tempomålet är inritat som ett band. Peka i en graf för att läsa av alla kurvor samtidigt." },
        ],
      };
    },
  },
  {
    id: "2026-11-11-steg",
    date: "11 november 2026",
    title: "Strukturerade pass och nya kurvor",
    items: [
      "Ett pass kan nu ha steg, till exempel 2 km lugnt, 3x8 min @tröskel / 2 min jogg. Mängden räknas fram ur stegen.",
      "Förhandsvisningen visar målen: lugna steg på ditt pulsband, tröskeldrag på tempo.",
      "Aktiviteterna har nya kurvor: tempo med höjden bakom, puls och kadens på samma tidslinje.",
      "Äldre pass får kadens efter hand, några åt gången vid varje synk.",
      "Att jämföra stegen med det du faktiskt sprang kommer i nästa släpp.",
    ],
    tour: () => ({
      id: "news-steps-tour",
      steps: [
        { route: "/plan", target: "plan-session", advance: "click", optional: true, title: "Öppna ett pass", body: "Stegen skrivs på passet. Tryck på ett löppass i veckan." },
        { target: "session-steps", optional: true, title: "Skriv stegen", body: "Till exempel 2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt. Mängden räknas fram ur stegen, och i blocktexten står stegen inom parentes." },
        { target: "session-steps-preview", optional: true, title: "Så tolkas det", body: "Lugna steg bedöms på ditt pulsband, tröskeldrag på tempo. Tryck på ”Bedöms på …” för att byta." },
        { title: "Kurvor på aktiviteterna", body: "Öppna en aktivitet så ser du tempo med höjden bakom, puls och kadens på samma tidslinje. Peka i en graf för att läsa av alla på en gång." },
      ],
    }),
  },
];
