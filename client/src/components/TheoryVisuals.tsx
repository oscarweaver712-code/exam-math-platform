type TheoryVisual = {
  id: number;
  kind: "inline_svg" | "image_asset";
  placement: "lead" | "body";
  diagramKey: string | null;
  assetUrl: string | null;
  altText: string;
  caption: string | null;
};

function Diagram({ diagramKey, altText }: { diagramKey: string | null; altText: string }) {
  const shared = { fill: "none", stroke: "#f3eee7", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (diagramKey === "right-triangle-6-8") return <svg viewBox="0 0 560 300" role="img" aria-label={altText} className="h-auto w-full"><path d="M100 240 100 75 420 240Z" {...shared} /><path d="M100 205 H135 V240" stroke="#ff5b14" strokeWidth="3" fill="none" /><text x="49" y="164" fill="#ff8b4b" fontSize="22" fontWeight="700">6</text><text x="244" y="267" fill="#ff8b4b" fontSize="22" fontWeight="700">8</text><text x="266" y="132" fill="#ff8b4b" fontSize="22" fontWeight="700">c</text><circle cx="100" cy="240" r="5" fill="#ff5b14" /><circle cx="100" cy="75" r="5" fill="#ff5b14" /><circle cx="420" cy="240" r="5" fill="#ff5b14" /><text x="170" y="54" fill="#aaa7ae" fontSize="18">c² = 6² + 8²</text></svg>;
  if (diagramKey === "similar-triangles-scale") return <svg viewBox="0 0 560 300" role="img" aria-label={altText} className="h-auto w-full"><path d="M55 238 180 78 285 238Z" {...shared} /><path d="M325 238 430 102 520 238Z" {...shared} /><text x="118" y="254" fill="#ff8b4b" fontSize="19" fontWeight="700">a</text><text x="190" y="254" fill="#ff8b4b" fontSize="19" fontWeight="700">b</text><text x="373" y="254" fill="#ff8b4b" fontSize="19" fontWeight="700">ka</text><text x="438" y="254" fill="#ff8b4b" fontSize="19" fontWeight="700">kb</text><path d="M102 178 113 188 M225 188 236 178 M362 191 372 201 M470 201 480 191" stroke="#ff5b14" strokeWidth="3" /><text x="213" y="55" fill="#aaa7ae" fontSize="18">коэффициент подобия k</text></svg>;
  if (diagramKey === "triangle-base-height") return <svg viewBox="0 0 560 300" role="img" aria-label={altText} className="h-auto w-full"><path d="M85 238 278 55 480 238Z" {...shared} /><path d="M278 55 V238" stroke="#ff8b4b" strokeWidth="3" strokeDasharray="7 6" /><path d="M278 207 H309 V238" stroke="#ff5b14" strokeWidth="3" fill="none" /><path d="M85 238 H480" stroke="#ff5b14" strokeWidth="4" strokeLinecap="round" /><text x="294" y="154" fill="#ff8b4b" fontSize="21" fontWeight="700">h</text><text x="267" y="270" fill="#ff8b4b" fontSize="21" fontWeight="700">a</text><text x="182" y="45" fill="#aaa7ae" fontSize="18">S = a × h / 2</text></svg>;
  return <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-[#aaa7ae]">Эта геометрическая схема пока недоступна.</div>;
}

export function TheoryVisuals({ visuals, placement }: { visuals: TheoryVisual[]; placement: "lead" | "body" }) {
  const selected = visuals.filter(visual => visual.placement === placement);
  if (!selected.length) return null;
  return <div className="mt-5 space-y-4">{selected.map(visual => <figure key={visual.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e10] p-3 sm:p-5">{visual.kind === "inline_svg" ? <Diagram diagramKey={visual.diagramKey} altText={visual.altText} /> : visual.assetUrl ? <img src={visual.assetUrl} alt={visual.altText} className="max-h-[480px] w-full rounded-xl object-contain" /> : null}{visual.caption ? <figcaption className="mt-3 border-t border-white/8 pt-3 text-xs leading-5 text-[#8c8990]">{visual.caption}</figcaption> : null}</figure>)}</div>;
}
