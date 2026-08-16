"""Turn a raw questions.php page into structured tasks.

Three things about this markup are easy to get wrong:

1. **Images are not in the HTML.** They are emitted at runtime by
   `document.write` inside `ShowPictureQ(...)` and friends, so a DOM parser
   reports zero images on a page full of diagrams. We read the call arguments.
2. **Formulas are MathML**, not LaTeX and not images. See `mathml.py`.
3. **Statement cells nest tables**, so the closing `</TD>` cannot be found with
   a non-greedy regex. We count tag depth instead.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field, asdict
from typing import Iterator

from .config import ANSWER_LABELS
from .mathml import inline_math

# --- block boundaries ------------------------------------------------------

QBLOCK_RE = re.compile(r"<div\s+class=\"qblock[^\"]*\"\s+id='q([0-9A-Fa-f]+)'", re.IGNORECASE)
GUID_RE = re.compile(r"name=\"guid\"\s+value=\"([0-9A-Fa-f]{32})\"", re.IGNORECASE)
CELL_OPEN_RE = re.compile(r"<td[^>]*class='cell_(\d+)'[^>]*>", re.IGNORECASE)
TD_TAG_RE = re.compile(r"</?td\b", re.IGNORECASE)

#: Any quoted path under docs/ is a question asset, whichever ShowPicture*
#: variant wrote it. Matching the paths rather than the call signatures keeps
#: this working when a rare variant shows up.
IMAGE_RE = re.compile(r"['\"](docs/[^'\"]+?\.(?:png|jpe?g|gif|svg))['\"]", re.IGNORECASE)
PICTURE_FN_RE = re.compile(r"(ShowPicture[A-Za-z0-9]*)\s*\(\s*['\"]docs/", re.IGNORECASE)

# --- metadata --------------------------------------------------------------

SHORT_ID_RE = re.compile(r"class=\"canselect\">([^<]+)</span>", re.IGNORECASE)
PARAM_ROW_RE = re.compile(
    r"<td class=\"param-name\">([^<]+)</td>\s*<td[^>]*>(.*?)</td>",
    re.IGNORECASE | re.DOTALL,
)
KES_ITEM_RE = re.compile(r"<div>([^<]+)</div>", re.IGNORECASE)
KES_CODE_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\s+(.*)$")

# --- variants --------------------------------------------------------------

DISTRACTOR_TABLE_RE = re.compile(
    r"<table[^>]*class=\"distractors-table\"[^>]*>(.*?)</table>", re.IGNORECASE | re.DOTALL
)
DISTRACTOR_ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
RADIO_VALUE_RE = re.compile(r"name=\"answer\"\s+value=\"(\d+)\"", re.IGNORECASE)

# --- text cleanup ----------------------------------------------------------

SCRIPT_RE = re.compile(r"<script\b.*?</script>", re.IGNORECASE | re.DOTALL)
STYLE_RE = re.compile(r"<style\b.*?</style>", re.IGNORECASE | re.DOTALL)
BREAK_RE = re.compile(r"</(p|div|tr|table|li)\s*>|<br\s*/?>", re.IGNORECASE)
CELL_BREAK_RE = re.compile(r"</t[dh]\s*>", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t ]+")
NEWLINES_RE = re.compile(r"\n{3,}")


@dataclass
class Task:
    """One question as the bank stores it, before any exam-number reasoning."""

    guid: str
    short_id: str
    statement_text: str
    statement_html: str
    #: Extra cells; grouped 1–5 style tasks put shared context in cell_0.
    extra_cells: list[str] = field(default_factory=list)
    answer_kind: str = ""
    answer_label: str = ""
    kes_codes: list[str] = field(default_factory=list)
    kes_titles: list[str] = field(default_factory=list)
    choices: list[dict] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    picture_fns: list[str] = field(default_factory=list)
    source_page: int = -1

    @property
    def url(self) -> str:
        return f"https://oge.fipi.ru/bank/questions.php?qid={self.short_id}"

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["url"] = self.url
        return payload


def _find_cell(block: str, start: int) -> tuple[str, int]:
    """Return the inner HTML of the `<td>` opening at `start`, respecting nesting."""
    depth = 1
    position = start
    while depth > 0:
        match = TD_TAG_RE.search(block, position)
        if not match:
            return block[start:], len(block)
        depth += -1 if match.group(0).lower().startswith("</") else 1
        position = match.end()
        if depth == 0:
            return block[start : match.start()], position
    return block[start:], len(block)


def to_text(fragment: str) -> str:
    """Readable plain text: MathML becomes `$…$`, layout becomes newlines."""
    text = inline_math(fragment)
    text = SCRIPT_RE.sub(" ", text)
    text = STYLE_RE.sub(" ", text)
    text = CELL_BREAK_RE.sub(" | ", text)
    text = BREAK_RE.sub("\n", text)
    text = TAG_RE.sub("", text)
    text = html.unescape(text)
    text = WS_RE.sub(" ", text)
    text = "\n".join(line.strip(" |").strip() for line in text.split("\n"))
    text = NEWLINES_RE.sub("\n\n", text)
    return text.strip()


def clean_html(fragment: str) -> str:
    """Statement HTML with math inlined and scripts removed, layout preserved."""
    cleaned = inline_math(fragment)
    cleaned = SCRIPT_RE.sub("", cleaned)
    cleaned = STYLE_RE.sub("", cleaned)
    return cleaned.strip()


def _parse_metadata(block: str) -> tuple[str, str, list[str], list[str]]:
    answer_label = ""
    kes_codes: list[str] = []
    kes_titles: list[str] = []

    for name, value in PARAM_ROW_RE.findall(block):
        label = name.strip().rstrip(":").strip()
        if label == "КЭС":
            items = KES_ITEM_RE.findall(value) or [TAG_RE.sub("", value)]
            for item in items:
                item = html.unescape(item).strip()
                if not item:
                    continue
                code_match = KES_CODE_RE.match(item)
                if code_match:
                    kes_codes.append(code_match.group(1))
                    kes_titles.append(code_match.group(2).strip())
                else:
                    kes_titles.append(item)
        elif label == "Тип ответа":
            answer_label = html.unescape(TAG_RE.sub("", value)).strip()

    answer_kind = ANSWER_LABELS.get(answer_label, "")
    return answer_kind, answer_label, kes_codes, kes_titles


def _parse_choices(block: str) -> list[dict]:
    table = DISTRACTOR_TABLE_RE.search(block)
    if not table:
        return []
    choices: list[dict] = []
    for row in DISTRACTOR_ROW_RE.findall(table.group(1)):
        value_match = RADIO_VALUE_RE.search(row)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.IGNORECASE | re.DOTALL)
        label = to_text(cells[-1]) if cells else ""
        if not label:
            continue
        choices.append({"value": value_match.group(1) if value_match else str(len(choices) + 1), "text": label})
    return choices


def parse_page(page_html: str, page_index: int = -1) -> list[Task]:
    """Extract every task on one questions.php response."""
    starts = [(match.start(), match.group(1)) for match in QBLOCK_RE.finditer(page_html)]
    tasks: list[Task] = []

    for position, (start, short_id) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(page_html)
        block = page_html[start:end]

        guid_match = GUID_RE.search(block)
        if not guid_match:
            continue
        guid = guid_match.group(1).upper()

        cells: list[tuple[int, str]] = []
        search_from = 0
        while True:
            cell_match = CELL_OPEN_RE.search(block, search_from)
            if not cell_match:
                break
            inner, search_from = _find_cell(block, cell_match.end())
            cells.append((int(cell_match.group(1)), inner))

        if not cells:
            continue
        cells.sort(key=lambda item: item[0])
        primary = cells[0][1]
        extras = [to_text(inner) for _, inner in cells[1:]]

        answer_kind, answer_label, kes_codes, kes_titles = _parse_metadata(block)
        canselect = SHORT_ID_RE.search(block)

        tasks.append(
            Task(
                guid=guid,
                short_id=(canselect.group(1).strip() if canselect else short_id).upper(),
                statement_text=to_text(primary),
                statement_html=clean_html(primary),
                extra_cells=[text for text in extras if text],
                answer_kind=answer_kind,
                answer_label=answer_label,
                kes_codes=kes_codes,
                kes_titles=kes_titles,
                choices=_parse_choices(block),
                images=sorted(set(IMAGE_RE.findall(block))),
                picture_fns=sorted(set(PICTURE_FN_RE.findall(block))),
                source_page=page_index,
            )
        )

    return tasks


def iter_tasks(pages: Iterator[tuple[str, int]]) -> Iterator[Task]:
    for page_html, index in pages:
        yield from parse_page(page_html, index)
