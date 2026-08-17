"""Candidate answers looked up in an outside catalogue.

The bank publishes no keys, and for whole families — the practical block, the
figures on squared paper — nothing in the statement lets us compute one. Other
sites do publish answers to the same exam tasks, so a task can be recognised by
its wording there and the number read off.

What that number is here: a **candidate, not a key.** Nothing from the outside
catalogue is stored — not the wording, not the worked solution, not the picture.
The number goes through the same door as every other candidate, ФИПИ's own
checker (`solve.php`), and only what the checker confirms is written to
`answers.jsonl`. What ends up in the bank is our own verified fact.

That distinction is also what makes the matching tolerable at all: the practical
block clones one question across many variants — «Найдите диаметр колеса
автомобиля, выходящего с завода» is asked of a dozen different cars — so the
text alone cannot say which clone an answer belongs to. Each is proposed and
the checker sorts them out; a wrong guess costs one refusal, never a wrong key.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

CATALOGUE = "https://math-oge.sdamgia.ru/prob_catalog"
LISTING = "https://math-oge.sdamgia.ru/test?filter=all&category_id={}"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

#: Units and stray words the source appends to an answer; the bank wants a bare
#: number and compares it literally.
TRAILING = re.compile(
    r"\s*(?:мм|см|дм|м|км|кг|г|т|л|руб(?:лей|ля)?|%|градусов|штук|шт)\.?$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Hint:
    """One statement seen in the outside catalogue, with the answer beside it."""

    source_id: str
    number: str
    text: str
    answer: str


def _fetch(url: str, cache: Path, name: str, delay: float = 1.2) -> str:
    """Read a page, keeping a copy so a re-run costs nobody anything."""
    path = cache / name
    if path.exists():
        return path.read_text(encoding="utf-8", errors="replace")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        page = response.read().decode("utf-8", "replace")
    cache.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")
    time.sleep(delay)
    return page


def categories(cache: Path) -> list[str]:
    """Every catalogue section, in the order the site lists them."""
    page = _fetch(CATALOGUE, cache, "catalog.html")
    return list(dict.fromkeys(re.findall(r"category_id=(\d+)", page)))


def _plain(fragment: str) -> str:
    text = re.sub(r"<script.*?</script>", " ", fragment, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text)).replace("\xad", "")
    return re.sub(r"[\s  ]+", " ", text).strip()


def parse_listing(page: str) -> list[Hint]:
    """Pull out every task on one listing page together with its answer."""
    hints: list[Hint] = []
    for block in re.split(r'(?=<div class="prob_view")', page)[1:]:
        head = re.search(r"Тип\s*(\d+)&nbsp;№&nbsp;<a href=\"/problem\?id=(\d+)\"", block)
        if not head:
            continue
        body = _plain(block)
        answer = re.search(r"Ответ:\s*([^\s][^.]{0,30}?)\s*(?:\.|$|Примечание|Приведём)", body)
        if not answer:
            continue
        value = TRAILING.sub("", answer.group(1).strip())
        if not value:
            continue
        hints.append(Hint(source_id=head.group(2), number=head.group(1), text=body, answer=value))
    return hints


def collect(cache: Path, delay: float = 1.2) -> list[Hint]:
    """Walk the whole catalogue once and return what it says."""
    found: list[Hint] = []
    ids = categories(cache)
    for index, category in enumerate(ids, start=1):
        page = _fetch(LISTING.format(category), cache, f"cat_{category}.html", delay)
        found.extend(parse_listing(page))
        if index % 25 == 0:
            print(f"  {index}/{len(ids)} разделов, задач с ответом {len(found)}", flush=True)
    return found


def fingerprint(statement: str) -> str:
    """A statement reduced to what survives being retyped on another site.

    Formulas, pictures and digits all go. Formulas because every site marks
    them up differently — ours arrives as `$1\\times 1$`, theirs as plain text,
    and comparing the two is comparing markup. Digits because they travel
    inside those formulas: keeping them would make the same task look different
    depending on where its numbers happened to be written.
    """
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", statement)
    text = re.sub(r"\$[^$]*\$", " ", text)
    text = text.lower().replace("ё", "е")
    return re.sub(r"[^a-zа-я]+", "", text)


def _grams(text: str, size: int = 5) -> set[str]:
    return {text[index : index + size] for index in range(max(0, len(text) - size + 1))}


#: How much of our statement must be present in theirs to call it the same task.
COVERAGE = 0.9

#: Never propose more than this many answers for one task: a cloned family is
#: matched by wording alone, and past a handful the guesses stop being evidence.
MAX_ANSWERS = 4


def match(tasks: list[dict], hints: list[Hint], minimum: int = 40) -> dict[str, list[str]]:
    """Candidate answers per ФИПИ GUID, from statements that read the same.

    Matching is by overlap rather than equality: the same task carries a
    different preamble on each site, and one side may spell out what the other
    draws. A statement too short to identify anything is skipped — «Найдите
    площадь трапеции» fits half the bank and would propose noise.

    Where several hints fit one task, which is the rule for a cloned family
    rather than the exception, the closest few answers are all offered and
    ФИПИ's checker decides which belongs to this clone.
    """
    by_number: dict[str, list[tuple[set[str], str]]] = {}
    for hint in hints:
        by_number.setdefault(hint.number, []).append((_grams(fingerprint(hint.text)), hint.answer))

    candidates: dict[str, list[str]] = {}
    for task in tasks:
        pool = by_number.get(str(task.get("oge_number")))
        if not pool:
            continue
        needle = _grams(fingerprint(task.get("statement_text", "")))
        if len(needle) < minimum:
            continue
        scored = sorted(
            (
                (len(needle & theirs) / len(needle), answer)
                for theirs, answer in pool
                if theirs
            ),
            reverse=True,
        )
        answers = list(
            dict.fromkeys(answer for coverage, answer in scored if coverage >= COVERAGE)
        )[:MAX_ANSWERS]
        if answers:
            candidates[task["guid"]] = answers
    return candidates


def load(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return {
            record["guid"]: record["answers"]
            for record in (json.loads(line) for line in handle if line.strip())
        }
