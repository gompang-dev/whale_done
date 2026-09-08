import { archiveKeys } from "@/features/archive/queries/archive.query.key";
import { collectStickerAction } from "@/features/board/actions/collect-sticker";
import { BoardRecord, CollectStickerError } from "@/features/board/types";
import { analytics } from "@/services/analytics";
import { toast } from "@/shared/toasts/toast";
import {
  defaultScheduler,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { PropsWithChildren } from "react";
import { boardKeys } from "../queries/board.query.key";
import { useCollectSticker } from "./use-collect-sticker";

jest.mock("@/features/board/actions/collect-sticker", () => ({
  collectStickerAction: jest.fn(),
}));

jest.mock("@/services/user", () => ({
  useUser: () => ({
    profileId: "profile-1",
  }),
}));

jest.mock("@/services/analytics", () => ({
  analytics: {
    action: {
      failed: jest.fn().mockResolvedValue(undefined),
    },
    board: {
      stickerCollected: jest.fn().mockResolvedValue(undefined),
      completed: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock("@/shared/toasts/toast", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/shared/lib/report-error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/services/whale-message", () => ({
  whaleMessageKeys: {
    all: ["whale-message"],
  },
}));

const collectStickerActionMock = jest.mocked(collectStickerAction);
const errorMock = jest.mocked(toast.error);
const stickerCollectedMock = jest.mocked(analytics.board.stickerCollected);
const boardCompletedMock = jest.mocked(analytics.board.completed);
const actionFailedMock = jest.mocked(analytics.action.failed);

const updatedBoard: BoardRecord = {
  id: "board-1",
  createdAt: "2026-07-20T00:00:00.000Z",
  completedAt: null,
  title: "물 마시기",
  emoji: "💧",
  targetCount: 30,
  limitCount: 3,
  currentCount: 2,
  todayStickerCount: 2,
  latestStickerCollectedAt: "2026-07-23T00:00:00.000Z",
  currentStreak: 1,
  maxStreak: 1,
  todaySuccess: false,
  rewardMemo: null,
  status: "active",
};

const createHarness = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
      mutations: {
        gcTime: Infinity,
        retry: false,
      },
    },
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
};

beforeAll(() => {
  notifyManager.setScheduler((callback) => callback());
});

afterAll(() => {
  notifyManager.setScheduler(defaultScheduler);
});

beforeEach(() => {
  collectStickerActionMock.mockResolvedValue(updatedBoard);
});

test("스티커 저장 성공 후 관련 조회를 갱신한다", async () => {
  const { queryClient, wrapper } = createHarness();
  const invalidateQueries = jest.spyOn(queryClient, "invalidateQueries");

  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      boardId: "board-1",
      source: "app",
    });
  });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  expect(collectStickerActionMock).toHaveBeenCalledWith({
    boardId: "board-1",
    source: "app",
    profileId: "profile-1",
  });
  expect(invalidateQueries).toHaveBeenCalledWith(
    expect.objectContaining({
      queryKey: boardKeys.all,
    }),
  );
  expect(invalidateQueries).toHaveBeenCalledWith(
    expect.objectContaining({
      queryKey: archiveKeys.detail("board-1"),
    }),
  );
  expect(stickerCollectedMock).toHaveBeenCalledWith("app", "board-1");
});

test("마지막 sticker로 완료된 보드의 완료 이벤트를 기록한다", async () => {
  collectStickerActionMock.mockResolvedValueOnce({
    ...updatedBoard,
    currentCount: 30,
    status: "completed",
    createdAt: "2026-09-01T15:00:00.000Z",
    completedAt: "2026-09-29T14:59:59.000Z",
  });
  const { wrapper } = createHarness();
  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      boardId: "board-1",
      source: "app",
    });
  });

  expect(boardCompletedMock).toHaveBeenCalledWith("board-1", 28);
});

test("완료되지 않은 보드에는 완료 이벤트를 기록하지 않는다", async () => {
  const { wrapper } = createHarness();
  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      boardId: "board-1",
      source: "app",
    });
  });

  expect(boardCompletedMock).not.toHaveBeenCalled();
});

test("스티커 action에 현재 사용자 정보를 전달한다", async () => {
  const { wrapper } = createHarness();
  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      boardId: "board-1",
      source: "widget",
    });
  });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  expect(collectStickerActionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: "profile-1",
      source: "widget",
    }),
  );
});

test("일일 제한 초과는 사용자 메시지를 표시한다", async () => {
  const { wrapper } = createHarness();
  const error = Object.assign(new Error("DAILY_LIMIT_EXCEEDED"), {
    reason: "DAILY_LIMIT_EXCEEDED" as const,
    todayStickerCount: 3,
    limitCount: 3,
  }) satisfies CollectStickerError;

  collectStickerActionMock.mockRejectedValueOnce(error);

  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await expect(
      result.current.mutateAsync({
        boardId: "board-1",
        source: "app",
      }),
    ).rejects.toBe(error);
  });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  expect(errorMock).toHaveBeenCalledWith(
    "오늘 받을 수 있는 스티커를 모두 받았어요",
  );
});

test("완료된 보드에는 완료 상태 안내를 표시한다", async () => {
  const { wrapper } = createHarness();
  const error = Object.assign(new Error("BOARD_COMPLETED"), {
    reason: "BOARD_COMPLETED" as const,
  }) satisfies CollectStickerError;

  collectStickerActionMock.mockRejectedValueOnce(error);

  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await expect(
      result.current.mutateAsync({
        boardId: "board-1",
        source: "app",
      }),
    ).rejects.toBe(error);
  });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  expect(errorMock).toHaveBeenCalledWith("이미 완료된 습관이에요");
});

test("알 수 없는 sticker 저장 실패는 action_failed로 기록한다", async () => {
  const { wrapper } = createHarness();
  const error = new Error("network failed");
  collectStickerActionMock.mockRejectedValueOnce(error);
  const { result } = await renderHook(() => useCollectSticker(), { wrapper });

  await act(async () => {
    await expect(
      result.current.mutateAsync({
        boardId: "board-1",
        source: "app",
      }),
    ).rejects.toBe(error);
  });

  expect(actionFailedMock).toHaveBeenCalledWith("sticker_collect");
  expect(stickerCollectedMock).not.toHaveBeenCalled();
});
