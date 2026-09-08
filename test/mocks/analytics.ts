type AnalyticsFacade =
  typeof import("@/services/analytics/events/analytics")["analytics"];

export const postHogClient = {};

const noop = async () => {};

export const analytics = {
  action: {
    failed: noop,
  },
  board: {
    created: noop,
    updated: noop,
    deleted: noop,
    stickerCollected: noop,
    completed: noop,
    activeLimitReached: noop,
    editStarted: noop,
  },
  navigation: {
    viewed: noop,
  },
  notification: {
    toggled: noop,
    permissionResolved: noop,
  },
  onboarding: {
    started: noop,
    stepCompleted: noop,
  },
} satisfies AnalyticsFacade;

export const useTrackOnboardingStart = () => {};
export const useTrackView = () => {};
export const useIdentifyUser = () => {};
