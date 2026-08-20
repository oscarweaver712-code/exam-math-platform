"""Download the base-math bank's images from ege.fipi.ru into out-ege-base/images."""
import sys, json, time, pathlib, urllib.request
sys.path.insert(0,'.')
from fipi.config import USER_AGENT
OUT=pathlib.Path("out-ege-base/images"); OUT.mkdir(parents=True, exist_ok=True)
REFERER="https://ege.fipi.ru/bank/questions.php"
tasks=[json.loads(l) for l in open('out-ege-base/tasks.jsonl')]
targets=[]
for t in tasks:
    for url,path in zip(t.get('image_urls',[]), t.get('images',[])):
        targets.append((t['guid'], url, path))
seen=set(); uniq=[]
for g,u,p in targets:
    if u in seen: continue
    seen.add(u); uniq.append((g,u,p))
print(f"{len(uniq)} уникальных картинок", flush=True)
ok=skip=fail=0
for i,(guid,url,path) in enumerate(uniq):
    dest=OUT/guid/pathlib.Path(path).name
    if dest.exists(): skip+=1; continue
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req=urllib.request.Request(url, headers={"User-Agent":USER_AGENT,"Referer":REFERER})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())
        ok+=1; time.sleep(0.2)
    except Exception as e:
        fail+=1
        if fail<=5: print("  ! ", url.split('/')[-1], e, flush=True)
    if i and i%400==0: print(f"  {i}/{len(uniq)} (скачано {ok})", flush=True)
print(f"готово: скачано {ok}, было {skip}, ошибок {fail}", flush=True)
