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
from fipi.parse import parse_page, to_text  # noqa: E402
from fipi.equations import solve_equation  # noqa: E402
from fipi.formulas import solve_formula  # noqa: E402
from fipi.geometry import solve_geometry  # noqa: E402
from fipi.probability import solve_probability  # noqa: E402
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

    def test_unknown_metadata_is_unresolved_not_guessed(self) -> None:
        verdict = classify("Некоторый текст без признаков.", "short", [])
        self.assertIsNone(verdict.number)


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
