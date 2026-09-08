export type AnalyticsProperties = Record<
  string,
  string | number | boolean
>;

export type OnboardingStep =
  | "name"
  | "title"
  | "reward"
  | "limit"
  | "limitCount"
  | "notification";

export type AnalyticsAction =
  | "board_create"
  | "board_update"
  | "board_delete"
  | "sticker_collect"
  | "onboarding_setup"
  | "notification_permission"
  | "notification_toggle";

export type AnalyticsEventMap = {
  board_created: {
    source: "board_create" | "onboarding";
    target_count: number;
  };
  board_updated: undefined;
  board_deleted: undefined;
  sticker_collected: {
    source: "app" | "widget";
    board_id: string;
  };
  board_completed: {
    board_id: string;
    total_days_taken: number;
  };
  active_limit_reached: { source: "client" | "server" };
  board_edit_started: undefined;
  stats_viewed: undefined;
  archive_viewed: undefined;
  detail_viewed: undefined;
  onboarding_started: undefined;
  onboarding_step_completed: { step: OnboardingStep };
  notification_toggle: {
    requested_enabled: boolean;
    result_enabled: boolean;
    permission_status: "granted" | "denied" | "undetermined";
  };
  notification_permission_result: {
    status: "granted" | "denied" | "undetermined";
  };
  action_failed: { action: AnalyticsAction };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

type TrackEventArguments<EventName extends AnalyticsEventName> =
  AnalyticsEventMap[EventName] extends undefined
    ? [properties?: undefined]
    : [properties: AnalyticsEventMap[EventName]];

export type TrackEvent = <EventName extends AnalyticsEventName>(
  eventName: EventName,
  ...args: TrackEventArguments<EventName>
) => Promise<void>;
