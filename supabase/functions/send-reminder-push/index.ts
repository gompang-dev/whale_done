import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import {
  getKstDayWindow,
  getReminderBody,
  REMINDER_BODIES,
} from "./reminder-message.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MESSAGE_TRIGGER = "evening_reminder";
const MESSAGE_TYPE = "whale_message";
const MESSAGE_TITLE = "웨일던";

type ReminderPolicy = "custom_time" | "fixed_21";

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ClaimedReminder = {
  notification_log_id: string;
  profile_id: string;
  local_date: string;
  local_time: string;
  push_tokens: string[] | null;
};

type PushMessage = {
  logId: string;
  token: string;
  body: string;
};

type BoardRow = {
  id: string;
  profile_id: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

const CLAIM_RPC_BY_POLICY = {
  custom_time: "claim_due_push_reminders",
  fixed_21: "claim_fixed_21_push_reminders",
} as const satisfies Record<ReminderPolicy, string>;

const getEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};

const getSupabaseServiceKey = () => {
  const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyServiceRoleKey) return legacyServiceRoleKey;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) throw new Error("SUPABASE_SECRET_KEYS is required");

  const parsed = JSON.parse(secretKeys) as Record<string, string>;
  const defaultSecretKey = parsed.default;
  if (!defaultSecretKey) {
    throw new Error("SUPABASE_SECRET_KEYS.default is required");
  }

  return defaultSecretKey;
};

const authorize = (request: Request) => {
  const cronSecret = getEnv("CRON_SECRET");
  const schedulerSecret = request.headers.get("x-cron-secret");
  if (schedulerSecret) return schedulerSecret === cronSecret;

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const loadBoards = async (
  supabase: SupabaseClient,
  profileIds: string[],
  status: "active" | "completed",
  dayStart: string,
  dayEnd: string,
) => {
  const boards: BoardRow[] = [];

  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("boards")
      .select("id, profile_id")
      .in("profile_id", profileIds)
      .eq("status", status)
      .order("id")
      .range(offset, offset + 999);

    if (status === "completed") {
      query = query.gte("completed_at", dayStart).lt("completed_at", dayEnd);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []) as BoardRow[];
    boards.push(...page);
    if (page.length < 1000) break;
  }

  return boards;
};

const getReminderBodies = async (
  supabase: SupabaseClient,
  reminders: ClaimedReminder[],
  now: Date,
) => {
  const { date, start, end } = getKstDayWindow(now);
  const boardIdsByProfile = new Map<string, Set<string>>();
  const profileIds = [...new Set(reminders.map((item) => item.profile_id))];

  for (const profileId of profileIds) {
    boardIdsByProfile.set(profileId, new Set());
  }

  for (const profileChunk of chunk(profileIds, 100)) {
    const [activeBoards, completedTodayBoards] = await Promise.all([
      loadBoards(supabase, profileChunk, "active", start, end),
      loadBoards(supabase, profileChunk, "completed", start, end),
    ]);

    for (const board of [...activeBoards, ...completedTodayBoards]) {
      boardIdsByProfile.get(board.profile_id)?.add(board.id);
    }
  }

  const checkedBoardIds = new Set<string>();
  const boardIds = [
    ...new Set([...boardIdsByProfile.values()].flatMap((ids) => [...ids])),
  ];

  for (const boardChunk of chunk(boardIds, 100)) {
    const { data, error } = await supabase
      .from("sticker_daily")
      .select("board_id")
      .eq("d", date)
      .gt("count", 0)
      .in("board_id", boardChunk);

    if (error) throw error;
    for (const row of data ?? []) checkedBoardIds.add(row.board_id);
  }

  return new Map<string, string>(
    profileIds.map(
      (profileId) =>
        [
          profileId,
          getReminderBody(
            [...(boardIdsByProfile.get(profileId) ?? [])],
            checkedBoardIds,
          ),
        ] as const,
    ),
  );
};

const updateReminderLogBodies = async (
  supabase: SupabaseClient,
  reminders: ClaimedReminder[],
  bodiesByProfile: Map<string, string>,
) => {
  const logIdsByBody = new Map<string, string[]>();

  for (const reminder of reminders) {
    const body = bodiesByProfile.get(reminder.profile_id);
    if (!body)
      throw new Error("Reminder body is missing for a claimed profile");
    logIdsByBody.set(body, [
      ...(logIdsByBody.get(body) ?? []),
      reminder.notification_log_id,
    ]);
  }

  for (const [body, logIds] of logIdsByBody) {
    for (const logChunk of chunk(logIds, 100)) {
      const { data, error } = await supabase
        .from("notification_logs")
        .update({ message_body: body })
        .in("id", logChunk)
        .select("id, message_body");

      if (error) throw error;
      const updatedIds = new Set(
        (data ?? [])
          .filter((log) => log.message_body === body)
          .map((log) => log.id),
      );
      if (logChunk.some((id) => !updatedIds.has(id))) {
        throw new Error("Failed to confirm every reminder log body update");
      }
    }
  }
};

