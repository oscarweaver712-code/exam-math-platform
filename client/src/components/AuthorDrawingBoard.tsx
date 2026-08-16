import { Button } from "@/components/ui/button";
import { Eraser, PencilLine, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

export function AuthorDrawingBoard({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const previous = useRef<Point | null>(null);
  const [ink, setInk] = useState("#ff5b14");
  const [lineWidth, setLineWidth] = useState(3);
  const setup = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const snapshot = canvas.width ? canvas.toDataURL() : null;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    if (snapshot) { const image = new Image(); image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height); image.src = snapshot; }
  };
  useEffect(() => { setup(); const observer = new ResizeObserver(setup); if (canvasRef.current) observer.observe(canvasRef.current); return () => observer.disconnect(); }, []);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; previous.current = point(event); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current || !previous.current) return; const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return; const next = point(event); context.beginPath(); context.strokeStyle = ink; context.lineWidth = lineWidth; context.moveTo(previous.current.x, previous.current.y); context.lineTo(next.x, next.y); context.stroke(); previous.current = next; };
  const finish = () => { drawing.current = false; previous.current = null; };
  const clear = () => { const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height); };
  const save = () => { const canvas = canvasRef.current; if (canvas) onSave(canvas.toDataURL("image/png")); };
  return <section className="mt-4 overflow-hidden rounded-2xl border border-[#ff5b14]/30 bg-[#0c0c0e] p-3"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3"><div className="flex items-center gap-2"><PencilLine className="h-4 w-4 text-[#ff7a35]" /><div><p className="text-sm font-extrabold">Авторская доска</p><p className="text-xs text-[#8e8a91]">Нарисуйте собственную схему на сетке, затем прикрепите её к задаче.</p></div></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs text-[#b7b2ba]">Цвет<input aria-label="Цвет линии" type="color" value={ink} onChange={event => setInk(event.target.value)} className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0" /></label><label className="flex items-center gap-2 text-xs text-[#b7b2ba]">Линия<select value={lineWidth} onChange={event => setLineWidth(Number(event.target.value))} className="h-8 rounded-md border border-white/10 bg-[#16161a] px-2 text-xs text-white"><option value={2}>Тонкая</option><option value={3}>Средняя</option><option value={5}>Толстая</option></select></label></div></div><div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:24px_24px]"><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" /></div><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={clear} className="h-9 rounded-lg border-white/12 text-[#d5d0d8]"><Eraser className="mr-2 h-4 w-4" />Очистить</Button><Button type="button" variant="outline" onClick={setup} className="h-9 rounded-lg border-white/12 text-[#d5d0d8]"><RotateCcw className="mr-2 h-4 w-4" />Подогнать холст</Button><Button type="button" onClick={save} className="h-9 rounded-lg bg-[#ff5b14] font-extrabold text-[#101014] hover:bg-[#ff7a35]"><Save className="mr-2 h-4 w-4" />Использовать рисунок</Button></div></section>;
}
