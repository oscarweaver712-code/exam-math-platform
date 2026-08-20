"""Constants for the ФИПИ open bank of ОГЭ tasks.

Everything here was verified against live requests on 2026-08-16. The bank is a
legacy PHP application: responses are windows-1251, images are written by
JavaScript rather than markup, and formulas arrive as MathML.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# --- endpoints -------------------------------------------------------------

HOST = "https://oge.fipi.ru"
INDEX_URL = f"{HOST}/bank/index.php"
QUESTIONS_URL = f"{HOST}/bank/questions.php"
SOLVE_URL = f"{HOST}/bank/solve.php"

#: Subject project "Математика" inside the ОГЭ bank. Stable identifier.
MATH_PROJ = "DE0E276E497AB3784C3FC4CC20248DC0"

#: The bank rejects nothing up to 100; the UI only ever offers 10.
MAX_PAGE_SIZE = 100

#: Responses are declared as windows-1251 and really are.
ENCODING = "windows-1251"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

#: Images live at a fully deterministic path derived from the question GUID.
IMAGE_URL_TEMPLATE = f"{HOST}/{{path}}"

# --- answer types ----------------------------------------------------------

ANSWER_KINDS = {
    "ILI_STD_SELECTONE": "select_one",
    "ILI_STD_SELECTN": "select_many",
    "ILI_STD_SHORT": "short",
    "ILI_STD_FULL": "full",
    "ILI_EXT_ACCORD": "match",
}

#: Human labels as rendered in the «СВОЙСТВА ЗАДАНИЯ» panel, mapped to our slugs.
ANSWER_LABELS = {
    "Выбор ответа из предложенных вариантов": "select_one",
    "Выбор ответов из предложенных вариантов": "select_many",
    "Краткий ответ": "short",
    "Развернутый ответ": "full",
    "Установление соответствия": "match",
}

#: Only «Развернутый ответ» appears in part 2 of the exam.
PART2_ANSWER_KINDS = {"full"}

# --- КИМ structure ---------------------------------------------------------


@dataclass(frozen=True)
class KimSlot:
    """One numbered position in the ОГЭ variant."""

    number: int
    title: str
    part: int
    #: Top-level КЭС codes the specification assigns to this position.
    kes: tuple[str, ...]
    #: Б / П / В as printed in the specification.
    level: str


#: Derived from `research/fipi-2026/spec.txt`, «Обобщённый план варианта КИМ
#: ОГЭ 2026 года по МАТЕМАТИКЕ». The `kes` column is the join key against the
#: bank, which tags every question with a КЭС code but never with a task number.
KIM_SLOTS: tuple[KimSlot, ...] = (
    KimSlot(1, "Практическая задача: план и величины", 1, ("1", "2", "3", "4", "5", "6", "7", "8"), "Б"),
    KimSlot(2, "Практическая задача: данные условия", 1, ("1", "2", "3", "4", "5", "6", "7", "8"), "Б"),
    KimSlot(3, "Практическая задача: расчёт по условию", 1, ("1", "2", "3", "4", "5", "6", "7", "8"), "Б"),
    KimSlot(4, "Практическая задача: выбор варианта", 1, ("1", "2", "3", "4", "5", "6", "7", "8"), "Б"),
    KimSlot(5, "Таблицы и диаграммы", 1, ("8",), "Б"),
    KimSlot(6, "Действия с числами", 1, ("1",), "Б"),
    KimSlot(7, "Числа на координатной прямой", 1, ("1", "6"), "Б"),
    KimSlot(8, "Преобразование выражений", 1, ("1", "2"), "Б"),
    KimSlot(9, "Уравнения и неравенства", 1, ("3",), "Б"),
    KimSlot(10, "Вероятность", 1, ("8",), "Б"),
    KimSlot(11, "Графики функций", 1, ("5",), "Б"),
    KimSlot(12, "Расчёты по формулам", 1, ("2",), "Б"),
    KimSlot(13, "Неравенства на координатной прямой", 1, ("3", "6"), "Б"),
    KimSlot(14, "Последовательности и прогрессии", 1, ("4",), "Б"),
    KimSlot(15, "Геометрия: треугольники", 1, ("7",), "Б"),
    KimSlot(16, "Геометрия: окружность", 1, ("7",), "Б"),
    KimSlot(17, "Геометрия: четырёхугольники и площади", 1, ("7",), "Б"),
    KimSlot(18, "Геометрия: фигуры на клетчатой бумаге", 1, ("7",), "Б"),
    KimSlot(19, "Истинные и ложные высказывания", 1, ("7",), "Б"),
    KimSlot(20, "Уравнения и неравенства: развёрнутый ответ", 2, ("2", "3"), "П"),
    KimSlot(21, "Текстовая задача", 2, ("3",), "П"),
    KimSlot(22, "Графики функций: развёрнутый ответ", 2, ("5",), "П"),
    KimSlot(23, "Геометрия: вычисление", 2, ("7",), "П"),
    KimSlot(24, "Геометрия: доказательство", 2, ("7",), "П"),
    KimSlot(25, "Геометрия: высокий уровень", 2, ("7",), "В"),
)

KIM_BY_NUMBER = {slot.number: slot for slot in KIM_SLOTS}


def slots_for_kes(kes_code: str, part: int | None = None) -> list[KimSlot]:
    """Candidate КИМ positions for a top-level КЭС code, optionally within a part."""
    top = kes_code.split(".", 1)[0]
    return [
        slot
        for slot in KIM_SLOTS
        if top in slot.kes and (part is None or slot.part == part)
    ]


# --- codifier --------------------------------------------------------------

#: Top-level sections of the 2026 codifier as offered by the bank's own filter.
KES_SECTIONS = {
    "1": "Числа и вычисления",
    "2": "Алгебраические выражения",
    "3": "Уравнения и неравенства",
    "4": "Числовые последовательности",
    "5": "Функции",
    "6": "Координаты на прямой и плоскости",
    "7": "Геометрия",
    "8": "Вероятность и статистика",
}


@dataclass
class FetchSettings:
    """Knobs for a crawl. Defaults are deliberately polite.

    `host` and `proj` together choose the bank: the ОГЭ math project on
    `oge.fipi.ru` by default, or a ЕГЭ project on `ege.fipi.ru`. The endpoints
    are derived so the same client crawls either — the engine is identical.
    """

    proj: str = MATH_PROJ
    host: str = HOST
    page_size: int = MAX_PAGE_SIZE
    #: Seconds to wait between page requests.
    delay: float = 1.5
    timeout: float = 60.0
    retries: int = 3
    themes: tuple[str, ...] = field(default_factory=tuple)
    answer_kind: str = ""

    @property
    def index_url(self) -> str:
        return f"{self.host}/bank/index.php"

    @property
    def questions_url(self) -> str:
        return f"{self.host}/bank/questions.php"

    @property
    def solve_url(self) -> str:
        return f"{self.host}/bank/solve.php"
