import { boardApi } from "@/features/board/board.api";
import { ActiveBoardLimitError } from "@/features/board/types";
import { analytics } from "@/services/analytics";
import {
  defaultScheduler,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { refreshAfterBoardChanged } from "../queries/board-cache";
import { useCreateBoard } from "./use-create-board";
import { useDeleteBoard } from "./use-delete-board";
import { useUpdateBoard } from "./use-update-board";

jest.mock("@/features/board/board.api", () => ({
  boardApi: {
    createBoard: jest.fn(),
    updateBoard: jest.fn(),
    deleteBoard: jest.fn(),
  },
}));

jest.mock("@/services/user", () => ({
  useUser: () => ({ profileId: "profile-1" }),
}));

jest.mock("@/services/analytics", () => ({
  analytics: {
    action: {
      failed: jest.fn().mockResolvedValue(undefined),
    },
    board: {
      created: jest.fn().mockResolvedValue(undefined),
      updated: jest.fn().mockResolvedValue(undefined),
      deleted: jest.fn().mockResolvedValue(undefined),
      activeLimitReached: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock("../queries/board-cache", () => ({
  refreshAfterBoardChanged: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/shared/toasts/toast", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/shared/lib/report-error", () => ({
  reportError: jest.fn(),
}));

const createBoardMock = jest.mocked(boardApi.createBoard);
const updateBoardMock = jest.mocked(boardApi.updateBoard);
const deleteBoardMock = jest.mocked(boardApi.deleteBoard);
const refreshAfterBoardChangedMock = jest.mocked(refreshAfterBoardChanged);
const boardCreatedMock = jest.mocked(analytics.board.created);
const boardUpdatedMock = jest.mocked(analytics.board.updated);
const boardDeletedMock = jest.mocked(analytics.board.deleted);
const activeLimitReachedMock = jest.mocked(
  analytics.board.activeLimitReached,
);
const actionFailedMock = jest.mocked(analytics.action.failed);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });

  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return Wrapper;
};

const validBoardValues = {
  title: "산책하기",
  emoji: "🌱",
  targetCount: 30,
  limitCount: 1,
  rewardMemo: "",
};

beforeAll(() => {
  notifyManager.setScheduler((callback) => callback());
});

afterAll(() => {
  notifyManager.setScheduler(defaultScheduler);
});

test("board 생성 API 성공 뒤 target count와 created를 기록한다", async () => {
  createBoardMock.mockResolvedValue({ targetCount: 30 } as never);
  const { result } = await renderHook(() => useCreateBoard(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    for (const [key, value] of Object.entries(validBoardValues)) {
      result.current.changeFormData(
        key as keyof typeof validBoardValues,
      )(value as never);
    }
  });
  await act(async () => {
    await result.current.createBoard();
  });

  expect(boardCreatedMock).toHaveBeenCalledWith("board_create", 30);
  expect(refreshAfterBoardChangedMock).toHaveBeenCalled();
});

test("server 활성 board 제한은 expected event로 분리한다", async () => {
  const error = new ActiveBoardLimitError();
  createBoardMock.mockRejectedValueOnce(error);
  const { result } = await renderHook(() => useCreateBoard(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    for (const [key, value] of Object.entries(validBoardValues)) {
      result.current.changeFormData(
        key as keyof typeof validBoardValues,
      )(value as never);
    }
  });
  await act(async () => {
    await expect(result.current.createBoard()).rejects.toBe(error);
  });

  expect(activeLimitReachedMock).toHaveBeenCalledWith("server");
  expect(actionFailedMock).not.toHaveBeenCalled();
});

test("board 생성의 일반 실패는 action_failed로 기록한다", async () => {
  const error = new Error("create failed");
  createBoardMock.mockRejectedValueOnce(error);
  const { result } = await renderHook(() => useCreateBoard(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    for (const [key, value] of Object.entries(validBoardValues)) {
      result.current.changeFormData(
        key as keyof typeof validBoardValues,
      )(value as never);
    }
  });
  await act(async () => {
    await expect(result.current.createBoard()).rejects.toBe(error);
  });

  expect(actionFailedMock).toHaveBeenCalledWith("board_create");
  expect(boardCreatedMock).not.toHaveBeenCalled();
});

test("board 수정 성공과 실패를 각각 기록한다", async () => {
  updateBoardMock.mockResolvedValueOnce({} as never);
  const success = await renderHook(
    () => useUpdateBoard("board-1", validBoardValues),
    { wrapper: createWrapper() },
  );

  await act(async () => {
    await success.result.current.updateBoard();
  });
  expect(boardUpdatedMock).toHaveBeenCalledTimes(1);

  const error = new Error("update failed");
  updateBoardMock.mockRejectedValueOnce(error);
  const failure = await renderHook(
    () => useUpdateBoard("board-1", validBoardValues),
    { wrapper: createWrapper() },
  );

  await act(async () => {
    await expect(failure.result.current.updateBoard()).rejects.toBe(error);
  });
  expect(actionFailedMock).toHaveBeenCalledWith("board_update");
});

test("board 삭제 성공과 실패를 각각 기록한다", async () => {
  deleteBoardMock.mockResolvedValueOnce(undefined);
  const success = await renderHook(() => useDeleteBoard("board-1"), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    await success.result.current.deleteBoard();
  });
  expect(boardDeletedMock).toHaveBeenCalledTimes(1);

  const error = new Error("delete failed");
  deleteBoardMock.mockRejectedValueOnce(error);
  const failure = await renderHook(() => useDeleteBoard("board-1"), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    await expect(failure.result.current.deleteBoard()).rejects.toBe(error);
  });
  expect(actionFailedMock).toHaveBeenCalledWith("board_delete");
});
