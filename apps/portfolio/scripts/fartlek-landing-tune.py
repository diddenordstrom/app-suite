#!/usr/bin/env python3
"""Hand-tune a Fartlek demo snapshot for the landing page. See src/client/components/fartlek/data/README.md."""
import json, math, sys
P = sys.argv[1]
d = json.load(open(P))
F = 268 / 292  # pace scale: CS 4:52 -> 4:28 /km, a ~3:30 marathoner

def sp(x): return None if x is None else round(x * F)
def st(x): return None if x is None else round(x * F)

# --- best efforts: same durations, faster pace, longer distance
def curve(c):
    for p in c:
        p['paceSecPerKm'] = sp(p['paceSecPerKm']); p['distanceM'] = round(p['durationS'] * 1000 / p['paceSecPerKm'], 1)
b = d['pace']['best']
curve(b['allTime'])
for k in ('block', 'rolling'):
    if b.get(k): curve(b[k]['currentCurve']); curve(b[k]['previousCurve'])
# Current 1-30 min bests on the CS model (distance = CS x t + D', CS 268 s/km, D' 120 m), so the
# automatic fit gives that CS with a real D' instead of flat threshold reps; previous period 6 s/km slower.
CSV, DP = 1000 / 268, 120
MODEL = {60: 212, 120: 222, **{t: round(t * 1000 / (CSV * t + DP)) for t in (180, 300, 480, 600, 720, 1200, 1800)}}
def remodel(c, add=0):
    for p in c:
        if p['durationS'] in MODEL:
            p['paceSecPerKm'] = MODEL[p['durationS']] + add; p['distanceM'] = round(p['durationS'] * 1000 / p['paceSecPerKm'], 1)
for k in ('block', 'rolling'):
    if b.get(k): remodel(b[k]['currentCurve']); remodel(b[k]['previousCurve'], 6)
remodel(b['allTime'])

# --- critical speed, zones, threshold
cs = d['pace']['cs']['latest']
cs['paceSecPerKm'] = 268; cs['csMps'] = round(1000 / 268, 3); cs['dPrimeM'] = DP
cs['auto'].update(paceSecPerKm=268, csMps=cs['csMps'], dPrimeM=DP); remodel(cs['auto']['efforts'])
cs['before']['paceSecPerKm'] = sp(cs['before']['paceSecPerKm'])
cs['zones'] = {'firstThreshold': {'pace': round(268 / 0.823), 'paceFast': round(268 / 0.836), 'paceSlow': round(268 / 0.811)}, 'cs': 268}
THR = sp(287)
cs['comparison'] = {'gapSecPerKm': THR - 268, 'status': 'consistent'}
for t in (d['pace']['threshold']['current'], d['today']['home']['threshold'], d['activity']['detail']['estimate']):
    t['paceSecPerKm'] = THR
d['today']['home']['proposal']['paceSecPerKm'] = sp(d['today']['home']['proposal']['paceSecPerKm'])

# --- the threshold run (activity page + home's last run): same km, faster, so shorter
det = d['activity']['detail']
a = det['activity']; a['durationS'] = st(a['durationS'])
d['today']['home']['lastRun']['durationS'] = a['durationS']
for l in det['laps']:
    for k in ('durationS', 'startS'): l[k] = st(l.get(k))
    l['pace'] = sp(l.get('pace'))
for p in det['series']:
    p['t'] = st(p['t']); p['pace'] = sp(p.get('pace'))
for h in det['histogram']: h['secs'] = st(h['secs'])
det['bandPace']['pace'] = sp(det['bandPace']['pace']); det['bandPace']['secs'] = st(det['bandPace']['secs'])
for z in (det['activity'], det['metrics']): z['zoneSecs'] = [st(x) for x in z['zoneSecs']]
d['today']['home']['lastRun']['zoneSecs'] = det['activity']['zoneSecs']
m = det['planned']['match']
for s in m['steps']:
    for k in ('startS', 'endS', 'durationS'): s[k] = st(s.get(k))
    s['pace'] = sp(s.get('pace'))
    if s['target'].get('pace'): s['target']['pace'] = [sp(x) for x in s['target']['pace']]

