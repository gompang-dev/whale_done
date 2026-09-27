import {
  getKstDayWindow,
  getReminderBody,
  REMINDER_BODIES,
} from "../supabase/functions/send-reminder-push/reminder-message";

describe("evening reminder body", () => {
  test("no checked habit uses case 1", () => {
    expect(getReminderBody(["board-1", "board-2"], new Set())).toBe(
      REMINDER_BODIES.none,
    );
  });

  test("some checked habits use case 2", () => {
    expect(getReminderBody(["board-1", "board-2"], new Set(["board-1"]))).toBe(
      REMINDER_BODIES.partial,
    );
  });

  test("all checked habits use case 3", () => {
    expect(
      getReminderBody(["board-1", "board-2"], new Set(["board-1", "board-2"])),
    ).toBe(REMINDER_BODIES.all);
  });

  test("one habit has no partial state", () => {
    expect(getReminderBody(["board-1"], new Set())).toBe(REMINDER_BODIES.none);
    expect(getReminderBody(["board-1"], new Set(["board-1"]))).toBe(
      REMINDER_BODIES.all,
    );
  });

  test("no due habit preserves the existing recipient with case 1", () => {
    expect(getReminderBody([], new Set())).toBe(REMINDER_BODIES.none);
  });
});

test("sticker day follows Korea Standard Time across midnight", () => {
  expect(getKstDayWindow(new Date("2026-09-26T14:59:00Z"))).toEqual({
    date: "2026-09-26",
    start: "2026-09-25T15:00:00.000Z",
    end: "2026-09-26T15:00:00.000Z",
  });
  expect(getKstDayWindow(new Date("2026-09-26T15:01:00Z"))).toEqual({
    date: "2026-09-27",
    start: "2026-09-26T15:00:00.000Z",
    end: "2026-09-27T15:00:00.000Z",
  });
});
