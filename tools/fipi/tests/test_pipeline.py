"""Checks for the ФИПИ importer. Run with `python3 -m unittest discover tests`.

The fixtures are trimmed from real bank responses, so they carry the quirks the
parser exists to handle: `m:`-prefixed MathML, images written by JavaScript,
and nested tables inside a statement cell.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fipi.classify import AMBIGUOUS, CERTAIN, classify  # noqa: E402
from fipi.config import slots_for_kes  # noqa: E402
from fipi.mathml import inline_math, mathml_to_latex  # noqa: E402
from fipi import parse  # noqa: E402
from fipi.bounded import classify as probe_type, probe_candidates  # noqa: E402
from fipi.paper import solve_paper  # noqa: E402
from fipi.parse import parse_page, to_text  # noqa: E402
from fipi.tyres import solve_tyres  # noqa: E402
from fipi.practical import numbers_for_group  # noqa: E402
from fipi.hints import Hint, match as match_hints  # noqa: E402
from fipi.lattice import Sheet, read_figure  # noqa: E402
from fipi.raster import Image, read_image, read_png  # noqa: E402
from fipi.equations import solve_equation  # noqa: E402
from fipi.formulas import solve_formula  # noqa: E402
from fipi.geometry import solve_geometry  # noqa: E402
from fipi.physics import solve_physics  # noqa: E402
from fipi.probability import solve_probability  # noqa: E402
from fipi.sequences import solve_sequence  # noqa: E402
from fipi.solver import format_answer, solve_statement  # noqa: E402

MATH = "<m:math><m:mstyle displaystyle=\"true\"><m:semantics>{}</m:semantics></m:mstyle></m:math>"

QBLOCK = """
<div class="qblock" id='q041048'>
  <form id='checkform041048'>
  <input type="Hidden" name="guid" value="02F5026F38D4B51C4CFFD8887FD9D1C8">
  <TABLE><TR><TD valign=top class='cell_0'>
    <p>Стоимость колодца рассчитывается по формуле
    <m:math><m:mstyle displaystyle="true"><m:semantics><m:mrow>
      <m:mi>C</m:mi><m:mo>=</m:mo><m:mn>6500</m:mn><m:mo>+</m:mo><m:mn>4000</m:mn><m:mi>n</m:mi>
    </m:mrow></m:semantics></m:mstyle></m:math>.
    Пользуясь этой формулой, рассчитайте стоимость колодца из 11 колец.</p>
    <table><tr><td>вложенная</td><td>таблица</td></tr></table>
  </TD></TR>
  <TR bgcolor="#FFFFFF"><TD><TABLE class='submit-outblock'></TABLE></TD></TR></TABLE>
  </form>
</div>
<div id='i041048'>
  <div class="task-info-content"><table><tbody>
    <tr><td class="param-name">КЭС:</td><td class="param-row"><div>2.1 Буквенные выражения</div></td></tr>
    <tr><td class="param-name">Тип ответа:</td><td>Краткий ответ</td></tr>
  </tbody></table></div>
  <div class="id-text">Номер: <span class="canselect">041048</span></div>
</div>
<div class="qblock" id='q4F5745'>
  <form id='checkform4F5745'>
  <input type="Hidden" name="guid" value="0088136AD101954045CAED9DA7A77650">
  <script>ShowPictureQ('docs/DE0E276E497AB3784C3FC4CC20248DC0/questions/0088136AD101954045CAED9DA7A77650/xs3qstsrc0088_1_1485782157.png','рисунок')</script>
  <TABLE><TR><TD class='cell_0'>
    <p>На клетчатой бумаге с размером клетки 1&times;1 изображён треугольник. Найдите его площадь.</p>
  </TD></TR>
  <TR bgcolor="#FFFFFF"><TD></TD></TR></TABLE>
  </form>
</div>
<div id='i4F5745'>
  <div class="task-info-content"><table><tbody>
    <tr><td class="param-name">КЭС:</td><td class="param-row"><div>7.5 Измерение геометрических величин</div></td></tr>
    <tr><td class="param-name">Тип ответа:</td><td>Краткий ответ</td></tr>
  </tbody></table></div>
  <div class="id-text">Номер: <span class="canselect">4F5745</span></div>