# --- race predictions: half by Riegel, marathon as the median of the three published models
fr = d['race']['predictions'][1]['current']['from']
frm = {**fr, 'paceSecPerKm': MODEL[1800]}; frm['distanceM'] = round(frm['durationS'] * 1000 / frm['paceSecPerKm'], 1)
riegel = lambda m: frm['durationS'] * (m / frm['distanceM']) ** 1.06
half = round(riegel(21097.5)); mar_r = riegel(42195)
km = 40.3; miles = km * 1000 / 1609.344
vick = round(42195 / (0.16018617 + 0.83076202 * (42195 / mar_r) + 0.06423826 * miles / 10))
dur = round(42195 / ((1000 / 268) * 0.88))
meanP = sp(335)
tanda = round(42.195 * (17.1 + 140 * math.exp(-0.0053 * km) + 0.55 * meanP))
mar = sorted([vick, dur, tanda])[1]
print('half', half, 'riegel mar', round(mar_r), 'vickers', vick, 'durability', dur, 'tanda', tanda, 'median', mar)

def hist(pred, cur, per_week):
    pts = pred['history']; known = [i for i, h in enumerate(pts) if h['seconds'] is not None]
    n = len(known)
    for j, i in enumerate(known):
        pts[i]['seconds'] = round(cur + per_week * (n - 1 - j) + (8 if j % 3 == 1 else 0))
    pred['trendPerWeek'] = -per_week
for pr in d['race']['predictions']:
    pr['current']['from'] = frm
    pr['training']['meanPaceSecPerKm'] = meanP
    if pr['raceId'] == 1:
        pr['current']['seconds'] = half; hist(pr, half, 9)
    else:
        pr['current']['seconds'] = mar
        pr['current']['estimates'] = [
            {'model': 'vickers', 'seconds': vick, 'weeklyKm': km},
            {'model': 'durability', 'seconds': dur, 'ratio': 1.0295, 'group': 'low', 'longRuns': 4},
            {'model': 'tanda', 'seconds': tanda, 'weeklyKm': km, 'meanPaceSecPerKm': meanP, 'outsideValidated': not (10020 <= tanda <= 12960)},
        ]
        hist(pr, mar, 22)
for r in d['today']['home']['races']:
    if r['id'] == 1: r['prediction'] = {'seconds': half, 'trendPerWeek': -9}

# --- today's form: no pain, a short night (sleep 58 takes 0.6) -> 9/10, fine
h = d['today']['home']; rd = h['readiness']
for s in rd['signals']:
    if s['key'] == 'pain': s.update(points=0, value=0, detail={'key': 'detail.noPain'})
    if s['key'] == 'sleep': s.update(points=0.6, value=58, detail={'key': 'detail.sleep', 'params': {'value': 58}})
rd['score'] = max(1, min(10, math.ceil(10 - sum(s['points'] for s in rd['signals']) - 0.5)))
rd['verdict'] = 'fine'
h['painTrends'] = []; h['bodyBattery']['sleepScore'] = 58

# --- fuelling: steady progression to 70 g/h, one mild bloating at 55; advice from Fartlek's rule
FUEL = [('2026-10-10', 45, 0), ('2026-10-18', 50, 0), ('2026-10-25', 55, 2), ('2026-11-01', 60, 0), ('2026-11-08', 70, 0), ('2026-11-15', 70, 0)]
old = {f['date']: f for f in d['fuel']['log']['fuel']}
rows = []
for date, g, gi in FUEL:
    f = dict(old[date]); f.update(gPerH=g, carbsG=round(g * f['minutes'] / 60), gi=gi, nausea=0, bloating=gi, cramps=0); rows.append(f)
d['fuel']['log']['fuel'] = rows
d['fuel']['log']['fuelAdvice'] = {'gPerH': 70, 'action': 'hold', 'reason': {'key': 'fuel.holdClean', 'params': {'g': 70, 'count': 14 - 7}}}

# --- names: the page translates block, run and activity names at render time (DEMO_NAMES in
# src/client/components/fartlek/live/snapshot.ts), so the JSON keeps the seed's names. Fail on one it doesn't know.
NAMES = {'Base', 'Build', 'Marathon-specific', 'Taper', 'Long run', 'Easy run', 'Morning run', 'Commute ride', 'Tröskel 3x2 km'}
RACES = {'Demo Half', 'Demo Marathon'}  # proper names, the same in both languages
def names(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ('name', 'currentName', 'previousName', 'title') and isinstance(v, str): yield v
            yield from names(v)
    elif isinstance(o, list):
        for v in o: yield from names(v)
unknown = sorted(set(names(d)) - NAMES - RACES)
if unknown: sys.exit(f'names without a translation in DEMO_NAMES: {unknown}')

d['_meta']['note'] = 'Hand-tuned for the landing page (see README.md): paces x 268/292, race predictions recomputed, form, fuel; names translated by the page.'
open(P, 'w').write(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
