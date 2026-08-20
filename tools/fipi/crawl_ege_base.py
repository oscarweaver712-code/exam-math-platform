"""One-off crawler for the ЕГЭ base-math bank into a separate cache/out.

Kept apart from the ОГЭ CLI (which shares one cache/out) so the two banks never
clobber each other. Reuses the parameterised client and parser unchanged.
"""
import sys, json, time, pathlib
sys.path.insert(0, '.')
from fipi.config import FetchSettings
from fipi.fetch import FipiClient
from fipi.parse import parse_page

HOST = "https://ege.fipi.ru"
PROJ = "E040A72A1A3DABA14C90C97E0B6EE7DC"  # Математика. Базовый уровень
CACHE = pathlib.Path("cache-ege-base"); CACHE.mkdir(exist_ok=True)
OUT = pathlib.Path("out-ege-base"); OUT.mkdir(exist_ok=True)

settings = FetchSettings(host=HOST, proj=PROJ, page_size=100, delay=1.0)
client = FipiClient(settings, CACHE)
total = client.total()
pages = -(-total // settings.page_size)
print(f"банк базовой: {total} заданий, {pages} страниц", flush=True)

seen, records = set(), []
for page, _ in client.crawl():
    for t in parse_page(page.html, page.index):
        if t.guid in seen:
            continue
        seen.add(t.guid)
        records.append(t.to_dict())
    if len(seen) % 500 < 100:
        print(f"  собрано {len(seen)}", flush=True)

with (OUT / "tasks-raw.jsonl").open("w", encoding="utf-8") as fh:
    for r in records:
        fh.write(json.dumps(r, ensure_ascii=False) + "\n")
print(f"готово: {len(records)} задач -> {OUT/'tasks-raw.jsonl'}", flush=True)
