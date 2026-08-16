"""Command line for the ФИПИ importer.

    python run.py crawl            # download every page into cache/ (once)
    python run.py build            # cache/ -> out/tasks.jsonl, with exam numbers
    python run.py images           # download the diagrams referenced by tasks
    python run.py stats            # how well the classification went
    python run.py verify --limit 50  # confirm answers against the bank
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

from .classify import AMBIGUOUS, CERTAIN, LIKELY, classify, describe
from .config import HOST, MATH_PROJ, MAX_PAGE_SIZE, FetchSettings
from .fetch import FipiClient, download_image
from .parse import parse_group_intro, parse_page
from .equations import solve_equation
from .formulas import solve_formula
from .probability import solve_probability
from .solver import answer_variants, bounded_candidates, solve_statement

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
OUT = ROOT / "out"
TASKS_PATH = OUT / "tasks.jsonl"
ANSWERS_PATH = OUT / "answers.jsonl"
GROUPS_PATH = OUT / "groups.jsonl"
IMAGES_DIR = OUT / "images"


def _settings(args: argparse.Namespace) -> FetchSettings:
    return FetchSettings(
        proj=args.proj,
        page_size=args.page_size,
        delay=args.delay,
        themes=tuple(t for t in (args.theme or "").split(",") if t),
        answer_kind=args.answer_kind or "",
    )


def _load_tasks() -> list[dict]:
    if not TASKS_PATH.exists():
        sys.exit(f"{TASKS_PATH} not found — run `build` first")
    with TASKS_PATH.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


# --- commands --------------------------------------------------------------


def cmd_crawl(args: argparse.Namespace) -> None:
    client = FipiClient(_settings(args), CACHE)
    total = client.total()
    print(f"bank reports {total} questions; page size {args.page_size}")
    fetched = cached = 0
    for page, pages in client.crawl(refresh=args.refresh, limit=args.limit):
        if page.from_cache:
            cached += 1
        else:
            fetched += 1
        print(f"  page {page.index + 1}/{pages} {'(cache)' if page.from_cache else ''}", flush=True)
    print(f"done: {fetched} fetched, {cached} from cache -> {CACHE}")


def cmd_build(args: argparse.Namespace) -> None:
    pages = sorted(CACHE.glob("*.html"))
    if not pages:
        sys.exit(f"{CACHE} is empty — run `crawl` first")

    OUT.mkdir(parents=True, exist_ok=True)

    # Shared group context, when a previous `groups` run collected it.
    groups: dict[str, dict] = {}
    if GROUPS_PATH.exists():
        with GROUPS_PATH.open(encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    record = json.loads(line)
                    groups[record["group_id"]] = record

    seen: set[str] = set()
    written = 0
    stats: Counter[str] = Counter()

    with TASKS_PATH.open("w", encoding="utf-8") as handle:
        for index, path in enumerate(pages):
            for task in parse_page(path.read_text(encoding="utf-8"), index):
                if task.guid in seen:
                    continue
                seen.add(task.guid)
                verdict = classify(
                    task.statement_text, task.answer_kind, task.kes_codes, task.extra_cells
                )
                record = task.to_dict()
                shared = groups.get(task.group_id or "")
                if shared:
                    record["group_intro"] = shared["intro_text"]
                    record["group_images"] = shared["images"]
                    # The plan belongs to the statement as much as the question
                    # text does; without it the task cannot be answered.
                    record["images"] = sorted(set(record["images"]) | set(shared["images"]))
                    record["image_urls"] = [f"{HOST}/{p}" for p in record["images"]]
                record["oge_number"] = verdict.number
                record["oge_title"] = describe(verdict.number)
                record["classification"] = verdict.to_dict()
                record.setdefault("image_urls", [f"{HOST}/{p}" for p in task.images])
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                written += 1
                stats[verdict.confidence] += 1

    print(f"{written} unique tasks -> {TASKS_PATH}")
    for confidence in (CERTAIN, LIKELY, AMBIGUOUS, "unresolved"):
        count = stats[confidence]
        if count:
            print(f"  {confidence:11} {count:5}  {count / written:5.1%}")


def cmd_images(args: argparse.Namespace) -> None:
    tasks = _load_tasks()
    targets = [
        (task["guid"], path)
        for task in tasks
        for path in task["images"]
    ]
    print(f"{len(targets)} images referenced by {len(tasks)} tasks")
    downloaded = skipped = failed = 0
    for index, (guid, path) in enumerate(targets[: args.limit] if args.limit else targets):
        destination = IMAGES_DIR / guid / Path(path).name
        try:
            if download_image(f"{HOST}/{path}", destination):
                downloaded += 1
                # Static assets are cheap next to a PHP page render, but they
                # still come off one host — keep a gap between them.
                time.sleep(args.delay)
            else:
                skipped += 1
        except Exception as error:  # noqa: BLE001 - one bad asset must not stop the run
            failed += 1
            print(f"  ! {path}: {error}", file=sys.stderr)
        if index and index % 250 == 0:
            print(f"  {index}/{len(targets)}", flush=True)
    print(f"downloaded {downloaded}, already present {skipped}, failed {failed} -> {IMAGES_DIR}")


def cmd_groups(args: argparse.Namespace) -> None:
    """Fetch the shared text and drawing behind every grouped question."""
    tasks = _load_tasks()
    group_ids = sorted({task["group_id"] for task in tasks if task.get("group_id")})
    if not group_ids:
        sys.exit("в tasks.jsonl нет групповых заданий — сначала `build`")

    settings = _settings(args)
    settings.page_size = 100
    client = FipiClient(settings, CACHE)
    OUT.mkdir(parents=True, exist_ok=True)

    written = 0
    with GROUPS_PATH.open("w", encoding="utf-8") as handle:
        for index, zid in enumerate(group_ids, start=1):
            html = client.group(zid, refresh=args.refresh)
            members = parse_page(html, -1)
            intro = parse_group_intro(html, zid)
            if not intro:
                print(f"  ! {zid}: общий блок не найден", file=sys.stderr)
                continue
            handle.write(json.dumps({
                "group_id": zid,
                "intro_text": intro.text,
                "intro_html": intro.html,
                "images": intro.images,
                "member_count": sum(1 for task in members if task.group_position is not None),
            }, ensure_ascii=False) + "\n")
            written += 1
            print(f"  {index}/{len(group_ids)} {zid}: {len(intro.images)} схем", flush=True)

    print(f"{written} групп -> {GROUPS_PATH}")
    print("Теперь повторите `build`, чтобы привязать общий текст к заданиям.")


def cmd_solve(args: argparse.Namespace) -> None:
    """Compute the answers we can, then confirm each one with ФИПИ.

    Only confirmed answers are written. A mis-evaluated expression therefore
    costs one rejected candidate rather than a wrong key in the bank, which is
    why the solver is allowed to be approximate at the edges.

    This is solve-then-verify, not search: at most two requests per task, and
    only for tasks an arithmetic evaluator already answered.
    """
    tasks = _load_tasks()
    candidates: list[tuple[dict, list[str]]] = []
    for task in tasks:
        if task["answer_kind"] == "short":
            answer = (
                solve_statement(task["statement_text"])
                or solve_probability(task["statement_text"])
                or solve_equation(task["statement_text"])
                or solve_formula(task["statement_text"])
            )
            if answer is not None:
                candidates.append((task, answer_variants(answer)))
            continue
        if not args.choices:
            continue
        options = bounded_candidates(task.get("answer_space") or {})
        if options:
            candidates.append((task, options))

    if args.limit:
        candidates = candidates[: args.limit]
    print(f"вычислено кандидатов: {len(candidates)}")

    known: dict[str, str] = {}
    if ANSWERS_PATH.exists() and not args.refresh:
        with ANSWERS_PATH.open(encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    record = json.loads(line)
                    known[record["guid"]] = record["answer"]
        print(f"уже подтверждено ранее: {len(known)}")

    settings = _settings(args)
    client = FipiClient(settings, CACHE)
    confirmed = rejected = unclear = 0

    with ANSWERS_PATH.open("a" if known else "w", encoding="utf-8") as handle:
        for index, (task, answer) in enumerate(candidates, start=1):
            if task["guid"] in known:
                continue
            accepted = None
            for variant in answer:
                verdict = client.check_answer(task["guid"], variant)
                if verdict is True:
                    accepted = variant
                    break
                if verdict is None:
                    unclear += 1
                    break
                time.sleep(args.delay)

            if accepted is not None:
                handle.write(json.dumps({
                    "guid": task["guid"],
                    "short_id": task["short_id"],
                    "answer": accepted,
                }, ensure_ascii=False) + "\n")
                handle.flush()
                confirmed += 1
            else:
                rejected += 1

            time.sleep(args.delay)
            if index % 25 == 0:
                print(f"  {index}/{len(candidates)} — подтверждено {confirmed}", flush=True)

    print(f"подтверждено {confirmed}, отклонено {rejected}, неясно {unclear} -> {ANSWERS_PATH}")


def cmd_stats(args: argparse.Namespace) -> None:
    tasks = _load_tasks()
    by_number: Counter[object] = Counter(task["oge_number"] for task in tasks)
    by_confidence: Counter[str] = Counter(task["classification"]["confidence"] for task in tasks)
    by_method: Counter[str] = Counter(task["classification"]["method"] for task in tasks)
    with_images = sum(1 for task in tasks if task["images"])

    print(f"tasks          {len(tasks)}")
    print(f"with diagrams  {with_images} ({with_images / len(tasks):.1%})")
    print()
    print("by exam number")
    for number in range(1, 26):
        count = by_number.get(number, 0)
        bar = "█" * min(40, count // 8)
        print(f"  №{number:<3} {count:5}  {bar}")
    unknown = by_number.get(None, 0)
    print(f"  n/a  {unknown:5}  ({unknown / len(tasks):.1%} need review)")
    print()
    print("by confidence")
    for confidence, count in by_confidence.most_common():
        print(f"  {confidence:11} {count:5}  {count / len(tasks):5.1%}")
    print()
    print("top methods")
    for method, count in by_method.most_common(12):
        print(f"  {method:28} {count:5}")


def cmd_verify(args: argparse.Namespace) -> None:
    """Confirm answers we already have. One request per task, never a search."""
    tasks = _load_tasks()
    answerable = [task for task in tasks if task.get("answer")]
    if not answerable:
        sys.exit(
            "no task in tasks.jsonl has an `answer` field yet — "
            "solve them first, then run verify to confirm"
        )
    client = FipiClient(_settings(args), CACHE)
    correct = wrong = unknown = 0
    for task in answerable[: args.limit] if args.limit else answerable:
        result = client.check_answer(task["guid"], str(task["answer"]))
        if result is True:
            correct += 1
        elif result is False:
            wrong += 1
            print(f"  ✗ {task['short_id']} answer={task['answer']}")
        else:
            unknown += 1
    print(f"confirmed {correct}, rejected {wrong}, unclear {unknown}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fipi", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--proj", default=MATH_PROJ, help="subject project GUID")
    parser.add_argument("--page-size", type=int, default=MAX_PAGE_SIZE)
    parser.add_argument("--delay", type=float, default=1.5, help="seconds between live requests")
    parser.add_argument("--theme", default="", help="КЭС filter, comma separated (e.g. 7,8.2)")
    parser.add_argument("--answer-kind", default="", help="ILI_STD_FULL, ILI_STD_SHORT, …")

    sub = parser.add_subparsers(dest="command", required=True)

    crawl = sub.add_parser("crawl", help="download pages into the cache")
    crawl.add_argument("--refresh", action="store_true", help="ignore cached pages")
    crawl.add_argument("--limit", type=int, help="stop after N pages")
    crawl.set_defaults(func=cmd_crawl)

    build = sub.add_parser("build", help="parse the cache into tasks.jsonl")
    build.set_defaults(func=cmd_build)

    images = sub.add_parser("images", help="download question diagrams")
    images.add_argument("--limit", type=int)
    images.add_argument("--delay", type=float, default=0.2, help="seconds between downloads")
    images.set_defaults(func=cmd_images)

    groups = sub.add_parser("groups", help="download the shared text of grouped tasks")
    groups.add_argument("--refresh", action="store_true")
    groups.set_defaults(func=cmd_groups)

    solve = sub.add_parser("solve", help="compute answers and confirm them with ФИПИ")
    solve.add_argument("--limit", type=int)
    solve.add_argument("--refresh", action="store_true", help="ignore answers.jsonl and start over")
    solve.add_argument("--choices", action="store_true", help="also walk tasks whose form offers a finite set of answers")
    solve.set_defaults(func=cmd_solve)

    stats = sub.add_parser("stats", help="classification report")
    stats.set_defaults(func=cmd_stats)

    verify = sub.add_parser("verify", help="confirm answers against the bank")
    verify.add_argument("--limit", type=int)
    verify.set_defaults(func=cmd_verify)

    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)
