import type { AnalyticsAdapter } from "./analytics.adapter";
import { createTrackEvent } from "./create-track-event";

test("모든 analytics adapter에 같은 이벤트를 전달한다", async () => {
  const firstTrack = jest.fn();
  const secondTrack = jest.fn();
  const adapters: AnalyticsAdapter[] = [
    { name: "first", track: firstTrack },
    { name: "second", track: secondTrack },
  ];
  const trackEvent = createTrackEvent(adapters);

  await trackEvent("sticker_collected", {
    source: "app",
    board_id: "board-1",
  });

  expect(firstTrack).toHaveBeenCalledWith("sticker_collected", {
    source: "app",
    board_id: "board-1",
  });
  expect(secondTrack).toHaveBeenCalledWith("sticker_collected", {
    source: "app",
    board_id: "board-1",
  });
});

test("한 adapter 실패가 다른 adapter와 호출자에게 전파되지 않는다", async () => {
  const failedTrack = jest.fn().mockRejectedValue(new Error("sink failed"));
  const successfulTrack = jest.fn();
  const onAdapterError = jest.fn();
  const trackEvent = createTrackEvent([
    { name: "failed", track: failedTrack },
    { name: "successful", track: successfulTrack },
  ], onAdapterError);

  await expect(trackEvent("archive_viewed")).resolves.toBeUndefined();
  expect(successfulTrack).toHaveBeenCalledWith("archive_viewed", undefined);
  expect(onAdapterError).toHaveBeenCalledWith(
    "failed",
    expect.objectContaining({ message: "sink failed" }),
  );
});

test("실패 보고 callback 오류도 호출자에게 전파하지 않는다", async () => {
  const trackEvent = createTrackEvent(
    [
      {
        name: "failed",
        track: jest.fn().mockRejectedValue(new Error("sink failed")),
      },
    ],
    () => {
      throw new Error("diagnostic failed");
    },
  );

  await expect(trackEvent("stats_viewed")).resolves.toBeUndefined();
});
