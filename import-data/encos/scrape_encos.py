#!/usr/bin/env python3
"""Scrape the encos.cat fountain directory into JSON + CSV.

Public data (fountains of Catalonia). Polite: small worker pool, retries, delay.
Author of the site: Enric Costa (encos.cat). Attribution kept in the output.
"""
import csv
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://www.encos.cat/fonts"
INDEX = f"{BASE}/IndexFonts.php"
UA = "Mozilla/5.0 (compatible; FontApp-import/1.0; +https://fontapp.net)"

TAG = re.compile(r"<[^>]+>")
SPAN = re.compile(r"<span>.*?</span>", re.S)


def fetch(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def clean(s):
    s = SPAN.sub("", s)
    s = TAG.sub("", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_ids(index_html):
    ids = []
    seen = set()
    for m in re.finditer(r"IDprovi=(\d+)", index_html):
        i = m.group(1)
        if i not in seen:
            seen.add(i)
            ids.append(i)
    return ids


def parse_fountain(fid, page):
    out = {"id": fid, "source_url": f"{BASE}/MostraFonts.php?IDprovi={fid}"}

    m = re.search(r"<h4>(.*?)</h4>", page, re.S)
    out["name"] = clean(m.group(1)) if m else None

    # Town + comarca: <p3 style="font-weight:bold;">El Brull  (Osona )</p3>
    m = re.search(r'<p3 style="font-weight:bold;"[^>]*>(.*?)</p3>', page, re.S)
    town = comarca = None
    if m:
        raw = clean(m.group(1))
        mm = re.match(r"(.*?)\s*\((.*?)\)\s*$", raw)
        if mm:
            town, comarca = mm.group(1).strip(), mm.group(2).strip()
        else:
            town = raw
    out["town"] = town
    out["comarca"] = comarca

    # Coordinates from the maps link (most reliable).
    m = re.search(r"maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)", page)
    if m:
        out["lat"] = float(m.group(1))
        out["lng"] = float(m.group(2))
    else:
        out["lat"] = out["lng"] = None

    # Labelled rows: <td ... font-style: italic ...><p3>Label:<p3></td><td ...>VALUE</td>
    fields = {}
    for lm in re.finditer(
        r'font-style: italic;[^>]*>\s*<p3>(.*?):\s*<p3>\s*</td>\s*<td[^>]*>(.*?)</td>',
        page, re.S,
    ):
        fields[clean(lm.group(1))] = clean(lm.group(2))
    out["altitude_m"] = fields.get("Alçada")
    out["access"] = fields.get("Accés")
    out["type"] = fields.get("Tipus")
    out["state"] = fields.get("Estat")
    out["flow"] = fields.get("Cabal")
    out["last_visit"] = fields.get("Última visita")

    # Image URLs (googleusercontent).
    out["images"] = re.findall(r'<img[^>]+src="(https://lh3\.googleusercontent[^"]+)"', page)

    # Description: the <p> ... </p> blocks (not <p3>) with real text.
    desc = []
    for pm in re.finditer(r"<p>(.*?)</p>", page, re.S):
        inner = pm.group(1)
        inner = re.sub(r"<br\s*/?>", "\n", inner)
        txt = html.unescape(TAG.sub("", inner)).replace("\r", "")
        txt = re.sub(r"[ \t]+", " ", txt)
        txt = re.sub(r"\n{2,}", "\n", txt).strip()
        if txt:
            desc.append(txt)
    out["description"] = "\n\n".join(desc).strip() or None
    return out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    print("Fetching index...", flush=True)
    ids = parse_ids(fetch(INDEX))
    if limit:
        ids = ids[:limit]
    print(f"{len(ids)} fountains to fetch", flush=True)

    results = {}
    errors = []
    done = 0

    def work(fid):
        page = fetch(f"{BASE}/MostraFonts.php?IDprovi={fid}")
        time.sleep(0.05)
        return fid, parse_fountain(fid, page)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(work, fid): fid for fid in ids}
        for fut in as_completed(futs):
            fid = futs[fut]
            try:
                fid, data = fut.result()
                results[fid] = data
            except Exception as e:  # noqa: BLE001
                errors.append((fid, str(e)))
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(ids)}", flush=True)

    # Keep index order.
    rows = [results[i] for i in ids if i in results]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    with open(f"{out_dir}/encos_fonts.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    cols = ["id", "name", "town", "comarca", "lat", "lng", "altitude_m",
            "access", "type", "state", "flow", "last_visit", "images",
            "description", "source_url"]
    with open(f"{out_dir}/encos_fonts.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            row = dict(r)
            row["images"] = " | ".join(row.get("images") or [])
            w.writerow([row.get(c) for c in cols])

    print(f"Done: {len(rows)} ok, {len(errors)} errors", flush=True)
    if errors:
        print("First errors:", errors[:10], flush=True)


if __name__ == "__main__":
    main()
