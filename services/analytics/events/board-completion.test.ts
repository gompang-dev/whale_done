import { getBoardTotalDaysTaken } from "./board-completion";

test("생성일과 완료일을 포함한 KST 달력 일수를 반환한다", () => {
  expect(
    getBoardTotalDaysTaken(
      "2026-09-01T14:59:59.000Z",
      "2026-09-02T15:00:00.000Z",
    ),
  ).toBe(3);
});

test("같은 KST 날짜에 완료하면 1일을 반환한다", () => {
  expect(
    getBoardTotalDaysTaken(
      "2026-09-01T15:00:00.000Z",
      "2026-09-02T14:59:59.000Z",
    ),
  ).toBe(1);
});

test("잘못되거나 역전된 시각에는 값을 만들지 않는다", () => {
  expect(
    getBoardTotalDaysTaken("invalid", "2026-09-02T00:00:00.000Z"),
  ).toBeNull();
  expect(
    getBoardTotalDaysTaken(
      "2026-09-03T00:00:00.000Z",
      "2026-09-02T00:00:00.000Z",
    ),
  ).toBeNull();
});
