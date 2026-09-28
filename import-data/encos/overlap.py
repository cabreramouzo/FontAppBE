#!/usr/bin/env python3
"""How many encos fountains do we NOT already have in production?

Fetches all existing fountains in the Catalonia bbox from the public production
API (tiling + subdividing whenever a tile hits the 3000 cap so nothing is
silently truncated), then for each encos point finds the nearest existing one.
"""
import json
import math
import time
import urllib.request

API = "https://fontapp.fly.dev/fonts/in-bounds"
UA = "Mozilla/5.0 (compatible; FontApp-overlap/1.0)"
CAP = 3000

BBOX = (40.35, 42.95, 0.05, 3.40)  # minLat, maxLat, minLng, maxLng

existing = {}   # id -> (lat, lng)
reqs = 0


def fetch(minLat, maxLat, minLng, maxLng):
    global reqs
    url = f"{API}?minLat={minLat}&maxLat={maxLat}&minLong={minLng}&maxLong={maxLng}"
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                reqs += 1
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(2 * (i + 1))
    raise RuntimeError("failed " + url)


def harvest(minLat, maxLat, minLng, maxLng, depth=0):
    rows = fetch(minLat, maxLat, minLng, maxLng)
    if len(rows) >= CAP and depth < 8:
        mLat = (minLat + maxLat) / 2
        mLng = (minLng + maxLng) / 2
        harvest(minLat, mLat, minLng, mLng, depth + 1)
        harvest(minLat, mLat, mLng, maxLng, depth + 1)
        harvest(mLat, maxLat, minLng, mLng, depth + 1)
        harvest(mLat, maxLat, mLng, maxLng, depth + 1)
        return
    for r in rows:
        existing[r["id"]] = (r["latitude"], r["longitude"])
    time.sleep(0.05)


def haversine_m(la1, lo1, la2, lo2):
    R = 6371000.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main():
    print("Harvesting existing fountains from production...", flush=True)
    # Start with a coarse grid so we don't fetch the sea/France in one huge tile.
    step = 0.3
    minLat, maxLat, minLng, maxLng = BBOX
    la = minLat
    while la < maxLat:
        lo = minLng
        while lo < maxLng:
            harvest(la, min(la + step, maxLat), lo, min(lo + step, maxLng))
            lo += step
        la += step
    print(f"  existing fountains in bbox: {len(existing)}  ({reqs} requests)", flush=True)

    # Spatial index of existing points, bucketed ~0.001 deg (~111 m lat).
    grid = {}
    CELL = 0.001
    for (la, lo) in existing.values():
        grid.setdefault((round(la / CELL), round(lo / CELL)), []).append((la, lo))

    def nearest(la, lo):
        best = 1e18
        ca, co = round(la / CELL), round(lo / CELL)
        for da in range(-1, 2):
            for do in range(-1, 2):
                for (ela, elo) in grid.get((ca + da, co + do), []):
                    d = haversine_m(la, lo, ela, elo)
                    if d < best:
                        best = d
        return best

    encos = json.load(open("encos_fonts.json"))
    withcoord = [r for r in encos if r.get("lat") and r.get("lng")
                 and 40 <= r["lat"] <= 43.5 and 0 <= r["lng"] <= 3.5]

    thresholds = [25, 50, 100, 200]
    counts = {t: 0 for t in thresholds}
    missing50 = []
    for r in withcoord:
        d = nearest(r["lat"], r["lng"])
        for t in thresholds:
            if d <= t:
                counts[t] += 1
        if d > 50:
            missing50.append((r, d))

    n = len(withcoord)
    print(f"\nencos fountains with usable coords: {n} (of {len(encos)})")
    print("\nAlready covered by an existing FontApp fountain within:")
    for t in thresholds:
        print(f"  {t:>4} m: {counts[t]:>5}  ->  NOT covered: {n - counts[t]:>5} "
              f"({100*(n-counts[t])/n:.1f}% new)")

    # By comarca, at the 50 m threshold.
    from collections import Counter
    new_by_comarca = Counter(r["comarca"] for (r, _) in missing50)
    print("\nNew fountains (>50 m from any existing) by comarca — top 15:")
    for c, k in new_by_comarca.most_common(15):
        print(f"  {k:>5}  {c}")

    json.dump(
        [{**r, "nearest_existing_m": round(d, 1)} for (r, d) in missing50],
        open("encos_missing.json", "w"), ensure_ascii=False, indent=1,
    )
    print(f"\nWrote encos_missing.json ({len(missing50)} fountains >50 m from any existing)")


if __name__ == "__main__":
    main()
