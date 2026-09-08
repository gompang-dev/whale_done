import type { BoardSetupFormValues } from "@/features/board";
import { refreshAfterBoardChanged } from "@/features/board/queries/board-cache";
import { analytics } from "@/services/analytics";
import { notification } from "@/services/notification";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { PropsWithChildren } from "react";
import type { UseFormReturn } from "react-hook-form";
import { saveOnboardingSetup } from "../actions/save-onboarding-setup";
import useOnboardingCompletionFlow from "./use-onboarding-completion-flow";

const mockCompleteOnboarding = jest.fn().mockResolvedValue(undefined);
const mockSetOverrideMode = jest.fn().mockResolvedValue(undefined);

jest.mock("@/features/board", () => ({
  normalizeBoardSetupPayload: jest.fn(
    (formValues: BoardSetupFormValues) => ({
      boards: {
        title: formValues.boards.title,
        emoji: formValues.boards.emoji,
        target_count: Number(formValues.boards.target_count),
        limit_count: formValues.boards.limit_count,
        reward_memo: formValues.boards.reward_memo || null,
      },
      profiles: {
        nickname: formValues.profiles.nickname,
      },
    }),
  ),
}));

jest.mock("@/services/user", () => ({
  useUser: () => ({
    completeOnboarding: mockCompleteOnboarding,
    overrideMode: "real",
    profileId: "profile-1",
    setOverrideMode: mockSetOverrideMode,
  }),
}));

jest.mock("@/services/analytics", () => ({
  analytics: {
    action: {
      failed: jest.fn().mockResolvedValue(undefined),
    },
    board: {
      created: jest.fn().mockResolvedValue(undefined),
    },
    onboarding: {
      stepCompleted: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock("@/shared/lib/supabase", () => ({
  supabase: {},
}));

jest.mock("@/services/notification", () => ({
  notification: {
    requestPermissionFromOnboarding: jest.fn(),
  },
}));

jest.mock("../actions/save-onboarding-setup", () => ({
  saveOnboardingSetup: jest.fn(),
}));

jest.mock("@/features/board/queries/board-cache", () => ({
  refreshAfterBoardChanged: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/shared/toasts/toast", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/shared/lib/report-error", () => ({
  reportError: jest.fn(),
}));

const saveOnboardingSetupMock = jest.mocked(saveOnboardingSetup);
const requestPermissionMock = jest.mocked(
  notification.requestPermissionFromOnboarding,
);
const refreshAfterBoardChangedMock = jest.mocked(refreshAfterBoardChanged);
const useRouterMock = jest.mocked(useRouter);
const boardCreatedMock = jest.mocked(analytics.board.created);
const stepCompletedMock = jest.mocked(
  analytics.onboarding.stepCompleted,
);
const actionFailedMock = jest.mocked(analytics.action.failed);
const replaceMock = jest.fn();

const values: BoardSetupFormValues = {
  boards: {
    title: "산책하기",
    emoji: "🌱",
    target_count: "30",
    limit_count: 1,
    reward_memo: "",
  },
  profiles: {
    nickname: "두잉",
  },
};

const form = {
  getValues: () => values,
} as UseFormReturn<BoardSetupFormValues>;

const createdBoard = {
  id: "board-1",
  createdAt: "2026-07-26T00:00:00.000Z",
  completedAt: null,
  title: "산책하기",
  emoji: "🌱",
  targetCount: 30,
  limitCount: 1,
  currentCount: 0,
  todayStickerCount: 0,
  latestStickerCollectedAt: null,
  currentStreak: 0,
  maxStreak: 0,
  todaySuccess: false,
  rewardMemo: null,
  status: "active" as const,
};

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

beforeEach(() => {
  useRouterMock.mockReturnValue({ replace: replaceMock } as never);
  saveOnboardingSetupMock.mockResolvedValue(createdBoard);
  requestPermissionMock.mockResolvedValue(true);
});

test("onboarding 저장 성공 이후 board와 마지막 step을 기록한다", async () => {
  const { result } = await renderHook(
    () => useOnboardingCompletionFlow({ form }),
    { wrapper: createWrapper() },
  );

  await act(async () => {
    await result.current.completeWithHomePreview();
  });

  expect(boardCreatedMock).toHaveBeenCalledWith("onboarding", 30);
  expect(stepCompletedMock).toHaveBeenCalledWith("notification");
  expect(refreshAfterBoardChangedMock).toHaveBeenCalled();
  expect(replaceMock).toHaveBeenCalled();
});

test("onboarding 저장 실패에는 성공 event 대신 action_failed를 기록한다", async () => {
  saveOnboardingSetupMock.mockRejectedValueOnce(new Error("save failed"));
  const { result } = await renderHook(
    () => useOnboardingCompletionFlow({ form }),
    { wrapper: createWrapper() },
  );

  await act(async () => {
    await result.current.completeWithHomePreview();
  });

  expect(actionFailedMock).toHaveBeenCalledWith("onboarding_setup");
  expect(boardCreatedMock).not.toHaveBeenCalled();
  expect(stepCompletedMock).not.toHaveBeenCalled();
});

test("permission 처리 실패를 기록하되 onboarding 완료는 이어간다", async () => {
  requestPermissionMock.mockRejectedValueOnce(
    new Error("permission save failed"),
  );
  const { result } = await renderHook(
    () => useOnboardingCompletionFlow({ form }),
    { wrapper: createWrapper() },
  );

  await act(async () => {
    await result.current.completeWithHomePreview();
  });

  expect(actionFailedMock).toHaveBeenCalledWith(
    "notification_permission",
  );
  expect(stepCompletedMock).toHaveBeenCalledWith("notification");
  expect(replaceMock).toHaveBeenCalled();
});
