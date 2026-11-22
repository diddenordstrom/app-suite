/**
 * Dev-mode demo data: "Bilresa Norge", seven days from the trip notes. Runs only in AUTH_MODE=dev on an empty database,
 * owned by the fake dev user. Positions were looked up for the places that have one fixed point; roads and areas
 * (Ørnevegen, Sognefjellsvegen) stay name-only, which also shows how name-only stops behave.
 */
import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { days, memberships, trips, users } from "./db/schema";
import { randomToken } from "./http";
import { createPackItems, createStop } from "./planStore";
import { PACK_GROUPS, STARTER_PACK } from "../shared/packing";
import type { Category } from "../shared/plan";

type SeedStop = { name: string; lat?: number; lon?: number; note?: string; todos?: [Category, string][] };
type SeedDay = { title: string; stops: SeedStop[]; sleep?: { name: string; lat?: number; lon?: number; note?: string } };

const DEMO: SeedDay[] = [
  {
    title: "Mot Jotunheimen",
    stops: [],
    sleep: { name: "Längs Sognefjellsvegen", note: "Slå läger i dalgången eller uppe på fjället" },
  },
  {
    title: "Lom",
    stops: [
      { name: "Lom stavkyrkje", lat: 61.8395, lon: 8.5658, todos: [["se", "Stavkyrkan"]] },
      { name: "Bakeriet i Lom", todos: [["fika", "Kanelbullar och surdegsbröd"], ["fixa", "Kolla utrustning inför Galdhøpiggen"]] },
    ],
  },
  {
    title: "Galdhøpiggen",
    stops: [
      { name: "Spiterstulen", lat: 61.625, lon: 8.404, note: "Kör upp tidigt", todos: [["fixa", "Parkera"]] },
      { name: "Galdhøpiggen", note: "2 469 möh", todos: [["se", "Normalleden upp och ner"]] },
    ],
  },
  {
    title: "Gamle Strynefjellsvegen",
    stops: [
      { name: "Pollfossen", lat: 61.9602, lon: 7.8958, todos: [["se", "Vattenfallet"]] },
      { name: "Gamle Strynefjellsvegen", note: "Grusväg, stänger tidigare på hösten än andra turistvägar" },
    ],
  },
  {
    title: "Geiranger",
    stops: [
      { name: "Ørnevegen", note: "11 hårnålskurvor ner mot Geirangerfjorden" },
      { name: "Flydalsjuvet", lat: 62.0893, lon: 7.2236, todos: [["se", "Utsikten över fjorden"]] },
    ],
    sleep: { name: "Taktältsplats med fjordutsikt" },
  },
  {
    title: "Trollstigen",
    stops: [
      { name: "Linge ferjekai", lat: 62.2845, lon: 7.1878, todos: [["fixa", "Färjan Linge–Eidsdal"]] },
      { name: "Trollstigen", lat: 62.4611, lon: 7.6724, todos: [["se", "Utsiktsplattformen"]] },
    ],
  },
  {
    title: "Hemfärd",
    stops: [{ name: "Sognefjellsvegen", note: "Fv55 över fjället på vägen hem" }],
  },
];

/** Seed the demo trip when the database has no trips. Returns the trip id, or null when skipped. */
/** Owner of the demo trip: the fake dev user by default, or the demo user in a demo visitor's database. */
type Owner = { sub: string; email: string | null; name: string };
const DEV_USER: Owner = { sub: "dev-user", email: "dev@example.com", name: "Dev User" };

export function seedDemo(db: Db, owner: Owner = DEV_USER): number | null {
  if (db.select({ id: trips.id }).from(trips).limit(1).get()) return null;
  return db.transaction((tx) => {
    const now = Date.now();
    tx.insert(users).values({ ...owner, createdAt: now }).onConflictDoNothing().run();
    const user = tx.select().from(users).where(eq(users.sub, owner.sub)).get()!;
    const trip = tx.insert(trips).values({ name: "Bilresa Norge", inviteCode: randomToken(12), area: "Norge", createdAt: now }).returning().get();
    tx.insert(memberships).values({
      tripId: trip.id, userId: user.id, name: "Admin", role: "admin", token: randomToken(),
      homeLabel: "Jönköping", homeLat: 57.7826, homeLon: 14.1618, createdAt: now,
    }).run();
    DEMO.forEach((d, i) => {
      const day = tx.insert(days).values({
        tripId: trip.id, position: i + 1, title: d.title, createdAt: now,
        sleepName: d.sleep?.name ?? "", sleepLat: d.sleep?.lat ?? null, sleepLon: d.sleep?.lon ?? null, sleepNote: d.sleep?.note ?? "",
      }).returning().get();
      for (const s of d.stops)
        createStop(tx, trip.id, day.id, s, (s.todos ?? []).map(([category, text]) => ({ category, text })));
    });
    createPackItems(tx, trip.id, PACK_GROUPS.flatMap((group) => STARTER_PACK[group].map((text) => ({ group, text }))));
    return trip.id;
  });
}
