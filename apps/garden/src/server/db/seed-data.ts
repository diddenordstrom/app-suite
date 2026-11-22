import type {
  NewCrop,
  NewMacroPreset,
  NewCropFamilyRotation,
  NewFamilyRotationBonus,
} from './schema';

// Nutrition data sourced from Livsmedelsverket (Swedish Food Agency)
// Database: https://soknaringsinnehall.livsmedelsverket.se/
// API: https://dataportal.livsmedelsverket.se/livsmedel/swagger/index.html
// Values are per kg, raw/fresh unless noted. Accessed 2026-03-28.
export const CROPS: NewCrop[] = [
  // Root vegetables
  {
    name: 'Potatis',
    yieldKgPerM2: 4.5,
    kcalPerKg: 810, // SLV #230 Potatis höst rå
    proteinGPerKg: 18,
    carbsGPerKg: 168,
    fatGPerKg: 1,
    category: 'root',
    shelfLifeWeeks: 20,
    defaultConsumeKg: 1.0,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 90,
    cropFamily: 'solanaceae',
    isPerennial: false,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "potato vines" die at 32°F (0°C) — tender; vines die at first frost, tubers tolerate light ground frost
    minTempC: 0,
  },
  {
    name: 'Morötter',
    yieldKgPerM2: 3.5,
    kcalPerKg: 360, // SLV #289 Morot
    proteinGPerKg: 7,
    carbsGPerKg: 66,
    fatGPerKg: 2,
    category: 'root',
    shelfLifeWeeks: 16,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 70,
    cropFamily: 'apiaceae',
    isPerennial: false,
    directSowMonthStart: 5,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "carrots (Danvers, Oxheart)" survive 12°F (-11°C)
    minTempC: -11,
  },
  {
    name: 'Lök',
    yieldKgPerM2: 3.0,
    kcalPerKg: 390, // SLV #344 Lök gul
    proteinGPerKg: 12,
    carbsGPerKg: 73,
    fatGPerKg: 1,
    category: 'root',
    shelfLifeWeeks: 24,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 10,
    directSowOnly: false,
    daysToMaturityFromTransplant: 90,
    cropFamily: 'amaryllidaceae',
    isPerennial: false,
    indoorSowMonthStart: 2,
    indoorSowMonthEnd: 3,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: scallions survive 25°F (-4°C); bulb onions and some multiplier onions 0°F (-18°C).
    // Using -4°C for typical gul lök (bulb onion grown as annual from transplant); overwintering
    // bulb types are hardier but that's a variety-specific exception.
    minTempC: -4,
  },
  {
    name: 'Vitlök',
    yieldKgPerM2: 1.2,
    kcalPerKg: 1280, // SLV #371 Vitlök
    proteinGPerKg: 68,
    carbsGPerKg: 219,
    fatGPerKg: 2,
    category: 'root',
    shelfLifeWeeks: 40,
    defaultConsumeKg: 0.1,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 120,
    cropFamily: 'amaryllidaceae',
    isPerennial: false,
    directSowMonthStart: 9, // Autumn planting (primary method)
    directSowMonthEnd: 10,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "garlic" survives 0°F (-18°C) even with small tops; tops if fairly large survive 5°F (-15°C)
    minTempC: -18,
  },
  {
    name: 'Rödbeta',
    yieldKgPerM2: 3.5,
    kcalPerKg: 510, // SLV #294 Rödbeta
    proteinGPerKg: 12,
    carbsGPerKg: 98,
    fatGPerKg: 1,
    category: 'root',
    shelfLifeWeeks: 16,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'amaranthaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 5,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: Bulls Blood, Chioggia survive 20°F (-7°C); hardier varieties (Albina Verduna, Lutz) to -9.5°C
    // Using -7°C for common varieties.
    minTempC: -7,
  },
  {
    name: 'Palsternacka',
    yieldKgPerM2: 2.5,
    kcalPerKg: 710, // SLV #290 Palsternacka
    proteinGPerKg: 17,
    carbsGPerKg: 126,
    fatGPerKg: 6,
    category: 'root',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 100,
    cropFamily: 'apiaceae',
    isPerennial: false,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "parsnips (probably even colder)" survive 0°F (-18°C) — routinely left in-ground through winter
    minTempC: -18,
  },
  {
    name: 'Färskpotatis',
    yieldKgPerM2: 3.5,
    kcalPerKg: 630, // SLV #4385 Potatis Solist rå
    proteinGPerKg: 10,
    carbsGPerKg: 136,
    fatGPerKg: 1,
    category: 'root',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'solanaceae',
    isPerennial: false,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "potato vines" die at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Rädisa',
    yieldKgPerM2: 3.5,
    kcalPerKg: 110, // SLV #293 Rädisa
    proteinGPerKg: 7,
    carbsGPerKg: 7,
    fatGPerKg: 4,
    category: 'root',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 25,
    cropFamily: 'brassicaceae',
    isPerennial: false,
    directSowMonthStart: 4,
    directSowMonthEnd: 7,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "radishes (Cherry Belle)" survive 20°F (-7°C); winter radish (Daikon) to 10°F (-12°C)
    // Using -7°C for common spring/summer radish varieties.
    minTempC: -7,
  },
  {
    name: 'Rödlök',
    yieldKgPerM2: 3.5,
    kcalPerKg: 460, // SLV #4947 Lök röd
    proteinGPerKg: 12,
    carbsGPerKg: 90,
    fatGPerKg: 1,
    category: 'root',
    shelfLifeWeeks: 24,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 10,
    directSowOnly: false,
    daysToMaturityFromTransplant: 90,
    cropFamily: 'amaryllidaceae',
    isPerennial: false,
    indoorSowMonthStart: 2,
    indoorSowMonthEnd: 3,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: scallions survive -4°C; bulb onions (incl. red onion) -4°C as seedlings grown as annual.
    // Some overwintering bulb onions hardier, but standard red onion grown annually: -4°C.
    minTempC: -4,
  },
  {
    name: 'Purjolök',
    yieldKgPerM2: 3.0,
    kcalPerKg: 300, // SLV #354 Purjolök
    proteinGPerKg: 16,
    carbsGPerKg: 41,
    fatGPerKg: 2,
    category: 'root',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 10,
    directSowOnly: false,
    daysToMaturityFromTransplant: 90,
    cropFamily: 'amaryllidaceae',
    isPerennial: false,
    indoorSowMonthStart: 2,
    indoorSowMonthEnd: 3,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: most fall/summer leeks (Lincoln, King Richard) survive 12°F (-11°C); hardier varieties
    // (Alaska, Durabel, Tadorna) to 0°F (-18°C). Using -11°C for typical varieties.
    minTempC: -11,
  },
  {
    name: 'Selleri',
    yieldKgPerM2: 3.0,
    kcalPerKg: 190, // SLV #321 Stjälkselleri
    proteinGPerKg: 10,
    carbsGPerKg: 23,
    fatGPerKg: 2,
    category: 'root',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 10,
    directSowOnly: false,
    daysToMaturityFromTransplant: 100,
    cropFamily: 'apiaceae',
    isPerennial: false,
    indoorSowMonthStart: 2,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "covered celery (Ventura)" survives 15°F (-9.5°C). Unprotected stalks much less hardy.
    // Using -7°C as a conservative value for typical outdoor celery (celeriac hardier than stalk celery).
    minTempC: -7,
  },
  // Leafy greens
  {
    name: 'Vitkål',
    yieldKgPerM2: 5.0,
    yieldKgPerPlant: 2.0,
    kcalPerKg: 300, // SLV #370 Vitkål
    proteinGPerKg: 11,
    carbsGPerKg: 47,
    fatGPerKg: 1,
    category: 'leafy',
    shelfLifeWeeks: 12,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 6,
    directSowOnly: false,
    daysToMaturityFromTransplant: 70,
    cropFamily: 'brassicaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: many cabbages survive -3°C; some (Kaitlin, Tribute) to -9.5°C; Deadon, Savoy to -12°C.
    // Using -7°C as a mid-range value for common vitkål varieties.
    minTempC: -7,
  },
  {
    name: 'Grönkål',
    yieldKgPerM2: 2.0,
    kcalPerKg: 400, // SLV #337 Grönkål
    proteinGPerKg: 34,
    carbsGPerKg: 32,
    fatGPerKg: 7,
    category: 'leafy',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 5,
    directSowOnly: false,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'brassicaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 5,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: Red/White Russian kales survive 15°F (-9.5°C); Blue Ridge, Winterbor to 5°F (-15°C).
    // Using -9°C for typical non-Russian grönkål (rounded from -9.5°C per BACKLOG-confirmed value).
    minTempC: -9,
  },
  {
    name: 'Spenat',
    yieldKgPerM2: 1.5,
    kcalPerKg: 240, // SLV #4941 Spenat färsk
    proteinGPerKg: 33,
    carbsGPerKg: 8,
    fatGPerKg: 4,
    category: 'leafy',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.1,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 40,
    cropFamily: 'amaranthaceae',
    isPerennial: false,
    directSowMonthStart: 4,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "large leaves of savoyed spinach" survive 10°F (-12°C); some spinach (Bloomsdale Savoy,
    // Long Standing Bloomsdale, Olympia) to 0°F (-18°C). Using -12°C (savoy leaf, typical).
    minTempC: -12,
  },
  {
    name: 'Broccoli',
    yieldKgPerM2: 1.5,
    kcalPerKg: 400, // SLV #325 Broccoli
    proteinGPerKg: 43,
    carbsGPerKg: 23,
    fatGPerKg: 6,
    category: 'leafy',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 5,
    directSowOnly: false,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'brassicaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "broccoli heads" survive 20°F (-7°C); Purple Sprouting broccoli (for spring) to 10°F (-12°C).
    // Using -7°C for common heading broccoli.
    minTempC: -7,
  },
  {
    name: 'Sparris',
    yieldKgPerM2: 0.5,
    kcalPerKg: 220, // SLV #5861 Sparris grön (kokt; no raw entry)
    proteinGPerKg: 19,
    carbsGPerKg: 18,
    fatGPerKg: 2,
    category: 'leafy',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'asparagaceae',
    isPerennial: true,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // no sourced cold-hardiness value for emerged spears — roots are very hardy (to -20°C or colder)
    // but the emerged tips are tender to frost. Perennial — excluded from suggestion engine regardless.
    // Defaults to 0 (tender shoot classification).
    minTempC: 0,
  },
  {
    name: 'Sallat',
    yieldKgPerM2: 2.0,
    kcalPerKg: 140, // SLV #340 Isbergssallat
    proteinGPerKg: 8,
    carbsGPerKg: 25,
    fatGPerKg: 1,
    category: 'leafy',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.1,
    weeksToTransplant: 3,
    directSowOnly: false,
    daysToMaturityFromTransplant: 45,
    cropFamily: 'asteraceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 5,
    directSowMonthStart: 4,
    directSowMonthEnd: 7,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "large leaves of lettuce" survive 22°F (-6°C); hearts and small plants hardier.
    // Using -6°C (large-leaf stage = most common harvest state).
    minTempC: -6,
  },
  // Legumes
  {
    name: 'Ärtor',
    yieldKgPerM2: 0.8,
    kcalPerKg: 720, // SLV Gröna ärtor färska
    proteinGPerKg: 54,
    carbsGPerKg: 88,
    fatGPerKg: 4,
    category: 'legume',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.2,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 65,
    cropFamily: 'fabaceae',
    isPerennial: false,
    directSowMonthStart: 4,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "Canadian (spring) field peas are hardy to 10–20°F (-12 to -7°C)".
    // Using -3°C for common edible garden peas (more conservative than field-pea cover crops).
    // Cross-ref: Botanical Interests https://www.botanicalinterests.com/community/blog/frost-tolerance-of-vegetables/
    // lists peas as tolerating light frost (around -3°C for seedlings).
    minTempC: -3,
  },
  {
    name: 'Bönor',
    yieldKgPerM2: 0.7,
    kcalPerKg: 3170, // SLV #875 Bruna bönor torkade
    proteinGPerKg: 220,
    carbsGPerKg: 451,
    fatGPerKg: 15,
    category: 'legume',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.2,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'fabaceae',
    isPerennial: false,
    indoorSowMonthStart: 4,
    indoorSowMonthEnd: 5,
    directSowMonthStart: 5,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "bush beans" listed at 32°F (0°C) — tender; killed by first frost.
    minTempC: 0,
  },
  // Fruits
  {
    name: 'Pumpa',
    yieldKgPerM2: 4.0,
    kcalPerKg: 260, // SLV #353 Pumpa
    proteinGPerKg: 10,
    carbsGPerKg: 44,
    fatGPerKg: 1,
    category: 'fruit',
    shelfLifeWeeks: 16,
    defaultConsumeKg: 1.0,
    weeksToTransplant: 3,
    directSowOnly: false,
    daysToMaturityFromTransplant: 90,
    cropFamily: 'cucurbitaceae',
    isPerennial: false,
    indoorSowMonthStart: 4,
    indoorSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "squash vines" (Cucurbitaceae) die at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Körsbärstomat',
    yieldKgPerM2: 6.0,
    yieldKgPerPlant: 4.0,
    kcalPerKg: 250, // SLV #4937 Tomat körsbärstomat röd
    proteinGPerKg: 8,
    carbsGPerKg: 44,
    fatGPerKg: 1,
    category: 'fruit',
    shelfLifeWeeks: 2,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 8,
    directSowOnly: false,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'solanaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "tomatoes" die at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Bifftomater',
    yieldKgPerM2: 4.0,
    yieldKgPerPlant: 3.0,
    kcalPerKg: 180, // SLV #364 Tomat
    proteinGPerKg: 8,
    carbsGPerKg: 26,
    fatGPerKg: 1,
    category: 'fruit',
    shelfLifeWeeks: 2,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 8,
    directSowOnly: false,
    daysToMaturityFromTransplant: 70,
    cropFamily: 'solanaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "tomatoes" die at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Chili',
    yieldKgPerM2: 1.0,
    yieldKgPerPlant: 0.5,
    kcalPerKg: 490, // SLV #380 Chilipeppar färsk
    proteinGPerKg: 24,
    carbsGPerKg: 59,
    fatGPerKg: 7,
    category: 'fruit',
    shelfLifeWeeks: 2,
    defaultConsumeKg: 0.2,
    weeksToTransplant: 10,
    directSowOnly: false,
    daysToMaturityFromTransplant: 80,
    cropFamily: 'solanaceae',
    isPerennial: false,
    indoorSowMonthStart: 1,
    indoorSowMonthEnd: 2,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "peppers" die at 32°F (0°C) — tender (same category as tomatoes in Solanaceae)
    minTempC: 0,
  },
  {
    name: 'Paprika',
    yieldKgPerM2: 2.0,
    yieldKgPerPlant: 1.0,
    kcalPerKg: 220, // SLV #351 Paprika röd
    proteinGPerKg: 5,
    carbsGPerKg: 41,
    fatGPerKg: 2,
    category: 'fruit',
    shelfLifeWeeks: 2,
    defaultConsumeKg: 0.2,
    weeksToTransplant: 10,
    directSowOnly: false,
    daysToMaturityFromTransplant: 75,
    cropFamily: 'solanaceae',
    isPerennial: false,
    indoorSowMonthStart: 2,
    indoorSowMonthEnd: 3,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "peppers" die at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Squash',
    yieldKgPerM2: 5.0,
    yieldKgPerPlant: 6.0,
    kcalPerKg: 170, // SLV #362 Squash
    proteinGPerKg: 12,
    carbsGPerKg: 22,
    fatGPerKg: 1,
    category: 'fruit',
    shelfLifeWeeks: 8,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 3,
    directSowOnly: false,
    daysToMaturityFromTransplant: 50,
    cropFamily: 'cucurbitaceae',
    isPerennial: false,
    indoorSowMonthStart: 5,
    indoorSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "squash vines" die at 32°F (0°C) — tender; Cucurbitaceae are not frost-hardy
    minTempC: 0,
  },
  {
    name: 'Tomat',
    yieldKgPerM2: 8.0,
    yieldKgPerPlant: 3.0,
    kcalPerKg: 180, // SLV #364 Tomat
    proteinGPerKg: 8,
    carbsGPerKg: 26,
    fatGPerKg: 1,
    category: 'fruit',
    shelfLifeWeeks: 2,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 8,
    directSowOnly: false,
    daysToMaturityFromTransplant: 65,
    cropFamily: 'solanaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "tomatoes" die at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Gurka',
    yieldKgPerM2: 7.0,
    yieldKgPerPlant: 5.0,
    kcalPerKg: 130, // SLV #339 Gurka
    proteinGPerKg: 8,
    carbsGPerKg: 23,
    fatGPerKg: 1,
    category: 'fruit',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 3,
    directSowOnly: false,
    daysToMaturityFromTransplant: 55,
    cropFamily: 'cucurbitaceae',
    isPerennial: false,
    indoorSowMonthStart: 5,
    indoorSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "cucumbers" die at 32°F (0°C) — tender; Cucurbitaceae are not frost-hardy
    minTempC: 0,
  },
  {
    name: 'Jordgubbe',
    yieldKgPerM2: 0.7,
    yieldKgPerPlant: 0.3,
    kcalPerKg: 410, // SLV #526 Jordgubbar
    proteinGPerKg: 5,
    carbsGPerKg: 83,
    fatGPerKg: 2,
    category: 'fruit',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.2,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'rosaceae',
    isPerennial: true,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // Perennial — excluded from suggestion engine. Crown is cold-hardy (-15°C or colder with mulch)
    // but the emerging fruit trusses are frost-sensitive (0°C). Defaults to 0 (fruit/flower stage).
    // no sourced cold-hardiness value for harvested-fruit stage — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  {
    name: 'Smultron',
    yieldKgPerM2: 0.3,
    yieldKgPerPlant: 0.1,
    kcalPerKg: 320, // Proxy: SLV #526 Jordgubbar (smultron not in SLV)
    proteinGPerKg: 7,
    carbsGPerKg: 77,
    fatGPerKg: 3,
    category: 'fruit',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'rosaceae',
    isPerennial: true,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 5,
    directSowMonthStart: 4,
    directSowMonthEnd: 6,
    // Perennial wild strawberry — excluded from suggestion engine.
    // no sourced cold-hardiness value — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  {
    name: 'Björnbär',
    yieldKgPerM2: 2.0,
    kcalPerKg: 430, // SLV #554 Björnbär
    proteinGPerKg: 11,
    carbsGPerKg: 75,
    fatGPerKg: 2,
    category: 'fruit',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'rosaceae',
    isPerennial: true,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // Perennial — excluded from suggestion engine.
    // no sourced cold-hardiness value — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  {
    name: 'Hallon',
    yieldKgPerM2: 1.5,
    kcalPerKg: 340, // SLV #523 Hallon
    proteinGPerKg: 12,
    carbsGPerKg: 41,
    fatGPerKg: 6,
    category: 'fruit',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'rosaceae',
    isPerennial: true,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // Perennial — excluded from suggestion engine.
    // no sourced cold-hardiness value — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  {
    name: 'Vattenmelon',
    yieldKgPerM2: 3.0,
    yieldKgPerPlant: 5.0,
    kcalPerKg: 340, // SLV #549 Vattenmelon
    proteinGPerKg: 6,
    carbsGPerKg: 75,
    fatGPerKg: 0,
    category: 'fruit',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 4,
    directSowOnly: false,
    daysToMaturityFromTransplant: 80,
    cropFamily: 'cucurbitaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "melons" die at 32°F (0°C) — tender; Cucurbitaceae not frost-hardy
    minTempC: 0,
  },
  {
    name: 'Äpple',
    yieldKgPerM2: 3.0,
    kcalPerKg: 480, // SLV #588 Äpple m. skal
    proteinGPerKg: 0,
    carbsGPerKg: 106,
    fatGPerKg: 0,
    category: 'fruit',
    shelfLifeWeeks: 16,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'rosaceae',
    isPerennial: true,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // Perennial tree — excluded from suggestion engine.
    // no sourced cold-hardiness value — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  {
    name: 'Rabarber',
    yieldKgPerM2: 3.5,
    yieldKgPerPlant: 2.0,
    kcalPerKg: 190, // SLV Rabarber rå (2015)
    proteinGPerKg: 9,
    carbsGPerKg: 27,
    fatGPerKg: 2,
    category: 'fruit',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: null,
    cropFamily: 'polygonaceae',
    isPerennial: true,
    indoorSowMonthStart: 4,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 4,
    directSowMonthEnd: 6,
    // Perennial — excluded from suggestion engine. Crown is very cold-hardy (zone 3, to -40°C);
    // emerged stalks are frost-sensitive (~-2°C). Defaults to 0 (tender stalk stage).
    // no sourced cold-hardiness value for stalk stage — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  // Companion plants
  {
    name: 'Ringblomma',
    yieldKgPerM2: 0.1,
    kcalPerKg: 400, // Not in SLV; edible flower estimate
    proteinGPerKg: 20,
    carbsGPerKg: 80,
    fatGPerKg: 0,
    category: 'leafy',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 4,
    directSowOnly: false,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'asteraceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 4,
    directSowMonthEnd: 6,
    // source: https://www.botanicalinterests.com/community/blog/frost-tolerance-of-vegetables/
    // Calendula tolerates light frost but not hard freezes; typically damaged below -2°C to -3°C.
    // no sourced kill-temperature from SMF (SMF covers vegetables, not flowers) — using -3°C conservatively.
    minTempC: -3,
  },
  // Grains & seeds
  {
    name: 'Majs',
    yieldKgPerM2: 0.6,
    yieldKgPerPlant: 0.3,
    kcalPerKg: 1250, // SLV #345 Majskolv
    proteinGPerKg: 39,
    carbsGPerKg: 221,
    fatGPerKg: 16,
    category: 'grain',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 3,
    directSowOnly: false,
    daysToMaturityFromTransplant: 70,
    cropFamily: 'poaceae',
    isPerennial: false,
    indoorSowMonthStart: 4,
    indoorSowMonthEnd: 5,
    directSowMonthStart: 5,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "corn" dies at 32°F (0°C) — tender
    minTempC: 0,
  },
  {
    name: 'Solros',
    yieldKgPerM2: 0.1,
    yieldKgPerPlant: 0.1,
    kcalPerKg: 6180, // SLV #1574 Solrosfrö
    proteinGPerKg: 206,
    carbsGPerKg: 39,
    fatGPerKg: 561,
    category: 'grain',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 3,
    directSowOnly: false,
    daysToMaturityFromTransplant: 70,
    cropFamily: 'asteraceae',
    isPerennial: false,
    indoorSowMonthStart: 4,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 5,
    directSowMonthEnd: 6,
    // no sourced cold-hardiness value from SMF — sunflower seedlings tolerate light frost (~-2°C)
    // but mature plants with developing heads are killed by frost. Defaults to 0 (tender or unknown).
    minTempC: 0,
  },
  {
    name: 'Råg',
    yieldKgPerM2: 0.4,
    kcalPerKg: 3250, // SLV #1934 Rågmjöl fullkorn
    proteinGPerKg: 81,
    carbsGPerKg: 593,
    fatGPerKg: 17,
    category: 'grain',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 120,
    cropFamily: 'poaceae',
    isPerennial: false,
    directSowMonthStart: 8,
    directSowMonthEnd: 9,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "winter rye (cover crop)" survives -40°F (-40°C) — extremely cold-hardy winter grain.
    // Using -20°C as a practical minimum for vegetable-scale winter rye in Sweden.
    minTempC: -20,
  },
  {
    name: 'Vete',
    yieldKgPerM2: 0.5,
    kcalPerKg: 3360, // SLV #1935 Vetemjöl fullkorn
    proteinGPerKg: 107,
    carbsGPerKg: 610,
    fatGPerKg: 20,
    category: 'grain',
    shelfLifeWeeks: 4,
    defaultConsumeKg: 0.3,
    weeksToTransplant: 0,
    directSowOnly: true,
    daysToMaturityFromTransplant: 120,
    cropFamily: 'poaceae',
    isPerennial: false,
    directSowMonthStart: 8,
    directSowMonthEnd: 9,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "winter wheat (cover crop)" survives -40°F (-40°C) — extremely cold-hardy winter grain.
    // Using -20°C as a practical minimum for vegetable-scale winter wheat in Sweden.
    minTempC: -20,
  },
  // Herbs — high-leverage for companion planting (basilika ↔ tomat, dill ↔ kål,
  // gräslök repels morotsflugor, persilja attracts beneficials).
  {
    name: 'Basilika',
    yieldKgPerM2: 0.4,
    yieldKgPerPlant: 0.05,
    kcalPerKg: 230, // SLV Basilika, färsk
    proteinGPerKg: 32,
    carbsGPerKg: 27,
    fatGPerKg: 6,
    category: 'leafy',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.02,
    weeksToTransplant: 6,
    directSowOnly: false,
    daysToMaturityFromTransplant: 60,
    cropFamily: 'lamiaceae',
    isPerennial: false,
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF does not list basil explicitly; basil is well-known as one of the most frost-sensitive herbs.
    // Killed by first frost (0°C); chilling injury can occur even above 0°C.
    // Cross-ref: Botanical Interests https://www.botanicalinterests.com/community/blog/frost-tolerance-of-vegetables/
    minTempC: 0,
  },
  {
    name: 'Dill',
    yieldKgPerM2: 0.3,
    kcalPerKg: 430, // SLV Dill, färsk
    proteinGPerKg: 35,
    carbsGPerKg: 70,
    fatGPerKg: 11,
    category: 'leafy',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.03,
    weeksToTransplant: 0,
    directSowOnly: true, // dill resents transplanting — long taproot
    daysToMaturityFromTransplant: 50,
    cropFamily: 'apiaceae',
    isPerennial: false,
    directSowMonthStart: 5,
    directSowMonthEnd: 7,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "dill (Fernleaf)" listed at 25°F (-4°C). Mature dill foliage is somewhat frost-hardy;
    // seedlings and flowers are less tolerant. Using -4°C (Fernleaf variety per SMF).
    minTempC: -4,
  },
  {
    name: 'Persilja',
    yieldKgPerM2: 0.5,
    yieldKgPerPlant: 0.05,
    kcalPerKg: 320, // SLV Persilja, färsk
    proteinGPerKg: 30,
    carbsGPerKg: 64,
    fatGPerKg: 8,
    category: 'leafy',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.03,
    weeksToTransplant: 8,
    directSowOnly: false,
    daysToMaturityFromTransplant: 70,
    cropFamily: 'apiaceae',
    isPerennial: false, // biennial; grown as annual
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 4,
    directSowMonthEnd: 6,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "flat leaf parsley" survives 20°F (-7°C); "curly leaf parsley" survives 15°F (-9.5°C).
    // Using -7°C (flat-leaf is most commonly grown; curly-leaf is hardier but less common).
    minTempC: -7,
  },
  {
    name: 'Gräslök',
    yieldKgPerM2: 0.6,
    yieldKgPerPlant: 0.05,
    kcalPerKg: 320, // SLV Gräslök, färsk
    proteinGPerKg: 36,
    carbsGPerKg: 47,
    fatGPerKg: 7,
    category: 'leafy',
    shelfLifeWeeks: 1,
    defaultConsumeKg: 0.02,
    weeksToTransplant: 8,
    directSowOnly: false,
    daysToMaturityFromTransplant: 80,
    cropFamily: 'alliaceae',
    isPerennial: true, // returns every spring once established
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 4,
    directSowMonthEnd: 5,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "chives" survive 0°F (-18°C) — listed at the hardiest tier alongside garlic and mâche.
    // Perennial, so excluded from the suggestion engine regardless.
    minTempC: -18,
  },
  // Sötpotatis — marginal at Nordic latitudes; needs warm season + raised bed
  // + black mulch. Start slips indoors early; never direct sow.
  {
    name: 'Sötpotatis',
    yieldKgPerM2: 2.5,
    yieldKgPerPlant: 0.8,
    kcalPerKg: 860, // SLV Sötpotatis, rå
    proteinGPerKg: 16,
    carbsGPerKg: 200,
    fatGPerKg: 1,
    category: 'root',
    shelfLifeWeeks: 12,
    defaultConsumeKg: 0.5,
    weeksToTransplant: 6,
    directSowOnly: false,
    daysToMaturityFromTransplant: 120,
    cropFamily: 'convolvulaceae',
    isPerennial: false, // annual at Nordic latitudes
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 3,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "sweet potato vines" die at 32°F (0°C) — tender; even more cold-sensitive than regular potato
    minTempC: 0,
  },
  {
    name: 'Mangold',
    yieldKgPerM2: 2.5,
    yieldKgPerPlant: 0.4,
    kcalPerKg: 190, // SLV Mangold, rå
    proteinGPerKg: 18,
    carbsGPerKg: 39,
    fatGPerKg: 2,
    category: 'leafy',
    shelfLifeWeeks: 2,
    defaultConsumeKg: 0.2,
    weeksToTransplant: 4,
    directSowOnly: false,
    daysToMaturityFromTransplant: 55,
    cropFamily: 'amaranthaceae', // same family as rödbeta and spenat
    isPerennial: false, // biennial; grown as annual cut-and-come-again
    indoorSowMonthStart: 3,
    indoorSowMonthEnd: 4,
    directSowMonthStart: 4,
    directSowMonthEnd: 7,
    // source: https://www.sustainablemarketfarming.com/2021/04/14/winter-kill-temperatures-of-cold-hardy-vegetables-2021/
    // SMF: "Bright Lights chard" survives 22°F (-6°C); "red chard" to 15°F (-9.5°C);
    // "green chard" (hardiest) to 10°F (-12°C). Mangold = Swiss chard; using -9°C for red chard
    // (most common mangold variety in Sweden; rounded from -9.5°C per BACKLOG-confirmed value).
    minTempC: -9,
  },
  {
    name: 'Svarta vinbär',
    yieldKgPerM2: 2.5,
    yieldKgPerPlant: 3.0, // mature bush at peak
    kcalPerKg: 630, // SLV Vinbär, svarta, råa
    proteinGPerKg: 14,
    carbsGPerKg: 152,
    fatGPerKg: 4,
    category: 'fruit',
    shelfLifeWeeks: 1, // fresh; effectively indefinite frozen
    defaultConsumeKg: 0.2,
    weeksToTransplant: 0,
    directSowOnly: true, // planted as bare-root cuttings or young bushes
    daysToMaturityFromTransplant: null, // takes 2-3 years to produce
    cropFamily: 'grossulariaceae',
    isPerennial: true,
    directSowMonthStart: 3,
    directSowMonthEnd: 4,
    // Perennial — excluded from suggestion engine. Blackcurrant is very cold-hardy (zones 3–4),
    // but the flowers are frost-sensitive (~-2°C to -4°C) and risk spring frosts.
    // no sourced cold-hardiness value for the fruiting stage — defaults to 0 (tender or unknown)
    minTempC: 0,
  },
  {
    name: 'Röda vinbär',
    yieldKgPerM2: 2.0, // slightly less productive per area than blackcurrant
    yieldKgPerPlant: 2.5, // mature bush at peak (RHS: 4-5 kg per established bush over a season; conservative mid-range)
    kcalPerKg: 560, // SLV Vinbär, röda, råa (~56 kcal/100g — lower than blackcurrant)
    proteinGPerKg: 14,
    carbsGPerKg: 138,
    fatGPerKg: 2,
    category: 'fruit',
    shelfLifeWeeks: 1, // fresh; effectively indefinite frozen
    defaultConsumeKg: 0.2,
    weeksToTransplant: 0,
    directSowOnly: true, // planted as bare-root cuttings or young bushes
    daysToMaturityFromTransplant: null, // takes 2-3 years to produce
    cropFamily: 'grossulariaceae',
    isPerennial: true,
    directSowMonthStart: 3,
    directSowMonthEnd: 4,
    // Perennial — excluded from suggestion engine. Redcurrant is very cold-hardy (zones 3–5),
    // flowers later than blackcurrant so slightly less spring-frost exposed, but the fruiting
    // stage still has no sourced cold-hardiness value — defaults to 0 (tender or unknown).
    minTempC: 0,
  },
];

// Nordic dietary guidelines: ~50% carbs, ~15% protein, ~30% fat
export const MACRO_PRESETS: NewMacroPreset[] = [
  {
    name: 'Stillasittande',
    kcalPerPerson: 2000,
    proteinG: 75,
    carbsG: 250,
    fatG: 70,
    activityLevel: 'sedentary',
  },
  {
    name: 'Måttligt aktiv',
    kcalPerPerson: 2500,
    proteinG: 95,
    carbsG: 310,
    fatG: 85,
    activityLevel: 'moderate',
  },
  {
    name: 'Aktiv',
    kcalPerPerson: 3000,
    proteinG: 115,
    carbsG: 375,
    fatG: 100,
    activityLevel: 'active',
  },
];

// Companion-planting pair data. Each entry must cite a verifiable source
// (RHS, Cornell Cooperative Extension, SLU, Hushållningssällskapet, or a
// peer-reviewed study). evidenceLevel = 'strong' for peer-reviewed or
// extension-service backed claims; 'traditional' for long-established
// practice in reputable gardening references with mixed or limited
// experimental data. Folklore-only claims are excluded.
//
// Pairs are stored canonically (smaller crop id first) by the service layer
// — here we list them by name in any order and the seed resolves IDs.

export interface CompanionSeed {
  cropAName: string;
  cropBName: string;
  relationship: 'good' | 'bad';
  evidenceLevel: 'strong' | 'traditional';
  source: string;
  note?: string;
}

const RHS_COMPANION = 'https://www.rhs.org.uk/prevention-protection/companion-planting';
const RHS_CARROT_FLY = 'https://www.rhs.org.uk/biodiversity/carrot-fly';
const CORNELL_HOME = 'https://gardening.cce.cornell.edu/vegetables/';
const CORNELL_THREE_SISTERS = 'https://gardening.cce.cornell.edu/2020/06/15/three-sisters/';
const RHS_TOMATO_BLIGHT = 'https://www.rhs.org.uk/disease/potato-and-tomato-blight';
const RHS_ALLIUM_LEGUME = 'https://www.rhs.org.uk/vegetables/onions/grow-your-own';

export const COMPANION_PAIRS: CompanionSeed[] = [
  // ───── TOMAT ─────
  {
    cropAName: 'Tomat',
    cropBName: 'Basilika',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Basilika antyds dofta bort skadeinsekter och gynna pollinatörer.',
  },
  {
    cropAName: 'Tomat',
    cropBName: 'Gräslök',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Lökväxter avskräcker bladlöss och vita flugor.',
  },
  {
    cropAName: 'Tomat',
    cropBName: 'Persilja',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Lockar nyttoinsekter (parasitsteklar).',
  },
  {
    cropAName: 'Tomat',
    cropBName: 'Morötter',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Olika rotzondjup — morötterna under, tomaten ovan.',
  },
  {
    cropAName: 'Tomat',
    cropBName: 'Ringblomma',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Lockar nyttoinsekter och rovsteklar.',
  },
  {
    cropAName: 'Tomat',
    cropBName: 'Potatis',
    relationship: 'bad',
    evidenceLevel: 'strong',
    source: RHS_TOMATO_BLIGHT,
    note: 'Båda är Solanaceae och delar potatisbladmögel (Phytophthora infestans).',
  },
  {
    cropAName: 'Tomat',
    cropBName: 'Vitkål',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Konkurrerar om kväve; kålväxter hämmar tomatens tillväxt.',
  },

  // ───── MOROT (Apiaceae) ─────
  {
    cropAName: 'Morötter',
    cropBName: 'Lök',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_CARROT_FLY,
    note: 'Löklukten maskerar morotens doft för morotsflugan.',
  },
  {
    cropAName: 'Morötter',
    cropBName: 'Vitlök',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_CARROT_FLY,
  },
  {
    cropAName: 'Morötter',
    cropBName: 'Gräslök',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_CARROT_FLY,
  },
  {
    cropAName: 'Morötter',
    cropBName: 'Sallat',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Sallat skuggar morotsplantans krona och håller jorden fuktig.',
  },
  {
    cropAName: 'Morötter',
    cropBName: 'Ärtor',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Ärtorna kvävefixerar och hjälper morötternas tillväxt.',
  },
  {
    cropAName: 'Morötter',
    cropBName: 'Rödbeta',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Olika rotzondjup — minimal konkurrens.',
  },

  // ───── POTATIS ─────
  {
    cropAName: 'Potatis',
    cropBName: 'Bönor',
    relationship: 'good',
    evidenceLevel: 'strong',
    source: CORNELL_THREE_SISTERS,
    note: 'Bönornas kvävefixering gynnar potatisens tillväxt.',
  },
  {
    cropAName: 'Potatis',
    cropBName: 'Vitlök',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Lökväxter avskräcker vissa skadeinsekter.',
  },
  {
    cropAName: 'Potatis',
    cropBName: 'Ringblomma',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Ringblomma lockar nyttoinsekter och förmodas avskräcka nematoder.',
  },
  {
    cropAName: 'Potatis',
    cropBName: 'Squash',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Båda är stora vattenförbrukare och konkurrerar om markens näring.',
  },
  {
    cropAName: 'Potatis',
    cropBName: 'Gurka',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Konkurrerar om vatten och näring.',
  },

  // ───── LÖKVÄXTER × BALJVÄXTER (bad) ─────
  {
    cropAName: 'Lök',
    cropBName: 'Bönor',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: RHS_ALLIUM_LEGUME,
    note: 'Lökväxter hämmar baljväxters kvävefixerande bakterier.',
  },
  {
    cropAName: 'Lök',
    cropBName: 'Ärtor',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: RHS_ALLIUM_LEGUME,
  },
  {
    cropAName: 'Vitlök',
    cropBName: 'Bönor',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: RHS_ALLIUM_LEGUME,
  },
  {
    cropAName: 'Vitlök',
    cropBName: 'Ärtor',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: RHS_ALLIUM_LEGUME,
  },

  // ───── LÖK / VITLÖK / GRÄSLÖK ─────
  {
    cropAName: 'Lök',
    cropBName: 'Sallat',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },
  {
    cropAName: 'Vitlök',
    cropBName: 'Jordgubbe',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Lökväxter avskräcker skadeinsekter och förebygger svampsjukdomar.',
  },
  {
    cropAName: 'Lök',
    cropBName: 'Jordgubbe',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },
  {
    cropAName: 'Gräslök',
    cropBName: 'Jordgubbe',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },
  {
    cropAName: 'Gräslök',
    cropBName: 'Äpple',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Som underplantering vid äppelträd — avskräcker bladlöss och svamp.',
  },

  // ───── SALLAT ─────
  {
    cropAName: 'Sallat',
    cropBName: 'Rädisa',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Rädisor markerar rader och luckrar jorden snabbt.',
  },
  {
    cropAName: 'Sallat',
    cropBName: 'Jordgubbe',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
  },

  // ───── GURKA ─────
  {
    cropAName: 'Gurka',
    cropBName: 'Bönor',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Bönor ger struktur att klättra på och kvävefixerar.',
  },
  {
    cropAName: 'Gurka',
    cropBName: 'Majs',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Majsen ger vertikal struktur och skugga.',
  },
  {
    cropAName: 'Gurka',
    cropBName: 'Dill',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Dill lockar pollinatörer och parasitsteklar.',
  },

  // ───── THREE SISTERS — Bönor + Majs + Squash/Pumpa ─────
  {
    cropAName: 'Bönor',
    cropBName: 'Majs',
    relationship: 'good',
    evidenceLevel: 'strong',
    source: CORNELL_THREE_SISTERS,
    note: 'Three Sisters: bönor kvävefixerar; majsen ger struktur.',
  },
  {
    cropAName: 'Bönor',
    cropBName: 'Squash',
    relationship: 'good',
    evidenceLevel: 'strong',
    source: CORNELL_THREE_SISTERS,
    note: 'Three Sisters: squashens blad skuggar och håller fukt.',
  },
  {
    cropAName: 'Majs',
    cropBName: 'Squash',
    relationship: 'good',
    evidenceLevel: 'strong',
    source: CORNELL_THREE_SISTERS,
  },
  {
    cropAName: 'Bönor',
    cropBName: 'Pumpa',
    relationship: 'good',
    evidenceLevel: 'strong',
    source: CORNELL_THREE_SISTERS,
  },
  {
    cropAName: 'Majs',
    cropBName: 'Pumpa',
    relationship: 'good',
    evidenceLevel: 'strong',
    source: CORNELL_THREE_SISTERS,
  },

  // ───── BASILIKA / DILL ─────
  {
    cropAName: 'Basilika',
    cropBName: 'Paprika',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Solanaceae-släktingar med liknande växtkrav.',
  },
  {
    cropAName: 'Dill',
    cropBName: 'Vitkål',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Dill lockar parasitsteklar som tar kålfjärilslarver.',
  },
  {
    cropAName: 'Dill',
    cropBName: 'Grönkål',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },
  {
    cropAName: 'Dill',
    cropBName: 'Broccoli',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },

  // ───── MANGOLD ─────
  {
    cropAName: 'Mangold',
    cropBName: 'Bönor',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Bönornas kvävefixering gynnar mangolds bladtillväxt.',
  },
  {
    cropAName: 'Mangold',
    cropBName: 'Sallat',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
  },

  // ───── RINGBLOMMA × KÅL ─────
  {
    cropAName: 'Ringblomma',
    cropBName: 'Vitkål',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
    note: 'Förvirrar kålfjärilen och lockar nyttoinsekter.',
  },
  {
    cropAName: 'Ringblomma',
    cropBName: 'Grönkål',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },
  {
    cropAName: 'Ringblomma',
    cropBName: 'Broccoli',
    relationship: 'good',
    evidenceLevel: 'traditional',
    source: RHS_COMPANION,
  },

  // ───── JORDGUBBE × KÅL (bad) ─────
  {
    cropAName: 'Jordgubbe',
    cropBName: 'Vitkål',
    relationship: 'bad',
    evidenceLevel: 'traditional',
    source: CORNELL_HOME,
    note: 'Kålväxter konkurrerar om näring och kan locka skadeinsekter till jordgubbsraden.',
  },
];

// ─── Source URL constants for family rotation seed data ───────────────────────
// Every row cites a URL from family-rotation-research.md §7.

// Jordbruksverket: 6-year minimum for Brassicaceae (clubroot / Plasmodiophora brassicae)
const JBV_BRASSICACEAE =
  'https://www2.jordbruksverket.se/webdav/files/SJV/trycksaker/Pdf_ovrigt/p7_7.pdf';
// RHS: white rot sclerotia persist 20–40 years; soft-penalty framing is more honest
const RHS_WHITE_ROT = 'https://www.rhs.org.uk/disease/onion-white-rot';
// NC State Extension: Verticillium dahliae persists 7–14 years; 4-year exclusion
const NCSTATE_VERTICILLIUM =
  'https://content.ces.ncsu.edu/verticillium-wilt-of-tomato-and-eggplant';
// PNW Pest Handbooks: Fusarium 4–5 year rotation recommendation for cucurbits
const PNW_CUCURBIT =
  'https://pnwhandbooks.org/plantdisease/host-disease/onion-allium-cepa-white-rot';
// Missouri IPM: Sclerotinia sclerotia persist 3–5 years; covers Apiaceae and Asteraceae
const MISSOURI_SCLEROTINIA =
  'https://ipm.missouri.edu/MEG/2016/2/Monitoring-Detection-and-Management-of-Lettuce-Drop-caused-by-Sclerotinia-spp/';
// Cornell CCE: Cercospora beticola persists "up to 3 years" in plant debris
const CORNELL_CERCOSPORA =
  'https://www.vegetables.cornell.edu/pest-management/disease-factsheets/cercospora-leaf-spot-of-table-beet/';
// NDSU: 6-year minimum pea/lentil rotation; Aphanomyces euteiches oospores 10+ years
const NDSU_FABACEAE =
  'https://www.ag.ndsu.edu/publications/crops/dry-pea-and-lentil-root-rot-management-guide';
// UMN Extension: corn smut spores persist up to 4 years in soil
const UMN_POACEAE = 'https://extension.umn.edu/corn-pest-management/common-smut-corn';
// Frontiers in Sustainable Food Systems: N-fixation quantification (peas 36–125 kg N/ha)
const FRONTIERS_NFIX =
  'https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2021.767998/full';
// Assaduzzaman & Asao 2011: autotoxicity in beans (pod numbers drop to 49–67%)
const AUTOTOXICITY = 'https://www.sciencedirect.com/science/article/abs/pii/S0304423811006315';

// ─── Crop-family rotation rules (9 rows) ─────────────────────────────────────
// Values locked by family-rotation-research.md §6.
// exclusionYears: hard cutoff (candidate dropped from ranking entirely if bed
//   was used for this family within N years). 0 = soft-penalty only.
// penaltyYears: soft window for score adjustment (+25 pp). 0 = hard-only.

export const FAMILY_ROTATION_RULES: NewCropFamilyRotation[] = [
  {
    family: 'Brassicaceae',
    exclusionYears: 6,
    penaltyYears: 0,
    source: JBV_BRASSICACEAE,
    sourceNote: 'Clubroot persistence',
  },
  {
    family: 'Alliaceae',
    exclusionYears: 0,
    penaltyYears: 4,
    source: RHS_WHITE_ROT,
    sourceNote: 'White rot persistence',
  },
  {
    family: 'Solanaceae',
    exclusionYears: 4,
    penaltyYears: 0,
    source: NCSTATE_VERTICILLIUM,
    sourceNote: 'Verticillium wilt',
  },
  {
    family: 'Cucurbitaceae',
    exclusionYears: 0,
    penaltyYears: 3,
    source: PNW_CUCURBIT,
  },
  {
    family: 'Apiaceae',
    exclusionYears: 0,
    penaltyYears: 2,
    source: MISSOURI_SCLEROTINIA,
  },
  {
    family: 'Chenopodiaceae',
    exclusionYears: 0,
    penaltyYears: 3,
    source: CORNELL_CERCOSPORA,
    sourceNote: 'Cercospora leaf spot',
  },
  {
    family: 'Fabaceae',
    exclusionYears: 0,
    penaltyYears: 4,
    source: NDSU_FABACEAE,
    sourceNote: 'Aphanomyces root rot',
  },
  {
    family: 'Asteraceae',
    exclusionYears: 0,
    penaltyYears: 2,
    source: MISSOURI_SCLEROTINIA,
  },
  {
    family: 'Poaceae',
    exclusionYears: 0,
    penaltyYears: 2,
    source: UMN_POACEAE,
    sourceNote: 'Corn smut',
  },
];

// ─── Legume-predecessor bonus rows (7 rows) ───────────────────────────────────
// bonusScore < 0: ranks successor higher (benefit).
// bonusScore > 0: ranks successor lower (penalty — autotoxicity).
// Absence of a row = no bonus (Apiaceae, Alliaceae explicitly excluded per
//   research doc §4.2: forked-root risk + low N demand).

export const FAMILY_ROTATION_BONUSES: NewFamilyRotationBonus[] = [
  // Top-tier N-demand successors (−15 pp, matches COMPANION_GOOD_DELTA)
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Brassicaceae',
    bonusScore: -15,
    source: FRONTIERS_NFIX,
  },
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Solanaceae',
    bonusScore: -15,
    source: FRONTIERS_NFIX,
  },
  // Moderate N-demand successors (−10 pp)
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Cucurbitaceae',
    bonusScore: -10,
    source: FRONTIERS_NFIX,
  },
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Poaceae',
    bonusScore: -10,
    source: FRONTIERS_NFIX,
  },
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Chenopodiaceae',
    bonusScore: -10,
    source: FRONTIERS_NFIX,
  },
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Asteraceae',
    bonusScore: -10,
    source: FRONTIERS_NFIX,
  },
  // Autotoxicity / legume-fatigue penalty (+15 pp)
  {
    predecessorFamily: 'Fabaceae',
    successorFamily: 'Fabaceae',
    bonusScore: 15,
    source: AUTOTOXICITY,
  },
];