</div>
"""


class MathMLTests(unittest.TestCase):
    def test_operators_and_structure(self) -> None:
        cases = {
            "<m:mrow><m:mi>C</m:mi><m:mo>=</m:mo><m:mn>65</m:mn></m:mrow>": "C=65",
            "<m:msqrt><m:mn>144</m:mn></m:msqrt>": r"\sqrt{144}",
            "<m:mfrac><m:mn>3</m:mn><m:mn>10</m:mn></m:mfrac>": r"\frac{3}{10}",
            "<m:msup><m:mi>x</m:mi><m:mn>2</m:mn></m:msup>": "x^2",
            "<m:msub><m:mi>a</m:mi><m:mn>12</m:mn></m:msub>": "a_{12}",
        }
        for fragment, expected in cases.items():
            self.assertEqual(mathml_to_latex(MATH.format(fragment)), expected)

    def test_dot_operator_becomes_cdot(self) -> None:
        latex = mathml_to_latex(MATH.format("<m:mrow><m:mn>2</m:mn><m:mo>&#x22C5;</m:mo><m:mn>3</m:mn></m:mrow>"))
        self.assertIn(r"\cdot", latex)

    def test_bare_punctuation_is_not_wrapped_in_math(self) -> None:
        # The bank wraps even a lone dash in <m:math>; `$—$` in prose is wrong.
        rendered = inline_math("где " + MATH.format("<m:mo>&#x2014;</m:mo>") + " число колец")
        self.assertNotIn("$", rendered)
        self.assertIn("—", rendered)

    def test_variables_stay_in_math_mode(self) -> None:
        self.assertEqual(inline_math(MATH.format("<m:mi>n</m:mi>")), "$n$")

    def test_inequalities_survive_the_tag_stripper(self) -> None:
        # `<` and `>` come out of MathML as bare characters. Left alone, the
        # HTML tag stripper that runs afterwards eats `<0$ , $c>` as a tag and
        # the inequality disappears from the statement.
        less = MATH.format("<m:mrow><m:mi>a</m:mi><m:mo>&#x003C;</m:mo><m:mn>0</m:mn></m:mrow>")
        rendered = to_text(f"<p>Знак: {less}, далее</p>")
        self.assertIn("a", rendered)
        self.assertIn("0", rendered)
        self.assertIn("далее", rendered)
        self.assertNotIn("<", rendered)

    def test_malformed_input_degrades_to_text(self) -> None:
        self.assertEqual(mathml_to_latex("<m:math><m:mi>x</m:mi>"), "x")


class ParseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tasks = parse_page(QBLOCK, 0)

    def test_finds_every_block(self) -> None:
        self.assertEqual(len(self.tasks), 2)

    def test_reads_guid_and_short_id(self) -> None:
        self.assertEqual(self.tasks[0].guid, "02F5026F38D4B51C4CFFD8887FD9D1C8")
        self.assertEqual(self.tasks[0].short_id, "041048")

    def test_nested_table_stays_inside_the_statement(self) -> None:
        # A non-greedy `</TD>` match would truncate the statement here.
        self.assertIn("вложенная", self.tasks[0].statement_text)
        self.assertIn("Пользуясь этой формулой", self.tasks[0].statement_text)

    def test_mathml_is_converted_in_the_statement(self) -> None:
        self.assertIn("$C=6500+4000n$", self.tasks[0].statement_text)
        self.assertNotIn("m:math", self.tasks[0].statement_text)

    def test_image_comes_from_the_javascript_call(self) -> None:
        # There is no <img> tag anywhere in the fixture.
        self.assertNotIn("<img", QBLOCK.lower())
        self.assertEqual(len(self.tasks[1].images), 1)
        self.assertTrue(self.tasks[1].images[0].endswith("_1_1485782157.png"))
        self.assertEqual(self.tasks[1].picture_fns, ["ShowPictureQ"])

    def test_metadata(self) -> None:
        self.assertEqual(self.tasks[0].kes_codes, ["2.1"])
        self.assertEqual(self.tasks[0].kes_titles, ["Буквенные выражения"])
        self.assertEqual(self.tasks[0].answer_kind, "short")

    def test_entities_are_unescaped(self) -> None:
        self.assertIn("1×1", self.tasks[1].statement_text)

    def test_to_text_drops_scripts(self) -> None:
        self.assertNotIn("ShowPictureQ", to_text("<script>ShowPictureQ('a')</script><p>текст</p>"))


class InlineFormulaTests(unittest.TestCase):
    """ФИПИ drew part of some conditions instead of writing them."""

    #: A Word export: the picture is written from JavaScript inside a span that
    #: nudges it onto the text baseline.
    DRAWN = (
        "<p>Диагональ ромба равна 28, а "
        "<span style=\"position:relative;top:3.0pt\"><script language=\"JavaScript\">"
        "ShowPictureQ(\"docs/PROJ/questions/GUID/innerimg2.gif\",\"\");"
        "</script></span>. Найдите площадь ромба.</p>"
    )
    #: The task's own diagram: same call, but standing on its own.
    DIAGRAM = (
        "<p>Найдите площадь.</p><p align=right><script language=\"JavaScript\">"
        "ShowPictureQ(\"docs/PROJ/questions/GUID/innerimg3.gif\",\"\");</script></p>"
    )

    def test_the_formula_returns_to_its_place_in_the_sentence(self) -> None:
        # Without this the statement reads «равна 28, а . Найдите площадь» and
        # the task cannot be solved at all.
        text = to_text(self.DRAWN)
        self.assertIn("равна 28, а ![](docs/PROJ/questions/GUID/innerimg2.gif). Найдите", text)

    def test_a_standalone_drawing_stays_out_of_the_text(self) -> None:
        # It belongs in the gallery beside the task, not inside the sentence.
        self.assertNotIn("![]", to_text(self.DIAGRAM))

    def test_inline_paths_are_reported_separately(self) -> None:
        self.assertEqual(
            parse.inline_picture_paths(self.DRAWN),
            ["docs/PROJ/questions/GUID/innerimg2.gif"],
        )
        self.assertEqual(parse.inline_picture_paths(self.DIAGRAM), [])

    #: No nudge, no `innerimg` name — but the picture stands between two words,
    #: so it is part of the sentence: «на прямой отмечены числа ▩ и ▩».
    IN_SENTENCE = (
        "<p>На координатной прямой отмечены числа "
        "<span><script language=\"JavaScript\">"
        "ShowPictureQ('docs/PROJ/questions/GUID/xs3qstsrcGUID_6_1734423599.png');"
        "</script></span>&nbsp;и "
        "<span><script language=\"JavaScript\">"
        "ShowPictureQ('docs/PROJ/questions/GUID/xs3qstsrcGUID_7_1734423599.png');"
        "</script></span>.</p>"
    )
    #: A Word fragment alone on its line: the equation itself, drawn.
    ALONE_IN_SPAN = (
        "<p>Решите уравнение</p><p><span lang=EN-US><script language=\"JavaScript\">"
        "ShowPictureQ(\"docs/PROJ/questions/GUID/innerimg0.gif\",\"\");"
        "</script></span></p>"
    )
    #: The number line ФИПИ ships as the question's own picture. Same shape as
    #: the fragment above, and it must stay in the gallery all the same.
    NUMBER_LINE = (
        "<p>Какое из чисел отмечено точкой?</p><p><span><script language=\"JavaScript\">"
        "ShowPictureQ(\"docs/PROJ/questions/GUID/xs3qstsrcGUID_1_1455809602.png\",\"\");"
        "</script></span></p>"
    )

    def test_a_picture_between_words_joins_the_sentence(self) -> None:
        # 80 tasks name their numbers only in 15x16 pictures, and ФИПИ files
        # those under the ordinary diagram name — the wrapper says nothing.
        text = to_text(self.IN_SENTENCE)
        self.assertIn("отмечены числа ![](docs/PROJ/questions/GUID/xs3qstsrcGUID_6", text)
        self.assertEqual(len(parse.inline_picture_paths(self.IN_SENTENCE)), 2)

    def test_a_word_fragment_in_a_span_is_a_formula_even_when_alone(self) -> None:
        # «Решите уравнение» followed by nothing is not a task.
        self.assertIn("![](docs/PROJ/questions/GUID/innerimg0.gif)", to_text(self.ALONE_IN_SPAN))

    #: The shared block of a group names its pictures without a directory and
    #: sets `files_location` once, above them.
    SHARED_BLOCK = (
        "<script>files_location='../../docs/PROJ/docs/DOCGUID/';</script>"
        "<p>Шина с маркировкой 195/65 R15 имеет ширину "
        "<span><script language=\"JavaScript\">ShowPicture('inner13.png');</script></span>"
        " мм.</p>"
    )

    def test_a_bare_filename_is_resolved_against_files_location(self) -> None:
        # The gallery stores the full path; an inline path that does not match
        # it cannot be taken out of the gallery, and the formula shows twice.
        full = "docs/PROJ/docs/DOCGUID/inner13.png"
        self.assertEqual(parse.inline_picture_paths(self.SHARED_BLOCK), [full])
        self.assertIn(f"![]({full})", to_text(self.SHARED_BLOCK))

    def test_a_wrapped_diagram_still_stays_in_the_gallery(self) -> None:
        # Only the `innerimg` name separates this from the case above.
        self.assertNotIn("![]", to_text(self.NUMBER_LINE))
        self.assertEqual(parse.inline_picture_paths(self.NUMBER_LINE), [])


class TableTests(unittest.TestCase):
    """The practical block keeps its data in tables; the grid is the task."""

    TYRES = (
        "<table><tr><td rowspan=2>Ширина шины (мм)</td><td colspan=3>Диаметр диска</td></tr>"
        "<tr><td>16</td><td>17</td><td>18</td></tr>"
        "<tr><td>215</td><td>215/65</td><td>215/60</td><td>&mdash;</td></tr></table>"
    )

    def test_renders_a_markdown_grid(self) -> None:
        rendered = to_text(self.TYRES)
        self.assertIn("|---|---|---|---|", rendered)
        self.assertTrue(all(line.startswith("|") for line in rendered.splitlines() if line.strip()))

    def test_rowspan_keeps_columns_aligned(self) -> None:
        # Without rowspan carry-over the "16 17 18" row shifts one column left
        # and every size pairs with the wrong disc diameter.
        rows = [line for line in to_text(self.TYRES).splitlines() if line.startswith("|")]
        header, _separator, sizes, data = rows
        self.assertEqual(len(header.split("|")), len(sizes.split("|")))
        self.assertEqual(sizes.split("|")[2].strip(), "16")
        self.assertEqual(data.split("|")[2].strip(), "215/65")

    def test_colspan_is_expanded(self) -> None:
        header = to_text(self.TYRES).splitlines()[0]
        self.assertEqual(header.count("Диаметр диска"), 3)

    def test_pipes_inside_cells_are_escaped(self) -> None:
        rendered = to_text("<table><tr><td>a|b</td><td>c</td></tr></table>")
        self.assertIn(r"a\|b", rendered)

    def test_nested_tables_do_not_break_the_outer_grid(self) -> None:
        rendered = to_text("<table><tr><td><table><tr><td>x</td></tr></table></td><td>y</td></tr></table>")
        self.assertIn("y", rendered)
        self.assertIn("x", rendered)

    def test_empty_layout_tables_are_dropped(self) -> None:
        # ФИПИ wraps pictures and whole statements in tables that hold nothing;
        # rendering them left `| | |---|` in the middle of 1093 statements.
        self.assertEqual(
            to_text("<table><tr><td></td><td></td></tr></table><p>Найдите угол.</p>"),
            "Найдите угол.",
        )

    def test_single_cell_wrapper_is_unwrapped(self) -> None:
        self.assertEqual(to_text("<table><tr><td>Найдите угол.</td><td></td></tr></table>"), "Найдите угол.")

    def test_empty_columns_are_stripped_but_the_grid_survives(self) -> None:
        rendered = to_text(
            "<table><tr><td>a</td><td></td><td>b</td></tr><tr><td>1</td><td></td><td>2</td></tr></table>"
        )
        self.assertIn("| a | b |", rendered)
        self.assertIn("| 1 | 2 |", rendered)

    def test_table_free_text_is_untouched(self) -> None:
        self.assertEqual(to_text("<p>Решите уравнение.</p>"), "Решите уравнение.")


class SolverTests(unittest.TestCase):
    """Arithmetic that can be evaluated outright, so ФИПИ only has to confirm it."""

    CASES = {
        r"Найдите значение выражения $\frac{21}{5}\cdot \frac{3}{7}$.": "1.8",
        r"Найдите значение выражения $\frac{1}{5}-\frac{41}{50}$.": "-0.62",
        r"Найдите значение выражения $a^8\cdot a^{17}:a^{20}$ при $a=2$.": "32",
        r"Найдите значение выражения $\frac{\sqrt{51}\cdot \sqrt{12}}{\sqrt{17}}$.": "6",
        r"Найдите значение выражения ${(\sqrt{11}+3)}^2-6\sqrt{11}$.": "20",
        r"Найдите значение выражения $\frac{{(4\sqrt{3})}^2}{60}$.": "0.8",
        r"Найдите значение выражения $\frac{{(a^7)}^2}{a^{12}}$ при $a=5$.": "25",
        "Найдите значение выражения 6,9+7,4.": "14.3",
    }

    def test_evaluates_the_supported_forms(self) -> None:
        for statement, expected in self.CASES.items():
            self.assertEqual(solve_statement(statement), expected, statement)

    def test_nested_braces_inside_a_fraction(self) -> None:
        # `[^{}]*` cannot express this, which is why the parser counts braces.
        self.assertEqual(solve_statement(r"Найдите значение выражения $\frac{{(2+3)}^2}{5}$."), "5")

    def test_returns_none_for_anything_it_cannot_evaluate(self) -> None:
        for statement in [
            "В магазине 40% товаров со скидкой. Сколько это в штуках?",
            "Решите уравнение x^2 = 16.",
            r"Найдите значение выражения $\lim_{x \to 0} x$.",
        ]:
            self.assertIsNone(solve_statement(statement))

    def test_integral_results_lose_the_decimal_tail(self) -> None:
        self.assertEqual(format_answer(20.0000000001), "20")
        self.assertEqual(format_answer(1.8), "1.8")


class EquationTests(unittest.TestCase):
    """Linear and quadratic roots, read off a polynomial fit rather than parsed."""

    def test_picks_the_requested_root(self) -> None:
        smaller = r"Решите уравнение $x^2-9x+18=0$. Если уравнение имеет более одного корня, в ответ запишите меньший из корней."
        larger = smaller.replace("меньший", "больший")
        self.assertEqual(solve_equation(smaller), "3")
        self.assertEqual(solve_equation(larger), "6")

    def test_linear_equation(self) -> None:
        self.assertEqual(solve_equation(r"Найдите корень уравнения $10(x-9)=7$."), "9.7")

    def test_root_at_zero_is_not_mistaken_for_no_root(self) -> None:
        self.assertEqual(
            solve_equation(r"Решите уравнение $10x^2=80x$. Если уравнение имеет более одного корня, в ответ запишите меньший из корней."),
            "0",
        )

    def test_rejects_what_it_cannot_fit(self) -> None:
        # A cubic passes the sampling but fails the fourth-point check.
        self.assertIsNone(
            solve_equation(r"Решите уравнение $x^3-8=0$. Если уравнение имеет более одного корня, в ответ запишите меньший из корней.")
        )

    def test_rejects_an_irrational_root(self) -> None:
        self.assertIsNone(solve_equation(r"Найдите корень уравнения $x^2=2$."))


class FormulaTests(unittest.TestCase):
    """«Расчёты по формуле»: letters are matched to the prose, not assumed."""

    POWER = (
        "Мощность постоянного тока (в ваттах) вычисляется по формуле $P=I^2R$, "
        "где $I$ — сила тока (в амперах), $R$ — сопротивление (в омах). "
        "Пользуясь этой формулой, найдите сопротивление $R$, если мощность "
        "составляет 180 Вт, а сила тока равна 6 А. Ответ дайте в омах."
    )
    WELL = (
        "В фирме «Родник» стоимость (в рублях) колодца из железобетонных колец "
        "рассчитывается по формуле $C=6000+4100n$, где $n$ — число колец, "
        "установленных в колодце. Пользуясь этой формулой, рассчитайте стоимость "
        "колодца из 20 колец. Ответ дайте в рублях."
    )

    def test_solves_for_a_letter_inside_the_formula(self) -> None:
        self.assertEqual(solve_formula(self.POWER), "5")

    def test_evaluates_the_left_hand_side(self) -> None:
        self.assertEqual(solve_formula(self.WELL), "88000")

    def test_the_asked_for_quantity_never_takes_a_value(self) -> None:
        # «рассчитайте стоимость колодца из 20 колец» names the unknown in the
        # same breath as the given number; a wide match reads 20 as the cost.
        self.assertNotEqual(solve_formula(self.WELL), "20")

    def test_units_and_greek_do_not_stop_the_translation(self) -> None:
        # `\text{…}` holds the units and `\omega` the quantity; both used to
        # make the formula untranslatable and the whole family unreachable.
        self.assertEqual(
            solve_formula(
                "Центростремительное ускорение при движении по окружности вычисляется по "
                "формуле $a={\\text{ω}}^2R$, где $\\text{ω}$ — угловая скорость, "
                "$R$ — радиус окружности (в метрах). Пользуясь этой формулой, найдите "
                "радиус $R$, если угловая скорость равна $9{\\text{с}}^{-1}$, "
                "а центростремительное ускорение равно $243\\text{м}$."
            ),
            "3",
        )

    def test_a_value_stated_as_an_equation_is_read_as_one(self) -> None:
        # `$\sin α=3/7$` is a given number, not something to compute, and the
        # subscript of `$d_2$` is a name rather than the value 2.
        self.assertEqual(
            solve_formula(
                "Площадь четырёхугольника можно вычислить по формуле "
                "$S=\\frac{d_1d_2\\sin \\text{α}}{2}$, где $d_1$ и $d_2$ — длины "
                "диагоналей четырёхугольника, $\\text{α}$ — угол между диагоналями. "
                "Пользуясь этой формулой, найдите длину диагонали $d_2$, если $d_1=6$, "
                "$\\sin \\text{α}=\\frac{3}{7}$, a $S=18$."
            ),
            "14",
        )

    def test_one_description_can_cover_two_letters(self) -> None:
        # «где $d_1$ и $d_2$ — длины диагоналей»: the dash follows the second
        # letter, and the first is left with no description at all. Then the
        # unknown cannot be picked by words, so the statement names it —
        # «найдите длину диагонали $d_1$».
        statement = (
            "Площадь четырёхугольника можно вычислить по формуле "
            "$S=\\frac{d_1d_2\\sin \\text{α}}{2}$, где $d_1$ и $d_2$ — длины "
            "диагоналей четырёхугольника, $\\text{α}$ — угол между диагоналями. "
            "Пользуясь этой формулой, найдите длину диагонали $d_1$, если "
            "$d_2=16$, $\\sin \\text{α}=\\frac{5}{8}$, a $S=45$."
        )
        self.assertEqual(solve_formula(statement), "9")

    def test_ignores_a_statement_without_a_formula(self) -> None:
        self.assertIsNone(solve_formula("Найдите площадь треугольника со стороной 5."))


class ProbabilityTests(unittest.TestCase):
    def test_templated_shapes(self) -> None:
        cases = {
            "У бабушки 20 чашек: 10 с красными цветами, остальные с синими. Найдите вероятность того, что это будет чашка с синими цветами.": "0.5",
            "На экзамене 20 билетов, Оскар не выучил 7 из них. Найдите вероятность того, что ему попадётся выученный билет.": "0.65",
            "Вероятность того, что новая шариковая ручка пишет плохо (или не пишет), равна 0,02. Найдите вероятность того, что эта ручка пишет хорошо.": "0.98",
        }
        for statement, expected in cases.items():
            self.assertEqual(solve_probability(statement), expected, statement[:40])

    def test_leftover_splits_evenly_between_two_colours(self) -> None:
        statement = (
            "В магазине канцтоваров продаётся 206 ручек: 20 красных, 8 зелёных, "
            "12 фиолетовых, остальные синие и чёрные, их поровну. Найдите вероятность "
            "того, что случайно выбранная в этом магазине ручка будет красной или синей."
        )
        self.assertEqual(solve_probability(statement), "0.5")

    def test_the_numeral_agrees_with_the_count(self) -> None:
        # «165 ручек», «144 ручки», «84 ручки, из них» — one shape, three
        # endings and two ways of opening the list.
        for opening in ("144 ручки:", "144 ручки, из них"):
            statement = (
                f"В магазине канцтоваров продаётся {opening} 30 красных, 24 зелёных, "
                "18 фиолетовых, остальные синие и чёрные, их поровну. Найдите вероятность "
                "того, что случайно выбранная в этом магазине ручка будет синей или чёрной."
            )
            self.assertEqual(solve_probability(statement), "0.5", opening)

    def test_a_country_the_question_rules_out(self) -> None:
        # «не из России» asks for the complement, and the bank writes both.
        statement = (
            "В лыжных гонках участвуют 13 спортсменов из России, 2 спортсмена "
            "из Норвегии и 5 спортсменов из Швеции. Порядок, в котором спортсмены "
            "стартуют, определяется жребием. Найдите вероятность того, что первым "
            "будет стартовать спортсмен {}."
        )
        self.assertEqual(solve_probability(statement.format("не из России")), "0.35")
        self.assertEqual(solve_probability(statement.format("из России")), "0.65")

    def test_a_coin_already_thrown(self) -> None:
        # The throw the question names does not matter: 20 throws with 9 heads
        # leave 11 tails, and any one of the 20 is equally likely to be one.
        self.assertEqual(
            solve_probability(
                "Монету бросили 20 раз. Известно, что орёл выпал 9 раз. Найдите "
                "вероятность того, что при десятом по счёту броске выпала решка."
            ),
            "0.55",
        )

    def test_counts_written_as_words(self) -> None:
        self.assertEqual(
            solve_probability("В среднем из 80 карманных фонариков, поступивших в продажу, "
                              "двенадцать неисправных. Найдите вероятность того, что "
                              "выбранный наудачу в магазине фонарик окажется исправен."),
            "0.85",
        )

    def test_a_condition_removes_one_from_the_box(self) -> None:
        self.assertEqual(
            solve_probability("Из ящика, где хранятся 7 жёлтых и 14 зелёных карандашей, "
                              "не глядя достали два карандаша. Известно, что первый карандаш "
                              "оказался зелёным. Найдите вероятность того, что второй "
                              "карандаш тоже оказался зелёным."),
            "0.65",
        )

    def test_dice_outcomes_are_counted_not_guessed(self) -> None:
        self.assertEqual(
            solve_probability("Симметричный игральный кубик бросают два раза. Найдите "
                              "вероятность события «сумма выпавших очков равна 3, 4 или 5»."),
            "0.25",
        )

    def test_returns_none_for_an_unknown_shape(self) -> None:
        self.assertIsNone(solve_probability("Найдите вероятность попадания в мишень трижды подряд."))


class SpecificationTests(unittest.TestCase):
    """The inverted specification table, `config.slots_for_kes`.

    Positions 1–4 are assigned the whole codifier (КЭС 1–8) by the
    specification, so every code matches them. That is why `classify` drops
    them whenever a position above 5 also matches — otherwise the practical
    block would swallow every question in the bank.
    """

    def test_practical_block_matches_any_code(self) -> None:
        self.assertEqual(
            [slot.number for slot in slots_for_kes("4", part=1)], [1, 2, 3, 4, 14]
        )

    def test_kes_4_is_the_only_specific_position_for_sequences(self) -> None:
        specific = [slot.number for slot in slots_for_kes("4", part=1) if slot.number > 5]
        self.assertEqual(specific, [14])

    def test_kes_5_splits_by_part(self) -> None:
        part1 = [slot.number for slot in slots_for_kes("5", part=1) if slot.number > 5]
        self.assertEqual(part1, [11])
        # Part 2 has no practical block, so nothing needs filtering there.
        self.assertEqual([slot.number for slot in slots_for_kes("5", part=2)], [22])

    def test_subtheme_code_resolves_through_its_section(self) -> None:
        specific = [slot.number for slot in slots_for_kes("8.2", part=1) if slot.number > 4]
        self.assertEqual(specific, [5, 10])


class ClassifyTests(unittest.TestCase):
    def test_squared_paper_is_position_18(self) -> None:
        verdict = classify("На клетчатой бумаге с размером клетки 1×1 изображён треугольник.", "short", ["7.5"])
        self.assertEqual(verdict.number, 18)
        self.assertEqual(verdict.confidence, CERTAIN)

    def test_true_statement_stem_is_position_19(self) -> None:
        verdict = classify("Какое из следующих утверждений является истинным высказыванием?", "select_one", ["7"])
        self.assertEqual(verdict.number, 19)

    def test_formula_stem_is_position_12(self) -> None:
        verdict = classify("Пользуясь этой формулой, рассчитайте стоимость.", "short", ["2.1"])
        self.assertEqual(verdict.number, 12)

    def test_matching_answer_kind_is_position_11(self) -> None:
        verdict = classify("Установите соответствие между функциями и их графиками.", "match", ["5.1"])
        self.assertEqual(verdict.number, 11)
        self.assertEqual(verdict.confidence, CERTAIN)

    def test_subthemes_split_equations_from_inequalities(self) -> None:
        self.assertEqual(classify("Решите уравнение x²−144=0.", "short", ["3.1"]).number, 9)
        self.assertEqual(classify("Укажите решение системы неравенств.", "select_one", ["3.2"]).number, 13)

    def test_answer_kind_moves_functions_into_part_two(self) -> None:
        self.assertEqual(classify("Дана функция y=kx+b.", "short", ["5.1"]).number, 11)
        self.assertEqual(classify("Исследуйте функцию и обоснуйте.", "full", ["5.1"]).number, 22)

    def test_circle_subtheme_is_position_16(self) -> None:
        self.assertEqual(classify("Найдите длину хорды.", "short", ["7.4"]).number, 16)

    def test_practical_block_is_reported_as_a_block(self) -> None:
        verdict = classify("Сколько миллиметров составляет высота боковины шины?", "short", ["3.3"])
        self.assertIsNone(verdict.number)
        self.assertEqual(verdict.confidence, AMBIGUOUS)
        self.assertEqual(verdict.candidates, [1, 2, 3, 4, 5])

    def test_part_two_geometry_separates_only_the_proof(self) -> None:
        self.assertEqual(classify("Докажите, что AB = CD.", "full", ["7.2"]).number, 24)
        undecided = classify("Найдите высоту ромба ABCD.", "full", ["7.2"])
        self.assertIsNone(undecided.number)
        self.assertEqual(undecided.candidates, [23, 25])

    def test_the_circle_decides_when_a_figure_is_drawn_inside_it(self) -> None:
        # Both subthemes are tagged, so the vote ties; the bank's own answer to
        # that tie is 16, whichever figure the circle is wrapped around.
        trapezoid = classify(
            "Угол $A$ трапеции $ABCD$, вписанной в окружность, равен 59°. Найдите угол $B$.",
            "short",
            ["7.3", "7.4", "7.5"],
        )
        self.assertEqual(trapezoid.number, 16)
        triangle = classify(
            "Сторона равностороннего треугольника равна $8\\sqrt{3}$. Найдите радиус описанной окружности.",
            "short",
            ["7.2", "7.4", "7.5"],
        )
        self.assertEqual(triangle.number, 16)

    def test_without_a_circle_the_figure_itself_decides(self) -> None:
        self.assertEqual(
            classify(
                "В равнобедренной трапеции известна высота, большее основание и угол при основании. Найдите меньшее основание.",
                "short",
                ["7.2", "7.3"],
            ).number,
            17,
        )
        self.assertEqual(
            classify(
                "В треугольнике $ABC$ известно, что $AB=12$, $BC=15$, $\\sin \\angle ABC=\\frac{4}{9}$. Найдите площадь треугольника.",
                "short",
                ["7.5"],
            ).number,
            15,
        )

    def test_the_number_line_is_position_7_however_it_is_asked(self) -> None:
        self.assertEqual(classify("Между какими числами заключено число $\\sqrt{73}$?", "select_one", ["1.4", "2.5"]).number, 7)
        self.assertEqual(
            classify(
                "На координатной прямой точки $A$, $B$, $C$ и $D$ соответствуют числам 0,0137; 0,103; 0,03; 0,021. Какой точке соответствует число 0,03?",
                "select_one",
                ["1.3", "6.1"],
            ).number,
            7,
        )

    def test_an_inequality_read_off_a_picture_is_still_position_13(self) -> None:
        self.assertEqual(classify("Укажите неравенство, решение которого изображено на рисунке.", "select_one", ["3.2", "6.1"]).number, 13)

    def test_unknown_metadata_is_unresolved_not_guessed(self) -> None:
        verdict = classify("Некоторый текст без признаков.", "short", [])
        self.assertIsNone(verdict.number)


class PracticalBlockTests(unittest.TestCase):
    """Reading the 1–5 position out of the group ФИПИ flattened."""

    @staticmethod
    def _group(intro: str, statements: list[str]) -> list[dict]:
        return [
            {"guid": f"g{index}", "group_position": index, "group_intro": intro, "statement_text": text}
            for index, text in enumerate(statements, start=1)
        ]

    def test_a_group_of_five_is_the_exam_order_itself(self) -> None:
        group = self._group(
            "Прочитайте внимательно текст и выполните задания 1–5. На плане изображён дачный участок.",
            [
                "Для объектов, указанных в таблице, определите, какими цифрами они обозначены на плане.",
                "Плитки продаются в упаковках по 10 штук. Сколько упаковок понадобилось?",
                "Найдите площадь, которую занимает баня. Ответ дайте в квадратных метрах.",
                "Сколько процентов площади всего участка занимает сарай?",
                "Хозяин планирует установить систему отопления. Он рассматривает два варианта.",
            ],
        )
        numbers = numbers_for_group(group)
        self.assertEqual([numbers[f"g{i}"][0] for i in range(1, 6)], [1, 2, 3, 4, 5])

    def test_parallel_variants_come_in_blocks(self) -> None:
        # Ten questions are two variants of one story: ФИПИ lists the first
        # question of both, then the second of both, and so on.
        statements = []
        for text in (
            "Для объектов, указанных в таблице, определите, какими цифрами они обозначены на плане.",
            "Плитки продаются в упаковках. Сколько упаковок понадобилось?",
            "Найдите площадь бани. Ответ дайте в квадратных метрах.",
            "Сколько процентов площади всего участка занимает сарай?",
            "Хозяин рассматривает два варианта отопления.",
        ):
            statements += [text, text]
        numbers = numbers_for_group(self._group("Прочитайте внимательно текст.", statements))
        self.assertEqual([numbers[f"g{i}"][0] for i in range(1, 11)], [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])

    def test_a_shuffled_group_is_read_by_what_the_questions_ask(self) -> None:
        # The group of 40 built around a plan of a flat is not in order at all:
        # the position rule would call the parquet question number 1.
        group = self._group(
            "Прочитайте внимательно текст и выполните задания 1–5. На рисунке изображён план двухкомнатной квартиры.",
            [
                "Паркетная доска размером 20 см на 80 см продаётся в упаковках по 14 штук. Сколько упаковок?",
                "Для объектов, указанных в таблице, определите, какими цифрами они обозначены на плане.",
                "Найдите площадь кладовой. Ответ дайте в квадратных метрах.",
                "На сколько процентов площадь гостиной больше площади кладовой?",
                "В квартире планируется установить стиральную машину.",
            ],
        )
        numbers = numbers_for_group(group)
        self.assertEqual([numbers[f"g{i}"][0] for i in range(1, 6)], [2, 1, 3, 4, 5])

    def test_a_group_that_explains_neither_keeps_only_its_anchor(self) -> None:
        # Order broken and no scenario to fall back on: the matching question is
        # still number 1, and the rest waits rather than takes a guessed number.
        group = self._group(
            "Прочитайте внимательно текст. Хозяин дачного участка строит баню.",
            [
                "Найдите радиус закругления арки в сантиметрах.",
                "Установите соответствие между массами и номерами печей.",
                "Найдите радиус закругления арки в сантиметрах.",
                "Установите соответствие между стоимостями и номерами печей.",
                "Найдите объём парного отделения строящейся бани.",
            ],
        )
        numbers = numbers_for_group(group)
        self.assertEqual(sorted(numbers), ["g2", "g4"])
        self.assertEqual({value[0] for value in numbers.values()}, {1})


class TranscribedPictureTests(unittest.TestCase):
    """What ФИПИ drew instead of writing, read once into `inline_math.json`."""

    def test_a_drawn_equation_is_solved_not_looked_up(self) -> None:
        # The transcription carries the equation; the root is still computed,
        # so a misread digit costs a rejected candidate rather than a wrong key.
        self.assertEqual(
            solve_equation("Решите уравнение .", "D6F84B"),  # 7x-7=19+5x
            "13",
        )
        self.assertIsNone(solve_equation("Решите уравнение ."))

    def test_a_euler_diagram_is_four_weights_and_an_event(self) -> None:
        statement = ("На рисунке изображена диаграмма Эйлера для случайных событий и в "
                     "некотором случайном опыте. Найдите вероятность события .")
        # regions 1,3,4,2 with the event «not (A or B)» — only the outside dot.
        self.assertEqual(solve_probability(statement, "D1E728"), "0.1")
        # The same diagram, the union instead.
        self.assertEqual(solve_probability(statement, "9140A5"), "0.9")

    def test_a_tree_reduces_to_the_same_four_regions(self) -> None:
        statement = "На рисунке изображено дерево случайного опыта. Найдите вероятность события ."
        # P(A)=0,25, P(B|A)=0,375, P(B|Ā)=0,875 → P(B) = 0,09375 + 0,65625.
        self.assertEqual(solve_probability(statement, "3E7FF9"), "0.75")

    def test_an_unknown_task_gets_nothing_from_the_table(self) -> None:
        self.assertIsNone(solve_probability("Найдите вероятность события .", "НЕТТАКОГО"))


class SequenceTests(unittest.TestCase):
    """Task 14 tells a story and leaves the progression to the reader."""

    def test_sum_of_the_first_seconds(self) -> None:
        self.assertEqual(
            solve_sequence("Поезд начал движение от станции. За первую секунду состав "
                           "сдвинулся на 0,6 м, а за каждую следующую секунду он проходил "
                           "на 0,1 м больше, чем за предыдущую. Сколько метров состав "
                           "прошёл за первые 7 секунд движения?"),
            "6.3",
        )

    def test_braking_counts_its_own_terms(self) -> None:
        # «до полной остановки» gives no number of seconds: the car stops when
        # a second would carry it nowhere, and that count is the answer's half.
        self.assertEqual(
            solve_sequence("Водитель автомобиля начал торможение. За секунду после начала "
                           "торможения автомобиль проехал 20 м, а за каждую следующую "
                           "секунду он проезжал на 4 м меньше, чем за предыдущую. Сколько "
                           "метров автомобиль прошёл до полной остановки?"),
            "60",
        )

    def test_two_rows_give_the_step(self) -> None:
        self.assertEqual(
            solve_sequence("В амфитеатре 14 рядов, причём в каждом следующем ряду на одно "
                           "и то же число мест больше, чем в предыдущем. В пятом ряду 27 "
                           "мест, а в восьмом ряду 36 мест. Сколько мест в последнем ряду "
                           "амфитеатра?"),
            "54",
        )

    def test_the_answer_can_be_an_index(self) -> None:
        # The threshold is in centimetres while the heights are in metres.
        self.assertEqual(
            solve_sequence("Каучуковый мячик с силой бросили на асфальт. Отскочив, мячик "
                           "подпрыгнул на 4 м, а при каждом следующем прыжке он поднимался "
                           "на высоту в два раза меньше предыдущей. При каком по счёту "
                           "прыжке мячик в первый раз не достигнет высоты 20 см?"),
            "6",
        )

    def test_a_story_it_does_not_know_is_left_alone(self) -> None:
        self.assertIsNone(solve_sequence("В корзине лежат яблоки. Сколько их?"))


class PhysicsTests(unittest.TestCase):
    """Task 12 families whose formula is a picture but whose name is not."""

    def test_kinetic_energy_from_the_name_of_the_quantity(self) -> None:
        self.assertEqual(
            solve_physics("Кинетическая энергия тела массой кг, двигающегося со скоростью , "
                          "вычисляется по формуле и измеряется в джоулях (Дж). Известно, что "
                          "автомобиль массой 2000 кг обладает кинетической энергией 289 тысяч "
                          "джоулей. Найдите скорость этого автомобиля в метрах в секунду."),
            "17",
        )

    def test_thousands_are_not_read_as_units(self) -> None:
        self.assertIsNone(solve_physics("Кинетическая энергия. Найдите скорость."))


class GeometryTests(unittest.TestCase):
    def test_right_triangle_propagates_in_every_direction(self) -> None:
        # The same family asks for a side from a ratio and a ratio from sides.
        self.assertEqual(
            solve_geometry("В треугольнике $ABC$ угол $C$ равен 90°, $AC=16$, $AB=40$. "
                           "Найдите $\\sin B$."),
            "0.4",
        )
        self.assertEqual(
            solve_geometry("В треугольнике $ABC$ угол $C$ равен 90°, "
                           "$\\sin B=\\frac{7}{12}$, $AB=48$. Найдите $AC$."),
            "28",
        )
        self.assertEqual(
            solve_geometry("В треугольнике $ABC$ угол $C$ равен 90°, "
                           "$\\operatorname{tg} B=\\frac{3}{4}$, $BC=12$. Найдите $AC$."),
            "9",
        )

    def test_a_surd_cancels_instead_of_drifting(self) -> None:
        self.assertEqual(
            solve_geometry("Сторона квадрата равна $11\\sqrt{2}$. Найдите диагональ "
                           "этого квадрата."),
            "22",
        )

    def test_red_herrings_are_ignored(self) -> None:
        # The median's own length says nothing about the half it lands on.
        self.assertEqual(
            solve_geometry("В треугольнике $ABC$ известно, что $AC=54$, $BM$ — медиана, "
                           "$BM=43$. Найдите $AM$."),
            "27",
        )

    def test_which_lateral_side_the_diagonal_meets_changes_the_answer(self) -> None:
        near = ("В равнобедренной трапеции с основаниями $AD$ и $BC$ угол $D$ равен 64°. "
                "Диагональ $AC$ образует со стороной $AB$ угол 29°. Сколько градусов "
                "составляет угол между этой диагональю и меньшим основанием трапеции?")
        far = near.replace("стороной $AB$", "стороной $CD$")
        self.assertEqual(solve_geometry(near), "35")
        self.assertEqual(solve_geometry(far), "87")

    def test_a_drawing_only_task_is_left_alone(self) -> None:
        self.assertIsNone(solve_geometry(
            "На клетчатой бумаге с размером клетки $1\\times 1$ изображён ромб. "
            "Найдите площадь этого ромба."
        ))

    def test_a_ragged_value_is_not_worth_a_request(self) -> None:
        # 7/12 of a right angle is not what an ОГЭ answer field expects; the
        # family is real but this instance would only waste a check.
        self.assertIsNone(solve_geometry(
            "В треугольнике $ABC$ угол $C$ равен 90°, $AC=7$, $AB=12$. Найдите $\\sin B$."
        ))

    def test_math_drawn_as_a_picture_comes_from_the_transcription(self) -> None:
        # ФИПИ rendered the radius as a GIF, so the statement itself has a hole.
        broken = ("В окружность с центром в точке  вписан равносторонний треугольник. "
                  "Расстояние от точки  до сторон треугольника равно . "
                  "Найдите сторону треугольника.")
        self.assertIsNone(solve_geometry(broken))
        self.assertEqual(solve_geometry(broken, "CB2F35"), "24")


if __name__ == "__main__":
    unittest.main()


def _squared_paper(
    pitch: int = 17,
    cells: tuple[int, int] = (8, 6),
    figure: tuple[tuple[int, int], ...] = (),
    grid_tone: int = 120,
) -> Image:
    """A sheet of squared paper with a polygon drawn on it, built by hand.

    The tones mirror what ФИПИ ships: the paper's own lines are grey, the
    figure is black, and a side lying along a line is the line gone black.
    """
    width = pitch * (cells[0] - 1) + 3
    height = pitch * (cells[1] - 1) + 3
    luma = [[255] * width for _ in range(height)]
    for i in range(cells[0]):
        for y in range(height):
            luma[y][1 + i * pitch] = grid_tone
    for j in range(cells[1]):
        for x in range(width):
            luma[1 + j * pitch][x] = grid_tone

    def draw(a: tuple[int, int], b: tuple[int, int]) -> None:
        x1, y1 = 1 + a[0] * pitch, 1 + a[1] * pitch
        x2, y2 = 1 + b[0] * pitch, 1 + b[1] * pitch
        steps = max(abs(x2 - x1), abs(y2 - y1)) * 3
        for step in range(steps + 1):
            t = step / steps
            x, y = round(x1 + (x2 - x1) * t), round(y1 + (y2 - y1) * t)
            for dx, dy in ((0, 0), (1, 0)):
                if 0 <= x + dx < width and 0 <= y + dy < height:
                    luma[y + dy][x + dx] = 0

    for index in range(len(figure)):
        draw(figure[index], figure[(index + 1) % len(figure)])
    return Image(width=width, height=height, luma=luma)


class SquaredPaperTests(unittest.TestCase):
    """Reading задание 18 off the drawing, since the statement has no numbers."""

    def test_the_paper_is_found_and_then_ignored(self) -> None:
        sheet = Sheet(_squared_paper())
        grid = sheet.grid()
        self.assertIsNotNone(grid)
        assert grid is not None
        self.assertEqual(grid.size, (8, 6))
        self.assertAlmostEqual(grid.pitch_x, 17, places=1)
        # Nothing is drawn, so nothing is ink — the lines are not the figure.
        self.assertFalse(any(sheet.is_ink(x, y) for x in range(20) for y in range(20)))

    def test_a_triangle_is_measured_in_cells(self) -> None:
        sheet = Sheet(_squared_paper(figure=((1, 1), (6, 1), (1, 4))))
        figure = read_figure(sheet)
        self.assertIsNotNone(figure)
        assert figure is not None
        self.assertEqual(sorted(figure.vertices), [(1, 1), (1, 4), (6, 1)])
        self.assertEqual(figure.area(), 7.5)

    def test_a_side_along_a_paper_line_still_counts(self) -> None:
        # Both bases of this trapezoid run along grid lines, where the paper is
        # already dark; only the thickening gives them away.
        sheet = Sheet(_squared_paper(figure=((1, 4), (7, 4), (5, 1), (2, 1))))
        figure = read_figure(sheet)
        self.assertIsNotNone(figure)
        assert figure is not None
        self.assertEqual(figure.area(), 13.5)


class RasterTests(unittest.TestCase):
    def test_a_png_comes_back_as_grey(self) -> None:
        import struct
        import tempfile
        import zlib

        width = height = 2
        raw = b"".join(b"\x00" + bytes([0, 255] if y == 0 else [255, 0]) for y in range(height))

        def chunk(kind: bytes, body: bytes) -> bytes:
            return (
                struct.pack(">I", len(body))
                + kind
                + body
                + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
            )

        png = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b"")
        )
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            handle.write(png)
            path = handle.name
        image = read_png(path)
        self.assertEqual(image.luma, [[0, 255], [255, 0]])
        # The dispatcher picks the reader by what the file actually is.
        self.assertEqual(read_image(path).luma, image.luma)


class HintTests(unittest.TestCase):
    """An outside catalogue proposes; ФИПИ's checker disposes."""

    def test_a_task_is_recognised_by_its_wording(self) -> None:
        hints = [
            Hint(
                "1",
                "18",
                "Тип 18 № 1 На клетчатой бумаге с размером клетки 1×1 изображён ромб. "
                "Найдите его площадь. Ответ: 12",
                "12",
            ),
            Hint(
                "2",
                "18",
                "Тип 18 № 2 На клетчатой бумаге с размером клетки 1×1 изображена трапеция. "
                "Найдите длину её средней линии. Ответ: 5",
                "5",
            ),
        ]
        task = {
            "guid": "G",
            "oge_number": 18,
            "statement_text": "На клетчатой бумаге с размером клетки $1\\times 1$ изображён ромб. Найдите его площадь.",
        }
        self.assertEqual(match_hints([task], hints), {"G": ["12"]})

    def test_a_statement_too_short_to_identify_anything_is_left_alone(self) -> None:
        hints = [Hint("1", "15", "Тип 15 № 1 Найдите площадь. Ответ: 3", "3")]
        task = {"guid": "G", "oge_number": 15, "statement_text": "Найдите площадь."}
        self.assertEqual(match_hints([task], hints), {})


