import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";

const mathToken = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|!\[[^\]]*\]\([^)\s]+\))/g;

/** `![alt](src)` — a picture standing in for a word of the sentence. */
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/** A markdown separator row: `|---|---|`, optionally with alignment colons. */
const SEPARATOR_RE = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

/** Split `| a | b |` into cells, honouring `\|` escapes inside a cell. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\" && trimmed[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Render `$inline$` and `$$display$$` LaTeX inside a run of text. */
function renderMath(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(mathToken)
    .filter(Boolean)
    .map((token, index) => {
      const key = `${keyPrefix}-${index}`;
      if (token.startsWith("$$") && token.endsWith("$$")) {
        return (
          <BlockMath
            key={key}
            math={token.slice(2, -2).trim()}
            errorColor="#ff8b4b"
            renderError={() => <span className="text-sm text-[#ff8b4b]">Проверьте формулу LaTeX.</span>}
          />
        );
      }
      if (token.startsWith("$") && token.endsWith("$")) {
        return (
          <InlineMath
            key={key}
            math={token.slice(1, -1).trim()}
            errorColor="#ff8b4b"
            renderError={() => <span className="text-sm text-[#ff8b4b]">Неверная формула</span>}
          />
        );
      }
      const image = IMAGE_RE.exec(token);
      if (image) {
        // ФИПИ drew part of some conditions instead of writing them, so this
        // picture is a word of the sentence — «Диагональ ромба равна 28,
        // а [tg BCA = 24/7]». It has to sit on the text baseline, at text
        // size, or the sentence comes apart.
        return (
          <img
            key={key}
            src={image[2]}
            alt={image[1] || "формула из условия"}
            className="fipi-formula mx-[.15em] inline-block max-h-[2.4em] w-auto max-w-full align-middle"
          />
        );
      }
      return <span key={key}>{token}</span>;
    });
}

function Table({ rows, keyPrefix }: { rows: string[][]; keyPrefix: string }) {
  const [header, ...body] = rows;
  return (
    // Wide tables scroll inside their own box rather than stretching the card.
    <div className="my-4 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-white/[.05]">
            {header.map((cell, index) => (
              <th
                key={index}
                className="border-b border-white/10 px-3 py-2 text-left font-bold text-[#ece6de]"
              >
                {renderMath(cell, `${keyPrefix}-h-${index}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/8 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top text-[#ded9d2]">
                  {renderMath(cell, `${keyPrefix}-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders task text: `$LaTeX$` plus markdown tables.
 *
 * Tables matter more than they look. A third of the bank — the whole practical
 * block — states its data as a grid of tariffs, tyre sizes or timetables, and
 * printing that as raw `|` rows makes the task unreadable.
 */
export function MathMarkdown({ children, className = "" }: { children: string; className?: string }) {
  const lines = children.split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join("\n");
    if (text.trim()) {
      blocks.push(
        <div key={`p-${blocks.length}`} className="whitespace-pre-line">
          {renderMath(text, `p-${blocks.length}`)}
        </div>,
      );
    }
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (!isTableRow(lines[index])) {
      paragraph.push(lines[index]);
      continue;
    }

    const start = index;
    while (index < lines.length && isTableRow(lines[index])) index += 1;
    const rows = lines.slice(start, index).filter(line => !SEPARATOR_RE.test(line)).map(splitRow);
    index -= 1;

    if (rows.length) {
      flushParagraph();
      blocks.push(<Table key={`t-${blocks.length}`} rows={rows} keyPrefix={`t-${blocks.length}`} />);
    } else {
      paragraph.push(...lines.slice(start, index + 1));
    }
  }
  flushParagraph();

  return <div className={className}>{blocks}</div>;
}
