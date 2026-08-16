import { Send } from "lucide-react";
import { useState } from "react";

/**
 * Top-of-page invitation to the tutor's Telegram channel.
 *
 * The artwork used to live in Manus object storage, which disappeared with the
 * move to Railway. The path is configurable now, and if the image is missing
 * the banner falls back to a typeset version instead of a broken-image icon —
 * the call to action is the point, the picture is the decoration.
 *
 * Set `VITE_BANNER_IMAGE_URL` to your uploaded file, e.g.
 * `/media/school911-math-lessons-banner.png`.
 */

const TELEGRAM_URL = "https://t.me/yavalerachestno";
const BANNER_IMAGE = import.meta.env.VITE_BANNER_IMAGE_URL as string | undefined;

export function TutorTelegramBanner() {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(BANNER_IMAGE) && !imageFailed;

  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Открыть Telegram @yavalerachestno"
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a35] focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className="overflow-hidden rounded-2xl border border-[#ff5b14]/25 bg-[#111113] p-1 shadow-[0_18px_50px_rgba(0,0,0,.18)] transition duration-200 group-hover:border-[#ff7a35] group-hover:shadow-[0_18px_54px_rgba(255,91,20,.19)]">
        {showImage ? (
          <img
            src={BANNER_IMAGE}
            onError={() => setImageFailed(true)}
            alt="Запись на индивидуальные и групповые занятия по математике, ЕГЭ и ОГЭ; QR-код и Telegram @yavalerachestno."
            className="block max-h-[200px] w-full rounded-[14px] object-contain object-center sm:max-h-[220px]"
          />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-[14px] px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#ff7a35]">
                Школа 911
              </span>
              <span className="text-lg font-semibold leading-tight text-white sm:text-xl">
                Индивидуальные и групповые занятия по математике
              </span>
              <span className="text-sm text-white/65">Подготовка к ОГЭ и ЕГЭ</span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#ff5b14] px-4 py-2 text-sm font-medium text-white transition group-hover:bg-[#ff7a35]">
              <Send className="h-4 w-4" aria-hidden />
              @yavalerachestno
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
