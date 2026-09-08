import {
  BOARD_CREATE_DEFAULT_VALUES,
  BoardCreateFormValues,
  BoardCreatePayload,
  normalizeBoardCreatePayload,
} from "@/features/board/schema";
import { boardApi } from "@/features/board/board.api";
import { ActiveBoardLimitError } from "@/features/board/types";
import { useUser } from "@/services/user";
import { analytics } from "@/services/analytics";
import { toast } from "@/shared/toasts/toast";
import { reportError } from "@/shared/lib/report-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ZodError } from "zod";
import { ACTIVE_BOARD_LIMIT_MESSAGE } from "../domain/policies/board-policy";
import { refreshAfterBoardChanged } from "../queries/board-cache";

export const useCreateBoard = () => {
  const queryClient = useQueryClient();
  const { profileId } = useUser();

  const [formData, setFormData] = useState<BoardCreateFormValues>(
    BOARD_CREATE_DEFAULT_VALUES,
  );

  const resetBoard = () => {
    setFormData(BOARD_CREATE_DEFAULT_VALUES);
  };

  const changeFormData =
    <K extends keyof BoardCreateFormValues>(key: K) =>
    (value: BoardCreateFormValues[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
    };

  const { mutateAsync } = useMutation({
    mutationFn: (payload: BoardCreatePayload) => {
      return boardApi.createBoard(payload);
    },
    onSuccess: (createdBoard) => {
      void analytics.board.created("board_create", createdBoard.targetCount);
      resetBoard();
      void refreshAfterBoardChanged(queryClient);
    },
    onError: (error) => {
      if (error instanceof ActiveBoardLimitError) {
        void analytics.board.activeLimitReached("server");
        toast.error(ACTIVE_BOARD_LIMIT_MESSAGE);
        return;
      }

      void analytics.action.failed("board_create");
      reportError(error, { scope: "board.create" });
      toast.error("실패했습니다");
    },
  });

  const createBoard = () => {
    if (!profileId) return;

    let payload: BoardCreatePayload;

    try {
      payload = normalizeBoardCreatePayload(formData, profileId);
    } catch (error) {
      if (error instanceof ZodError) {
        toast.error(error.issues[0]?.message);
        return;
      }

      throw error;
    }

    return mutateAsync(payload);
  };

  return {
    formData,
    changeFormData,
    createBoard,
  };
};