class TyreScenarioTests(unittest.TestCase):
    """The practical block's tyre text: five questions on three numbers."""

    INTRO = (
        "Автомобильное колесо представляет из себя металлический диск "
        "с установленной на него резиновой шиной. Первое число означает ширину "
        "шины в миллиметрах. Второе число — высота боковины шины H в процентах "
        "от ширины шины. За буквой R следует диаметр диска d в дюймах "
        "(в одном дюйме 25,4 мм). Завод производит легковые автомобили "
        "определённой модели и устанавливает на них колёса с шинами 185/70 R14."
    )
    TABLE = (
        "Завод допускает установку шин с другими маркировками.\n\n"
        "| Ширина шины (мм) | Диаметр диска (дюймы) | Диаметр диска (дюймы) |\n"
        "|---|---|---|\n"
        "| Ширина шины (мм) | 14 | 15 |\n"
        "| 185 | 185/70 | 185/65 |\n"
        "| 195 | — | 195/65 |\n\n"
    )

    def task(self, statement: str) -> dict:
        return {"group_intro": self.INTRO, "statement_text": statement}

    def test_the_table_is_read_by_the_disk_column(self) -> None:
        # 195 is only allowed on a 15-inch disk, so 14 inches leaves 185 alone.
        question = self.TABLE + (
            "Шины какой наибольшей ширины можно устанавливать на автомобиль, "
            "если диаметр диска равен 14 дюймам? Ответ дайте в миллиметрах."
        )
        self.assertEqual(solve_tyres(self.task(question)), "185")

    def test_the_sidewall_is_a_percentage_of_the_width(self) -> None:
        self.assertEqual(
            solve_tyres(self.task(
                "Сколько миллиметров составляет высота боковины шины, "
                "имеющей маркировку 225/40 R18?"
            )),
            "90",
        )

    def test_the_factory_wheel_comes_from_the_shared_text(self) -> None:
        # 14 · 25,4 + 2 · 185 · 0,70 — the question never names the tyre.
        self.assertEqual(
            solve_tyres(self.task(
                "Найдите диаметр колеса автомобиля, выходящего с завода. "
                "Ответ дайте в миллиметрах."
            )),
            "614.6",
        )

    def test_a_replacement_is_compared_against_the_factory_wheel(self) -> None:
        self.assertEqual(
            solve_tyres(self.task(
                "На сколько миллиметров увеличится диаметр колеса, если заменить "
                "колёса, установленные на заводе, колёсами с шинами 195/60 R15?"
            )),
            "0.4",
        )

    def test_the_mileage_question_is_the_diameter_question(self) -> None:
        # Пробег за оборот — πD, so π cancels out of the ratio.
        self.assertEqual(
            solve_tyres(self.task(
                "На сколько процентов увеличится пробег автомобиля при одном "
                "обороте колеса, если заменить колёса, установленные на заводе, "
                "колёсами с шинами 195/70 R14? Результат округлите до десятых."
            )),
            "2.3",
        )

    def test_another_scenario_is_declined(self) -> None:
        self.assertIsNone(solve_tyres({"group_intro": "Хозяин строит баню.", "statement_text": "?"}))


