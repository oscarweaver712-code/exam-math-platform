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
PICTURE_FN_RE = re.compile(r"(ShowPicture[A-Za-z0-9]*)\s*\(", re.IGNORECASE)

#: Shared intro blocks pass a bare filename instead of a full path and set the
#: directory separately, e.g.
#:   files_location='../../docs/<proj>/docs/<guid>/'
#:   ShowPicture('xs3docsrc<guid>_1_<ts>.png')
#: Matching only full `docs/...` paths therefore misses every group plan —
#: exactly the drawing tasks 1–5 of the exam depend on.
FILES_LOCATION_RE = re.compile(r"files_location\s*=\s*['\"]([^'\"]*)['\"]", re.IGNORECASE)
BARE_PICTURE_RE = re.compile(r"ShowPicture[A-Za-z0-9]*\(\s*['\"]([^'\"/]+?\.(?:png|jpe?g|gif|svg))['\"]", re.IGNORECASE)

#: A picture ФИПИ drew where a word belongs. Word exports leave the fragment
#: as `<span><script>ShowPicture…</script></span>`, and stripping scripts turns
#: it into a hole in the sentence: «Диагональ ромба равна 28, а . Найдите
#: площадь». The same call also writes ordinary diagrams, so the wrapper alone
#: decides nothing — see `_is_inline_picture` for what does.
PICTURE_CALL_RE = re.compile(
    r"(?P<span><span(?P<attrs>[^>]*)>\s*)?"
    r"<script\b[^>]*>\s*ShowPicture[A-Za-z0-9]*\(\s*"
    r"['\"](?P<src>[^'\"]+?\.(?:png|jpe?g|gif|svg))['\"][^)]*\)\s*;?\s*</script>"
    r"(?(span)\s*</span>)",
    re.IGNORECASE | re.DOTALL,
)

#: Where a line of text ends. Used to read what stands next to a picture.
BLOCK_EDGE_RE = re.compile(
    r"</?(?:p|td|th|tr|table|div|li|ul|ol|br|h[1-6])\b[^>]*>", re.IGNORECASE
)

#: `position:relative;top:3.0pt` — the vertical nudge that sits a picture on
#: the text baseline. Only Word exports carry it, and only around a fragment.
BASELINE_NUDGE_RE = re.compile(r"position:\s*relative", re.IGNORECASE)

#: Word names the pictures it exported from inside a document `innerimg<N>`,
#: against `xs3qstsrc…` for a picture uploaded as the question's own drawing.
INNER_IMAGE_RE = re.compile(r"(^|/)innerimg\d*\.", re.IGNORECASE)


#: Position of a question inside its group, e.g. `title="Задание 3 в B64540"`.
GROUP_RE = re.compile(r'class="number-in-group"\s+title="Задание\s+(\d+)\s+в\s+(\w+)\s*"', re.IGNORECASE)

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

#: Shape of the answer, read from the form the bank renders.
#: Radio buttons carry their value directly; the checkbox and dropdown forms
#: are described by the `setAnswer` function the page defines per question.
CHECKBOX_COUNT_RE = re.compile(r"for\s*\(\s*var\s+i\s*=\s*0\s*;\s*i\s*<\s*(\d+)\s*;", re.IGNORECASE)
SELECT_SLOT_RE = re.compile(r"name=['\"]?ans(\d+)['\"]?", re.IGNORECASE)
SELECT_BLOCK_RE = re.compile(r"<select[^>]*name=['\"]?ans\d+['\"]?[^>]*>(.*?)</select>", re.IGNORECASE | re.DOTALL)
OPTION_VALUE_RE = re.compile(r"<option\s+value=['\"]?([^'\">\s]+)", re.IGNORECASE)

# --- text cleanup ----------------------------------------------------------

