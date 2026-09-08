export { postHogClient } from "./adapters/posthog-client";
export { analytics } from "./events/analytics";
export { useTrackOnboardingStart } from "./hooks/use-track-onboarding-start";
export { useTrackView } from "./hooks/use-track-view";
export { useIdentifyUser } from "./hooks/use-identify-user";
export type {
  AnalyticsAction,
  OnboardingStep,
} from "./core/analytics.types";