class PaperScenarioTests(unittest.TestCase):
    """А0 is one square metre and every cut halves it — that fixes everything."""

    INTRO = (
        "Общепринятые форматы листов бумаги обозначают буквой А и цифрой: А0, А1, "
        "А2 и так далее. Лист формата А0 имеет форму прямоугольника площадью "
        "1 кв. м. Отношение большей стороны к меньшей одно и то же."
    )

    def task(self, statement: str) -> dict:
        return {"group_intro": self.INTRO, "statement_text": statement}

    def test_sheets_of_a_smaller_format(self) -> None:
        self.assertEqual(
            solve_paper(self.task("Сколько листов формата А4 получится из одного листа формата А1?")),
            "8",
        )

    def test_area_in_square_centimetres(self) -> None:
        self.assertEqual(
            solve_paper(self.task(
                "Найдите площадь листа формата А3. Ответ дайте в квадратных сантиметрах."
            )),
            "1250",
        )

    def test_a_side_rounded_to_a_multiple_of_ten(self) -> None:
        # ФИПИ's own confirmed key for А0 is 840, not the ISO table's 841.
        self.assertEqual(
            solve_paper(self.task(
                "Найдите ширину листа бумаги формата А0. Ответ дайте в миллиметрах "
                "и округлите до ближайшего целого числа, кратного 10."
            )),
            "840",
        )

    def test_the_ratio_is_the_same_for_every_format(self) -> None:
        self.assertEqual(
            solve_paper(self.task(
                "Найдите отношение длины меньшей стороны листа формата А4 к большей. "
                "Ответ округлите до десятых."
            )),
            "0.7",
        )

    def test_a_pack_weighs_its_area(self) -> None:
        # 500 листов А5 — это 500/32 кв. м бумаги по 80 г.
        self.assertEqual(
            solve_paper(self.task(
                "Бумагу формата А5 упаковали в пачки по 500 листов. Найдите массу "
                "пачки, если масса бумаги площадью 1 кв. м равна 80 г. "
                "Ответ дайте в граммах."
            )),
            "1250",
        )

    def test_the_font_scales_with_the_side(self) -> None:
        self.assertEqual(
            solve_paper(self.task(
                "Размер (высота) типографского шрифта измеряется в пунктах. Какой "
                "высоты нужен шрифт (в пунктах), чтобы текст был расположен на листе "
                "формата А3 так же, как этот же текст, напечатанный шрифтом высотой "
                "15 пунктов на листе формата А4? Размер шрифта округляется до целого."
            )),
            "21",
        )

    def test_formats_are_matched_to_the_numbered_sheets(self) -> None:
        statement = (
            "В таблице даны размеры четырёх листов, имеющих форматы А2, А3, А5 и А6.\n\n"
            "| Номер листа | Длина (мм) | Ширина (мм) |\n|---|---|---|\n"
            "| 1 | 210 | 148 |\n| 2 | 594 | 420 |\n| 3 | 148 | 105 |\n| 4 | 420 | 297 |\n\n"
            "Установите соответствие между форматами и номерами листов.\n\nА2 А3 А5 А6"
        )
        self.assertEqual(solve_paper(self.task(statement)), "2413")

    def test_a_sheet_that_fits_no_format_is_left_alone(self) -> None:
        # Better no answer than a guess: a mismatched table is a parsing bug.
        statement = (
            "В таблице даны размеры четырёх листов, имеющих форматы А2, А3, А5 и А6.\n\n"
            "| Номер листа | Длина (мм) | Ширина (мм) |\n|---|---|---|\n"
            "| 1 | 999 | 148 |\n| 2 | 594 | 420 |\n| 3 | 148 | 105 |\n| 4 | 420 | 297 |\n\n"
            "Установите соответствие между форматами и номерами листов.\n\nА2 А3 А5 А6"
        )
        self.assertIsNone(solve_paper(self.task(statement)))


