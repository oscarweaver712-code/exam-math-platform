export function TutorTelegramBanner() {
  return (
    <a
      href="https://t.me/yavalerachestno"
      target="_blank"
      rel="noreferrer"
      aria-label="Открыть Telegram @yavalerachestno"
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a35] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b0b0d]"
    >
      <div className="overflow-hidden rounded-2xl border border-[#ff5b14]/25 bg-[#111113] p-1 shadow-[0_18px_50px_rgba(0,0,0,.18)] transition duration-200 group-hover:border-[#ff7a35] group-hover:shadow-[0_18px_54px_rgba(255,91,20,.19)]">
        <img
          src="/manus-storage/school911-math-lessons-banner_fe3cd804.png"
          alt="Запись на индивидуальные и групповые занятия по математике, ЕГЭ и ОГЭ; QR-код и Telegram @yavalerachestno."
          className="block max-h-[200px] w-full rounded-[14px] object-contain object-center sm:max-h-[220px]"
        />
      </div>
    </a>
  );
}
