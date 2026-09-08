const DAY_IN_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const getKstCalendarDay = (date: Date) => {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  return Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate(),
  );
};

/** 생성일과 완료일을 모두 포함한 KST 달력 일수를 계산한다. */
export const getBoardTotalDaysTaken = (
  createdAt: string,
  completedAt: string,
) => {
  const createdDate = new Date(createdAt);
  const completedDate = new Date(completedAt);

  if (
    Number.isNaN(createdDate.getTime()) ||
    Number.isNaN(completedDate.getTime())
  ) {
    return null;
  }

  const elapsedDays = Math.floor(
    (getKstCalendarDay(completedDate) - getKstCalendarDay(createdDate)) /
      DAY_IN_MS,
  );

  return elapsedDays >= 0 ? elapsedDays + 1 : null;
};
