import {
  normalizeBoardSetupPayload,
  type BoardRecord,
  type BoardSetupFormValues,
} from "@/features/board";
import { refreshAfterBoardChanged } from "@/features/board/queries/board-cache";
import { notification } from "@/services/notification";
import { analytics } from "@/services/analytics";
import { useUser } from "@/services/user";
import { toast } from "@/shared/toasts/toast";
import { reportError } from "@/shared/lib/report-error";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { saveOnboardingSetup } from "../actions/save-onboarding-setup";

type Props = {
  form: UseFormReturn<BoardSetupFormValues>;
};

const useOnboardingCompletionFlow = ({ form }: Props) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { completeOnboarding, overrideMode, profileId, setOverrideMode } =
    useUser();

  const persistOnboardingSetup = useCallback(async () => {
    if (!profileId) {
      throw new Error("profileId is required to create a board.");
    }

    const payload = normalizeBoardSetupPayload(form.getValues());
    if (!payload) {
      throw new Error("Onboarding payload is invalid.");
    }

    return saveOnboardingSetup(profileId, payload);
  }, [form, profileId]);

  const requestNotificationPermission = useCallback(async () => {
    try {
      await notification.requestPermissionFromOnboarding();
    } catch (error) {
      void analytics.action.failed("notification_permission");
      reportError(error, { scope: "onboarding.notificationPermission" });
      toast.error("알림 권한 정보를 저장하는 중 오류가 발생했어요.");
    }
  }, []);

  const openHomePreview = useCallback(
    (createdBoard: BoardRecord) => {
      router.replace({
        pathname: "/",
        params: {
          from: "onboarding",
          boardId: createdBoard.id,
        },
      });
    },
    [router],
  );

  const completeWithHomePreview = useCallback(async () => {
    let createdBoard: BoardRecord;

    try {
      createdBoard = await persistOnboardingSetup();
    } catch (error) {
      void analytics.action.failed("onboarding_setup");
      reportError(error, { scope: "onboarding.saveSetup" });
      toast.error("보드를 저장하는 중 오류가 발생했어요.");
      return;
    }

    void analytics.board.created("onboarding", createdBoard.targetCount);
    await requestNotificationPermission();
    await completeOnboarding();

    if (overrideMode === "onboarding") {
      await setOverrideMode("real");
    }

    await refreshAfterBoardChanged(queryClient);
    void analytics.onboarding.stepCompleted("notification");
    openHomePreview(createdBoard);
  }, [
    completeOnboarding,
    openHomePreview,
    overrideMode,
    persistOnboardingSetup,
    queryClient,
    requestNotificationPermission,
    setOverrideMode,
  ]);

  return {
    completeWithHomePreview,
  };
};

export default useOnboardingCompletionFlow;