TABLE_RE = re.compile(r"<table\b[^>]*>(.*?)</table>", re.IGNORECASE | re.DOTALL)
ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
CELL_RE = re.compile(r"<t[dh]\b([^>]*)>(.*?)</t[dh]>", re.IGNORECASE | re.DOTALL)
COLSPAN_RE = re.compile(r"colspan\s*=\s*[\"\']?(\d+)", re.IGNORECASE)
ROWSPAN_RE = re.compile(r"rowspan\s*=\s*[\"\']?(\d+)", re.IGNORECASE)

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
    #: Subset of `images` that belongs *inside* a sentence rather than beside
    #: it — a formula ФИПИ drew instead of writing. The statement references
    #: these by markdown image, so they must not also appear in the gallery.
    inline_images: list[str] = field(default_factory=list)
    picture_fns: list[str] = field(default_factory=list)
    #: Group of questions sharing one text and drawing, e.g. the practical
    #: block 1–5. `None` for standalone questions.
    group_id: str | None = None
    #: 1-based position inside that group.
    group_position: int | None = None
    #: Shared context of the group, attached during the group pass.
    group_intro: str = ""
    group_images: list[str] = field(default_factory=list)
    #: Subset of `group_images` drawn inside the shared text.
    group_inline_images: list[str] = field(default_factory=list)
    #: How the answer is entered, when the form bounds it to a small set:
    #: `{"kind": "select_one", "options": ["1","2","3"]}`,
    #: `{"kind": "select_many", "slots": 3}`,
    #: `{"kind": "match", "slots": 3, "options": ["1","2","3"]}`.
    #: Empty for free-form answers, where no finite set exists.
    answer_space: dict = field(default_factory=dict)
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


def _cell_text(fragment: str) -> str:
    """Inline text of one table cell: no newlines, so it fits a markdown row."""
    text = SCRIPT_RE.sub(" ", fragment)
    text = STYLE_RE.sub(" ", text)
    text = TAG_RE.sub(" ", text)
    text = html.unescape(text)
    return WS_RE.sub(" ", text).replace("|", "\\|").strip()


def _render_table(inner: str) -> str:
    """Render one table as a markdown grid.

    The practical block (ОГЭ 1–5) puts its data in tables — tariffs, tyre
    sizes, timetables. Flattening those to a run of prose destroys the row and
    column pairing and makes the task unanswerable, so the grid is preserved.

    Both `colspan` and `rowspan` are expanded into real cells. Rowspan matters
    as much as the text: a header spanning two rows shifts every cell below it
    one column to the left if ignored, which silently pairs each value with the
    wrong heading.
    """
    rows: list[list[str]] = []
    # column index -> (remaining rows, text) carried down from an earlier row
    pending: dict[int, tuple[int, str]] = {}

    for row_html in ROW_RE.findall(inner):
        cells: list[str] = []
        column = 0

        def place(value: str) -> None:
            nonlocal column
            while column in pending:
                remaining, carried = pending[column]
                cells.append(carried)
                if remaining <= 1:
                    del pending[column]
                else:
                    pending[column] = (remaining - 1, carried)
                column += 1
            cells.append(value)
            column += 1

        for attrs, cell_html in CELL_RE.findall(row_html):
            value = _cell_text(cell_html)
            colspan = int(COLSPAN_RE.search(attrs).group(1)) if COLSPAN_RE.search(attrs) else 1
            rowspan = int(ROWSPAN_RE.search(attrs).group(1)) if ROWSPAN_RE.search(attrs) else 1
            for _ in range(colspan):
                start = column
                place(value)
                if rowspan > 1:
                    pending[start] = (rowspan - 1, value)

        # Trailing carried cells after the last real cell of the row.
        while column in pending:
            remaining, carried = pending[column]
            cells.append(carried)
            if remaining <= 1:
                del pending[column]
            else:
                pending[column] = (remaining - 1, carried)
            column += 1

        if cells:
            rows.append(cells)

    if not rows:
        return ""

    # ФИПИ wraps pictures and whole statements in layout tables, and those
    # carry no data — rendering them leaves `| | |---|` sitting in the middle
    # of the statement. Strip the empty scaffolding before deciding whether
    # what remains is a table at all.
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    rows = [row for row in rows if any(cell.strip() for cell in row)]
    if not rows:
        return ""

    filled = [index for index in range(width) if any(row[index].strip() for row in rows)]
    rows = [[row[index] for index in filled] for row in rows]

    # One row, or one column, is a caption or a wrapper — not a grid.
    if len(rows) == 1 or len(rows[0]) == 1:
        cells = [cell.strip() for row in rows for cell in row if cell.strip()]
        return "\n\n" + " ".join(cells) + "\n\n" if cells else ""

    width = len(rows[0])
    lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    lines.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return "\n\n" + "\n".join(lines) + "\n\n"


def _render_tables(fragment: str) -> str:
    """Convert tables to markdown innermost-first, so nesting does not break."""
    previous = None
    text = fragment
    # A table may contain another table; repeat until nothing is left to render.
    while previous != text:
        previous = text
        text = TABLE_RE.sub(lambda match: _render_table(match.group(1)), text, count=0)
    return text


