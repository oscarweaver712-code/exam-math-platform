"""Solve-then-verify answer keys for the ЕГЭ base-math bank, against ege.fipi.ru.

Same principle as ОГЭ (tools/fipi solve): compute an answer locally, confirm it
with ФИПИ's own checker, keep only confirmed ones — a wrong guess costs a
rejected candidate, never a wrong key. Reuses the ОГЭ solvers (arithmetic,
equations, formulas, probability), which cover the bulk of base positions
1/14/16 (вычисления), 17 (уравнения), 4 (формула), 5 (вероятность), plus the
finite-set walk for match/select tasks and the bounded probe for the rest.

Reads/writes its own out-ege-base/ so the ОГЭ campaign is untouched.
"""
import sys, json, time, pathlib
sys.path.insert(0, '.')
from fipi.config import FetchSettings
from fipi.fetch import FipiClient
from fipi.solver import solve_statement, answer_variants, bounded_candidates
from fipi.equations import solve_equation
from fipi.formulas import solve_formula
from fipi.probability import solve_probability
from fipi.bounded import probe_candidates

HOST = "https://ege.fipi.ru"
PROJ = "E040A72A1A3DABA14C90C97E0B6EE7DC"
OUT = pathlib.Path("out-ege-base")
TASKS = OUT / "tasks.jsonl"
ANSWERS = OUT / "answers.jsonl"
REJECTED = OUT / "rejected.jsonl"
DELAY = float(sys.argv[sys.argv.index("--delay")+1]) if "--delay" in sys.argv else 0.8
LIMIT = int(sys.argv[sys.argv.index("--limit")+1]) if "--limit" in sys.argv else None
WITH_PROBE = "--probe" in sys.argv

tasks = [json.loads(l) for l in open(TASKS)]
known = {}
if ANSWERS.exists():
    for l in open(ANSWERS):
        if l.strip():
            r = json.loads(l); known[r["guid"]] = r["answer"]
refused = set()
if REJECTED.exists():
    for l in open(REJECTED):
        if l.strip():
            r = json.loads(l); refused.add((r["guid"], r["answer"]))
print(f"задач {len(tasks)}, подтверждено ранее {len(known)}, отклонено {len(refused)}", flush=True)

def candidates_for(task):
    if task["guid"] in known:
        return None
    stmt = task["statement_text"]
    sid = task["short_id"]
    ans = (solve_statement(stmt) or solve_equation(stmt, sid)
           or solve_formula(stmt) or solve_probability(stmt, sid))
    if ans is not None:
        return answer_variants(ans)
    # finite set from the form (match/select)
    opts = bounded_candidates(task.get("answer_space") or {})
    if opts:
        return opts
    if WITH_PROBE:
        probe = probe_candidates(task)
        if probe:
            return probe
    return None

settings = FetchSettings(host=HOST, proj=PROJ, delay=DELAY)
client = FipiClient(settings, pathlib.Path("cache-ege-base"))

def safe_check(guid, variant):
    """check_answer with a couple of retries on transient network/TLS errors."""
    for attempt in range(3):
        try:
            return client.check_answer(guid, variant)
        except Exception as error:  # noqa: BLE001 — a blip must not kill the run
            time.sleep(2.0 * (attempt + 1))
    return None

confirmed = rejected = 0
sent = 0
with ANSWERS.open("a", encoding="utf-8") as ah, REJECTED.open("a", encoding="utf-8") as rh:
    for task in tasks:
        cands = candidates_for(task)
        if not cands:
            continue
        cands = [c for c in cands if (task["guid"], c) not in refused]
        if not cands:
            continue
        if LIMIT and sent >= LIMIT:
            break
        accepted = None
        for variant in cands:
            verdict = safe_check(task["guid"], variant)
            sent += 1
            if verdict is True:
                accepted = variant; break
            if verdict is None:
                break
            time.sleep(DELAY)
        if accepted is not None:
            ah.write(json.dumps({"guid": task["guid"], "short_id": task["short_id"], "answer": accepted}, ensure_ascii=False) + "\n"); ah.flush()
            confirmed += 1
            known[task["guid"]] = accepted
        else:
            rejected += 1
            for c in cands:
                rh.write(json.dumps({"guid": task["guid"], "short_id": task["short_id"], "answer": c}, ensure_ascii=False) + "\n")
            rh.flush()
        time.sleep(DELAY)
        if (confirmed + rejected) % 50 == 0:
            print(f"  обработано {confirmed+rejected}, подтверждено {confirmed}", flush=True)
print(f"ГОТОВО: подтверждено {confirmed}, отклонено {rejected}, запросов ~{sent}", flush=True)
