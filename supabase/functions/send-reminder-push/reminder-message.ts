export const REMINDER_BODIES = {
  none: "오늘 하루는 어땠어? 뜻대로 되지 않은 날이어도 괜찮아, 오늘도 애쓴 너를 토닥여주고 싶어.",
  partial:
    "오늘도 너를 위해 시간을 내었구나, 나도 참 뿌듯해. 다 채우지 않아도 네가 해낸 일은 충분히 소중해.",
  all: "오늘 습관을 끝까지 챙긴 네가 참 자랑스러워. 뿌듯한 마음 안고 오늘 밤은 푹 쉬어.",
} as const;

export const getKstDayWindow = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const start = new Date(`${date}T00:00:00+09:00`);

  return {
    date,
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
};

export const getReminderBody = (
  boardIds: readonly string[],
  checkedBoardIds: ReadonlySet<string>,
) => {
  const checkedCount = boardIds.filter((id) => checkedBoardIds.has(id)).length;

  if (checkedCount === 0) return REMINDER_BODIES.none;
  if (checkedCount === boardIds.length) return REMINDER_BODIES.all;
  return REMINDER_BODIES.partial;
};
