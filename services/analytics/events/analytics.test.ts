import { trackEvent } from "../core/track-event";
import { analytics } from "./analytics";

jest.mock("../core/track-event", () => ({
  trackEvent: jest.fn().mockResolvedValue(undefined),
}));

const trackEventMock = jest.mocked(trackEvent);

test("board facade가 고정된 event contract로 변환한다", () => {
  void analytics.board.created("board_create", 30);
  void analytics.board.updated();
  void analytics.board.deleted();
  void analytics.board.stickerCollected("app", "board-1");
  void analytics.board.completed("board-1", 28);
  void analytics.board.activeLimitReached("server");
  void analytics.board.editStarted();

  expect(trackEventMock.mock.calls).toEqual([
    ["board_created", { source: "board_create", target_count: 30 }],
    ["board_updated"],
    ["board_deleted"],
    ["sticker_collected", { source: "app", board_id: "board-1" }],
    ["board_completed", { board_id: "board-1", total_days_taken: 28 }],
    ["active_limit_reached", { source: "server" }],
    ["board_edit_started"],
  ]);
});

test("화면 이름을 view event로 변환한다", () => {
  void analytics.navigation.viewed("stats");
  void analytics.navigation.viewed("archive");
  void analytics.navigation.viewed("detail");

  expect(trackEventMock.mock.calls).toEqual([
    ["stats_viewed"],
    ["archive_viewed"],
    ["detail_viewed"],
  ]);
});

test("onboarding facade가 시작과 완료 step만 노출한다", () => {
  void analytics.onboarding.started();
  void analytics.onboarding.stepCompleted("title");

  expect(trackEventMock.mock.calls).toEqual([
    ["onboarding_started"],
    ["onboarding_step_completed", { step: "title" }],
  ]);
});

test("notification facade가 내부 property 이름으로 변환한다", () => {
  void analytics.notification.toggled({
    requestedEnabled: true,
    resultEnabled: false,
    permissionStatus: "granted",
  });
  void analytics.notification.permissionResolved("denied");

  expect(trackEventMock.mock.calls).toEqual([
    [
      "notification_toggle",
      {
        requested_enabled: true,
        result_enabled: false,
        permission_status: "granted",
      },
    ],
    ["notification_permission_result", { status: "denied" }],
  ]);
});

test("action failure는 고정 action 이름만 전달한다", () => {
  void analytics.action.failed("board_create");

  expect(trackEventMock).toHaveBeenCalledWith("action_failed", {
    action: "board_create",
  });
});
