import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

const mathToken = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

/** Renders editor-provided text with $inline$ and $$display$$ LaTeX while keeping ordinary text safe. */
export function MathMarkdown({ children, className = "" }: { children: string; className?: string }) {
  const tokens = children.split(mathToken).filter(Boolean);
  return <div className={`whitespace-pre-line ${className}`}>{tokens.map((token, index) => {
    if (token.startsWith("$$") && token.endsWith("$$")) return <BlockMath key={index} math={token.slice(2, -2).trim()} errorColor="#ff8b4b" renderError={() => <span className="text-sm text-[#ff8b4b]">Проверьте формулу LaTeX.</span>} />;
    if (token.startsWith("$") && token.endsWith("$")) return <InlineMath key={index} math={token.slice(1, -1).trim()} errorColor="#ff8b4b" renderError={() => <span className="text-sm text-[#ff8b4b]">Неверная формула</span>} />;
    return <span key={index}>{token}</span>;
  })}</div>;
}