serve(async (request: Request) => {
  try {
    if (!authorize(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const requestBody = (await request.json().catch(() => ({}))) as {
      policy?: unknown;
    };
    const policy = requestBody.policy ?? "custom_time";
    if (policy !== "custom_time" && policy !== "fixed_21") {
      return Response.json(
        { ok: false, error: "Invalid reminder policy" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      getEnv("SUPABASE_URL"),
      getSupabaseServiceKey(),
      { auth: { persistSession: false } },
    );
    const now = new Date();

    const { data: claimedReminders, error: claimError } = await supabase.rpc(
      CLAIM_RPC_BY_POLICY[policy],
      {
        p_now: now.toISOString(),
        p_limit: 1000,
        p_message_type: MESSAGE_TYPE,
        p_message_trigger: MESSAGE_TRIGGER,
        p_message_body: REMINDER_BODIES.none,
      },
    );

    if (claimError) throw claimError;

    const reminders = (claimedReminders ?? []) as ClaimedReminder[];
    const bodiesByProfile = await getReminderBodies(supabase, reminders, now);
    await updateReminderLogBodies(supabase, reminders, bodiesByProfile);
    const deliveryState = new Map<
      string,
      {
        ticketIds: string[];
        ticketTokenMap: Record<string, string>;
        errors: string[];
      }
    >();
    const messages: PushMessage[] = [];

    for (const reminder of reminders) {
      const body = bodiesByProfile.get(reminder.profile_id);
      if (!body) {
        throw new Error("Reminder body is missing for a claimed profile");
      }

      deliveryState.set(reminder.notification_log_id, {
        ticketIds: [],
        ticketTokenMap: {},
        errors: [],
      });

      for (const token of new Set(reminder.push_tokens ?? [])) {
        messages.push({
          logId: reminder.notification_log_id,
          token,
          body,
        });
      }
    }

    let sentTokenCount = 0;
    const invalidTokens = new Set<string>();
    const allErrors: string[] = [];

    for (const messageChunk of chunk(messages, 100)) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          messageChunk.map(({ token, body }) => ({
            to: token,
            title: MESSAGE_TITLE,
            body,
            sound: "default",
            channelId: "remind.v1",
            data: { trigger: MESSAGE_TRIGGER },
          })),
        ),
      });

      if (!response.ok) {
        const errorMessage = `Expo push request failed: ${response.status}`;
        allErrors.push(errorMessage);
        for (const message of messageChunk) {
          deliveryState.get(message.logId)?.errors.push(errorMessage);
        }
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      if (!payload.data) {
        const errorMessage = "Expo push response missing data";
        allErrors.push(errorMessage);
        for (const message of messageChunk) {
          deliveryState.get(message.logId)?.errors.push(errorMessage);
        }
        continue;
      }

      payload.data.forEach((ticket, index) => {
        const message = messageChunk[index];
        const state = deliveryState.get(message.logId);
        if (!state) return;

        if (ticket.status === "ok" && ticket.id) {
          state.ticketIds.push(ticket.id);
          state.ticketTokenMap[ticket.id] = message.token;
          sentTokenCount += 1;
          return;
        }

        const errorMessage = ticket.message ?? "Expo push ticket failed";
        state.errors.push(errorMessage);
        allErrors.push(errorMessage);
        if (ticket.details?.error === "DeviceNotRegistered") {
          invalidTokens.add(message.token);
        }
      });
    }

    for (const [logId, state] of deliveryState.entries()) {
      const { error: updateError } = await supabase
        .from("notification_logs")
        .update({
          expo_ticket_ids: state.ticketIds.length > 0 ? state.ticketIds : null,
          expo_ticket_token_map:
            Object.keys(state.ticketTokenMap).length > 0
              ? state.ticketTokenMap
              : null,
          expo_error:
            state.errors.length > 0 ? state.errors.slice(-5).join("\n") : null,
        })
        .eq("id", logId);

      if (updateError) {
        console.error("Failed to update notification log", {
          logId,
          error: updateError,
        });
      }
    }

    if (invalidTokens.size > 0) {
      await supabase
        .from("devices")
        .update({ push_token: null, push_enabled: false })
        .in("push_token", [...invalidTokens]);
    }

    const summary = {
      ok: true,
      policy,
      claimedProfiles: reminders.length,
      queuedTokens: messages.length,
      sentTokens: sentTokenCount,
      invalidTokens: invalidTokens.size,
      errors: allErrors,
    };

    console.info("send-reminder-push summary", summary);

    return Response.json(summary);
  } catch (error) {
    console.error("send-reminder-push failed", error);

    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
});
