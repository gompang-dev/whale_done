import { BoardRecord } from "@/features/board/types";
import { AppText } from "@/shared/ui";
import { cn } from "@/shared/utils/cn";
import { View } from "react-native";
import { BoardItemUi } from "../../hooks/use-board-item-ui";

type Props = {
  board: BoardRecord;
  ui: BoardItemUi;
  shouldApplyTodayDoneState?: boolean;
};

const BoardItemMeta = ({
  board,
  ui,
  shouldApplyTodayDoneState = true,
}: Props) => {
  const {
    boardDisabled,
    rewardText,
    isCompleted,
    isTodayDone,
    boardDDay,
    completedPeriodLabel,
  } = ui;
  const shouldShowTodayDoneState = shouldApplyTodayDoneState && isTodayDone;
  const shouldDisableText = shouldApplyTodayDoneState && boardDisabled;
  const displayStreak =
    !isCompleted &&
    board.currentStreak > 0 &&
    (!board.todaySuccess || board.currentStreak > 1)
      ? board.currentStreak
      : 0;

  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-[11px]">
      {/* emoji wrapper */}
      <View
        className={cn(
          "h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[13px]",
          isCompleted
            ? "bg-secondary-20"
            : shouldShowTodayDoneState
              ? "bg-neutral-100"
              : "bg-primary-100",
        )}
      >
        <AppText className="text-[19px] leading-[23px]">
          {board?.emoji ?? "🌱"}
        </AppText>
      </View>

      {/* board meta Wrapper */}
      <View className="min-w-0 flex-1 gap-[4px]">
        {/* board badges */}
        <View className="min-h-[16px] flex-row items-center gap-[5px]">
          {isCompleted && completedPeriodLabel ? (
            <View className="justify-center">
              <AppText
                variant="label12"
                weight="regular"
                maxFontSizeMultiplier={1.3}
                className="text-content-disabled"
              >
                {completedPeriodLabel}
              </AppText>
            </View>
          ) : (
            <View className="rounded-[10px] bg-neutral-100 px-[6px] py-[2px]">
              <AppText
                variant="label10"
                weight="semibold"
                maxFontSizeMultiplier={1.3}
                className="text-content-tertiary"
              >
                D+{boardDDay}
              </AppText>
            </View>
          )}
          {displayStreak > 0 ? (
            <View className="rounded-[10px] bg-secondary-20 px-[6px] py-[2px]">
              <AppText
                variant="label10"
                weight="semibold"
                maxFontSizeMultiplier={1.3}
                className="text-secondary-50"
              >
                연속 {displayStreak}일
              </AppText>
            </View>
          ) : null}
        </View>

        {/* 타이틀 Text */}
        <AppText
          numberOfLines={1}
          variant="body14"
          weight="semibold"
          maxFontSizeMultiplier={1.3}
          className={cn(
            isCompleted
              ? "text-black"
              : shouldDisableText
                ? "text-neutral-400"
                : "text-black",
          )}
        >
          {board.title}
        </AppText>

        {/* 보상 Text */}
        {rewardText && (
          <View className="flex-row items-center gap-[4px]">
            <AppText
              variant="label12"
              weight="regular"
              maxFontSizeMultiplier={1.3}
              className="text-content-tertiary"
            >
              보상: {rewardText}
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
};

export default BoardItemMeta;
