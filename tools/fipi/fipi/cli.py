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
from .parse import parse_page

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
OUT = ROOT / "out"
TASKS_PATH = OUT / "tasks.jsonl"
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
                record["oge_number"] = verdict.number
                record["oge_title"] = describe(verdict.number)
                record["classification"] = verdict.to_dict()
                record["image_urls"] = [f"{HOST}/{p}" for p in task.images]
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

    stats = sub.add_parser("stats", help="classification report")
    stats.set_defaults(func=cmd_stats)

    verify = sub.add_parser("verify", help="confirm answers against the bank")
    verify.add_argument("--limit", type=int)
    verify.set_defaults(func=cmd_verify)

    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)
