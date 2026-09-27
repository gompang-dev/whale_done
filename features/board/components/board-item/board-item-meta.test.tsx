import { BoardRecord } from "@/features/board/types";
import { render } from "@testing-library/react-native";
import { BoardItemUi } from "../../hooks/use-board-item-ui";
import BoardItemMeta from "./board-item-meta";

jest.mock("@/shared/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    AppText: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const board: BoardRecord = {
  id: "board-1",
  createdAt: null,
  completedAt: null,
  title: "테스트 보드",
  emoji: "🌱",
  targetCount: 30,
  limitCount: 1,
  currentCount: 1,
  todayStickerCount: 0,
  latestStickerCollectedAt: null,
  currentStreak: 0,
  maxStreak: 1,
  todaySuccess: false,
  rewardMemo: null,
  status: "active",
};

const ui: BoardItemUi = {
  title: board.title,
  isCompleted: false,
  isTodayDone: false,
  progressPercent: 0,
  progressColor: "text-primary-500",
  rewardText: null,
  opacity: 1,
  boardDisabled: false,
  boardDDay: "1",
  completedPeriodLabel: null,
};

test.each([
  { currentStreak: 0, todaySuccess: true, todayStickerCount: 1, badge: null },
  { currentStreak: 1, todaySuccess: true, todayStickerCount: 1, badge: null },
  { currentStreak: 1, todaySuccess: false, todayStickerCount: 0, badge: "연속 1일" },
  { currentStreak: 2, todaySuccess: true, todayStickerCount: 1, badge: "연속 2일" },
])("streak badge follows yesterday's sticker history: %p", async (scenario) => {
  const { queryByText } = await render(
    <BoardItemMeta board={{ ...board, ...scenario }} ui={ui} />,
  );

  if (scenario.badge) {
    expect(queryByText(scenario.badge)).toBeTruthy();
  } else {
    expect(queryByText(/연속 \d+일/)).toBeNull();
  }
});
