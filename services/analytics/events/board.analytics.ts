import type { AnalyticsEventMap } from "../core/analytics.types";
import { trackEvent } from "../core/track-event";

export type BoardCreatedSource =
  AnalyticsEventMap["board_created"]["source"];
export type StickerSource =
  AnalyticsEventMap["sticker_collected"]["source"];
export type ActiveLimitSource =
  AnalyticsEventMap["active_limit_reached"]["source"];

/**
 * TODO(EAS-86)
 * - habit_category: board model과 분류 enum이 정의된 뒤 추가한다.
 * - emoji_type: emoji 원문이 아닌 분석용 분류 기준이 정의된 뒤 추가한다.
 */
export const boardAnalytics = {
  /** board 생성 API가 성공한 뒤 호출한다. title, emoji, reward는 전송하지 않는다. */
  created(source: BoardCreatedSource, targetCount: number) {
    return trackEvent("board_created", {
      source,
      target_count: targetCount,
    });
  },

  /** board 수정 API가 성공한 뒤 호출한다. */
  updated() {
    return trackEvent("board_updated");
  },

  /** board 삭제 API가 성공한 뒤 호출한다. */
  deleted() {
    return trackEvent("board_deleted");
  },

  /** sticker 저장 API가 성공한 뒤 DB sticker_source와 불변 board ID를 전달한다. */
  stickerCollected(source: StickerSource, boardId: string) {
    return trackEvent("sticker_collected", {
      source,
      board_id: boardId,
    });
  },

  /** 마지막 sticker 저장으로 목표치에 도달한 경우 한 번 호출한다. */
  completed(boardId: string, totalDaysTaken: number) {
    return trackEvent("board_completed", {
      board_id: boardId,
      total_days_taken: totalDaysTaken,
    });
  },

  /** 활성 board 제한이 client 정책 또는 server RPC에서 확정됐을 때 호출한다. */
  activeLimitReached(source: ActiveLimitSource) {
    return trackEvent("active_limit_reached", { source });
  },

  /** board 수정 sheet가 정상적으로 presentation 요청된 뒤 호출한다. */
  editStarted() {
    return trackEvent("board_edit_started");
  },
};