def _visible_neighbours(fragment: str, start: int, end: int) -> tuple[str, str]:
    """Text standing left and right of a picture inside its own line."""
    left = 0
    for edge in BLOCK_EDGE_RE.finditer(fragment, 0, start):
        left = edge.end()
    edge = BLOCK_EDGE_RE.search(fragment, end)
    right = edge.start() if edge else len(fragment)

    def visible(part: str) -> str:
        # Script bodies are code, not text: a neighbouring ShowPicture call
        # would otherwise read as a word standing next to this one.
        part = SCRIPT_RE.sub(" ", part)
        part = STYLE_RE.sub(" ", part)
        part = TAG_RE.sub(" ", part)
        # `&nbsp;` is spacing, not a word; a picture padded with it is alone.
        return html.unescape(part).replace("\xa0", " ").strip()

    return visible(fragment[left:start]), visible(fragment[end:right])


def _is_inline_picture(fragment: str, match: re.Match) -> bool:
    """True when this picture belongs in the sentence, not in the gallery.

    Three signals, each checked against the whole bank:

    1. **The baseline nudge.** `position:relative` wraps 541 fragments and not
       one diagram.
    2. **Words on the same line.** «на прямой отмечены числа ▩ и ▩» — a picture
       with text on both sides is part of the sentence whatever it is called.
       This is how the 15×16 pictures of a number get in, since ФИПИ saves them
       under the ordinary `xs3qstsrc…` name.
    3. **A Word inner image in a span.** `innerimg*` inside a wrapper is always
       a fragment: across the bank the largest such picture is 65px tall, while
       the diagrams sharing that name stand outside any span and start at 144px.

    A bare `innerimg*` with no wrapper is left alone deliberately: those are
    real drawings — the rectangle beside «Найдите площадь прямоугольника».
    """
    attrs = match.group("attrs") or ""
    if match.group("span") and BASELINE_NUDGE_RE.search(attrs):
        return True

    before, after = _visible_neighbours(fragment, match.start(), match.end())
    if before or after:
        return True

    return bool(match.group("span")) and bool(INNER_IMAGE_RE.search(match.group("src")))


def _resolve_picture(src: str, base: str) -> str:
    """A picture path as the gallery stores it, project-relative."""
    return src if src.lower().startswith("docs/") or not base else f"{base}/{src}"


def _picture_base(fragment: str) -> str:
    """Directory a bare `ShowPicture('name.png')` is relative to."""
    locations = [value for value in FILES_LOCATION_RE.findall(fragment) if value.strip()]
    return locations[-1].lstrip("./").rstrip("/") if locations else ""


def inline_pictures(fragment: str, template: str) -> str:
    """Put a drawn-in formula back where the sentence expects it.

    Called before scripts are stripped, otherwise the only trace left of the
    fragment is an empty span.
    """
    base = _picture_base(fragment)

    def place(match: re.Match) -> str:
        if not _is_inline_picture(fragment, match):
            return match.group(0)
        return template.format(_resolve_picture(match.group("src"), base))

    return PICTURE_CALL_RE.sub(place, fragment)


def inline_picture_paths(fragment: str) -> list[str]:
    """Paths of the formulas drawn inside the running text, in reading order.

    Project-relative, like `Task.images`: the shared block of a group passes a
    bare filename and sets `files_location` separately, and an inline path that
    does not match the gallery entry cannot be taken out of the gallery.
    """
    base = _picture_base(fragment)
    paths = []
    for match in PICTURE_CALL_RE.finditer(fragment):
        if not _is_inline_picture(fragment, match):
            continue
        paths.append(_resolve_picture(match.group("src"), base))
    return paths


def to_text(fragment: str) -> str:
    """Readable plain text: MathML becomes `$…$`, tables become markdown grids."""
    text = inline_math(fragment)
    text = inline_pictures(text, "![]({})")
    text = _render_tables(text)
    text = SCRIPT_RE.sub(" ", text)
    text = STYLE_RE.sub(" ", text)
    text = CELL_BREAK_RE.sub(" | ", text)
    text = BREAK_RE.sub("\n", text)
    text = TAG_RE.sub("", text)
    text = html.unescape(text)
    text = WS_RE.sub(" ", text)
    # Markdown table rows must keep their leading and trailing pipes.
    text = "\n".join(
        line.strip() if line.lstrip().startswith("|") else line.strip(" |").strip()
        for line in text.split("\n")
    )
    text = NEWLINES_RE.sub("\n\n", text)
    return text.strip()