class BoundedProbeTests(unittest.TestCase):
    """Guessing an answer within bounds, for what a solver could not compute."""

    def probe(self, statement: str):
        return probe_candidates({"statement_text": statement})

    def test_a_percentage_sweeps_zero_to_a_hundred(self) -> None:
        values = self.probe("Сколько процентов площади участка занимает сарай?")
        self.assertEqual(values[:3], ["0", "1", "2"])
        self.assertIn("100", values)
        self.assertIn("50.5", values)
        self.assertIn("50,5", values)  # both spellings the sheet accepts
        # Integers come first, halves after — the cheap guesses lead.
        self.assertLess(values.index("100"), values.index("0.5"))

    def test_a_count_is_whole_with_no_halves(self) -> None:
        values = self.probe("Сколько упаковок плитки понадобилось, чтобы выложить дорожки?")
        self.assertEqual(values[0], "1")
        self.assertNotIn("1.5", values)
        self.assertNotIn("1,5", values)

    def test_roubles_are_left_alone(self) -> None:
        # Thousands of roubles cannot land in a hundred-wide sweep.
        self.assertIsNone(self.probe(
            "На сколько рублей покупка дровяной печи обойдётся дешевле электрической?"
        ))

    def test_the_drawing_is_not_guessed(self) -> None:
        self.assertIsNone(self.probe(
            "На клетчатой бумаге изображены два круга. Во сколько раз площадь больше?"
        ))

    def test_a_matching_answer_is_left_to_its_finite_set(self) -> None:
        self.assertIsNone(self.probe(
            "Установите соответствие между массами и номерами печей. "
            "Перенесите последовательность трёх цифр."
        ))

    def test_an_exclusion_wins_over_a_type(self) -> None:
        # «в квадратных метрах» would be an area, but the price in roubles is
        # the answer, so the exclusion has to be checked first.
        self.assertIsNone(probe_type(
            "Плитка укрывает 10 кв. м. Сколько рублей стоила вся плитка?"
        ))

    def test_kilometres_stay_in_single_digits_of_tens(self) -> None:
        values = self.probe("Найдите расстояние от деревни до села по прямой в километрах.")
        self.assertEqual(values[0], "1")
        self.assertNotIn("40", values)  # trimmed at 35
