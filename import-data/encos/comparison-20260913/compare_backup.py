"""Offline comparison; reads only the fonts table extracted with pg_restore."""
import bisect, collections, hashlib, json, math, pathlib, random, re, unicodedata
ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'encos_fonts.json'
SQL = pathlib.Path('/tmp/fontapp-encos-fonts-20260913.sql')
def decode(s):
    if s == r'\N': return None
    return re.sub(r'\\([btnrfv\\])', lambda m: {'b':'\b','t':'\t','n':'\n','r':'\r','f':'\f','v':'\v','\\':'\\'}[m[1]], s)
fonts=[]
with SQL.open() as f:
    for line in f:
        if line.startswith('COPY public.fonts '):
            columns=line.split('(',1)[1].split(')',1)[0].split(', ')
            break
    for line in f:
        if line.rstrip('\n') == r'\.': break
        values=line.rstrip('\n').split('\t'); assert len(values)==len(columns)
        row=dict(zip(columns,map(decode,values)))
        fonts.append({k:row[k] for k in ('id','name','latitude','longitude','municipality','duplicate_of','retired_at','moderation_state')})
for f in fonts:
    f['latitude']=float(f['latitude']);f['longitude']=float(f['longitude'])
fonts.sort(key=lambda f:f['latitude']); lats=[f['latitude'] for f in fonts]
def distance(a,b,c,d):
    x=math.sin(math.radians(c-a)/2)**2+math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(math.radians(d-b)/2)**2
    return 12742000*math.asin(min(1,math.sqrt(x)))
def nearby(lat,lon,radius):
    delta=math.degrees(radius/6371000)
    return sorted((distance(lat,lon,fonts[i]['latitude'],fonts[i]['longitude']),i) for i in range(bisect.bisect_left(lats,lat-delta),bisect.bisect_right(lats,lat+delta)) if abs(fonts[i]['longitude']-lon)<delta/max(.01,math.cos(math.radians(abs(lat)+delta))))
def compact(d,i):
    f=fonts[i]
    return dict(id=f['id'],name=f['name'],municipality=f['municipality'],distance_m=round(d,2),visible=f['duplicate_of'] is None and f['retired_at'] is None and f['moderation_state']=='visible',url='https://fontapp.net/fonts/'+f['id'])
def normalize(s):
    return ' '.join(re.sub('[^a-z0-9 ]',' ',''.join(c for c in unicodedata.normalize('NFKD',s or '').lower() if not unicodedata.combining(c))).split())
encos=json.loads(SOURCE.read_text());results=[]
for e in encos:
    r={k:e.get(k) for k in ('id','name','town','comarca','lat','lng','source_url')}
    if e.get('lat') is None or e.get('lng') is None:
        r['status']='no_coordinates';results.append(r);continue
    if not (-90<=e['lat']<=90 and -180<=e['lng']<=180):
        r['status']='invalid_coordinates';results.append(r);continue
    radius=1000
    while True:
        candidates=nearby(e['lat'],e['lng'],radius)
        if candidates and candidates[0][0]<=radius:break
        radius*=2
    d,i=candidates[0];r['nearest']=compact(d,i)
    r['within_200m']=[compact(dd,ii) for dd,ii in candidates if dd<=200]
    r['same_name_within_1km']=[compact(dd,ii) for dd,ii in candidates if dd<=1000 and normalize(e['name'])==normalize(fonts[ii]['name'])]
    r['status']='within_50m' if d<=50 else 'between_50_and_200m' if d<=200 else 'beyond_200m'
    results.append(r)
valid=[r for r in results if 'nearest' in r]
sample=random.Random(20260920).sample(valid,30)
summary={'backup':'fontapp-20260913-090003.dump','backup_time':'2026-09-13 09:00:03 CEST','input_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'total_encos':len(encos),'unique_encos_ids':len({e['id'] for e in encos}),'fonts_in_backup':len(fonts),'with_coordinates':len(valid),'unusable_coordinates':len(results)-len(valid),'within_radius':{str(t):sum(r['nearest']['distance_m']<=t for r in valid) for t in [10,25,50,75,100,150,200,500,1000]},'statuses':dict(collections.Counter(r['status'] for r in results)),'sample_seed':20260920,'sample_statuses':dict(collections.Counter(r['status'] for r in sample)),'beyond_200m_same_name_within_1km':sum(r['status']=='beyond_200m' and bool(r['same_name_within_1km']) for r in valid),'nearest_hidden':sum(not r['nearest']['visible'] for r in valid)}
(ROOT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
(ROOT/'sample.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n')
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
for r in sample:
    n=r['nearest'];print(r['id'],r['name'],r['town'],'→',n['distance_m'],n['name'])
print('EXAMPLE', next(r for r in results if r['id']=='3270'))