def clean_html(fragment: str) -> str:
    """Statement HTML with math inlined and scripts removed, layout preserved."""
    cleaned = inline_math(fragment)
    cleaned = inline_pictures(cleaned, '<img class="inline-math" src="/{}" alt="">')
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


def _parse_answer_space(block: str, answer_kind: str) -> dict:
    """Describe the answer set when the form makes it finite.

    ФИПИ never sends the key, so the only way to learn it is to propose one.
    Where the form offers three or four buttons, the whole set of proposals is
    three or four — the same clicks a learner makes. Where the answer is a free
    number, no such set exists and this returns nothing.
    """
    if answer_kind == "select_one":
        options = sorted(set(RADIO_VALUE_RE.findall(block)), key=lambda value: int(value))
        return {"kind": "select_one", "options": options} if options else {}

    if answer_kind == "select_many":
        count = CHECKBOX_COUNT_RE.search(block)
        return {"kind": "select_many", "slots": int(count.group(1))} if count else {}

    if answer_kind == "match":
        slots = {int(index) for index in SELECT_SLOT_RE.findall(block)}
        first = SELECT_BLOCK_RE.search(block)
        options = [value for value in OPTION_VALUE_RE.findall(first.group(1))] if first else []
        options = [value for value in options if value not in {"0"}]
        if slots and options:
            return {"kind": "match", "slots": len(slots), "options": options}
        return {}

    return {}


def _collect_images(block: str) -> list[str]:
    """Every question asset in one block, as a project-relative `docs/...` path.

    Two shapes exist: a full path passed straight to `ShowPictureQ`, and a bare
    filename passed to `ShowPicture` with the directory in `files_location`.
    """
    paths = set(IMAGE_RE.findall(block))

    bare = BARE_PICTURE_RE.findall(block)
    if bare:
        # The last assignment before the call wins, which is how the browser
        # would see it; blocks only ever set it once.
        locations = [value for value in FILES_LOCATION_RE.findall(block) if value.strip()]
        base = locations[-1] if locations else ""
        base = base.lstrip("./").rstrip("/")
        for name in bare:
            paths.add(f"{base}/{name}" if base else name)

    return sorted(path for path in paths if path.lower().startswith("docs/"))


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
        group = GROUP_RE.search(block)

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
                images=_collect_images(block),
                inline_images=inline_picture_paths(primary),
                picture_fns=sorted(set(PICTURE_FN_RE.findall(block))),
                answer_space=_parse_answer_space(block, answer_kind),
                group_id=group.group(2) if group else None,
                group_position=int(group.group(1)) if group else None,
                source_page=page_index,
            )
        )

    return tasks


#: The shared block of a group carries no id, no guid and no `cell_N`, so the
#: ordinary question regex skips it entirely.
INTRO_RE = re.compile(r'<div class="qblock">\s*(?!<div id="hint"[^>]*>\s*Задание)', re.IGNORECASE)


@dataclass
class GroupIntro:
    """Shared text and drawing behind a group of questions."""

    group_id: str
    text: str
    html: str
    images: list[str] = field(default_factory=list)
    #: Subset of `images` drawn inside the shared text — the tyre groups spell
    #: the width and the sidewall height as pictures mid-sentence.
    inline_images: list[str] = field(default_factory=list)


def parse_group_intro(page_html: str, group_id: str) -> GroupIntro | None:
    """Extract the shared context from a `zid=` listing.

    The practical block 1–5 of the exam is stored as one text plus a plan, and
    the questions derived from it. Only the questions come back from a normal
    listing, which is why they look like they are missing their drawing.
    """
    blocks = [m.start() for m in re.finditer(r'<div class="qblock', page_html, re.IGNORECASE)]
    if not blocks:
        return None

    end = blocks[1] if len(blocks) > 1 else len(page_html)
    block = page_html[blocks[0] : end]

    # A group listing always leads with the shared block; if the first block is
    # a numbered question instead, this listing has no shared context.
    if GROUP_RE.search(block) or GUID_RE.search(block):
        return None

    hint_end = block.find("</div>")
    body = block[hint_end + 6 :] if hint_end != -1 else block

    return GroupIntro(
        group_id=group_id,
        text=to_text(body),
        html=clean_html(body),
        images=_collect_images(block),
        inline_images=inline_picture_paths(inline_math(body)),
    )


def iter_tasks(pages: Iterator[tuple[str, int]]) -> Iterator[Task]:
    for page_html, index in pages:
        yield from parse_page(page_html, index)
