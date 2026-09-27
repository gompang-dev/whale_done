/** @jest-environment node */

import { REMINDER_BODIES } from "../supabase/functions/send-reminder-push/reminder-message";

const mockServe = jest.fn();
const mockCreateClient = jest.fn();

jest.mock(
  "https://deno.land/std@0.224.0/http/server.ts",
  () => ({ serve: mockServe }),
  { virtual: true },
);
jest.mock(
  "https://esm.sh/@supabase/supabase-js@2.95.3",
  () => ({ createClient: mockCreateClient }),
  { virtual: true },
);

type QueryRow = Record<string, unknown>;
type QueryState = {
  filters: ((row: QueryRow) => boolean)[];
  update?: QueryRow;
  range?: [number, number];
};

const makeSupabase = (failLogUpdate = false) => {
  const boards: QueryRow[] = [
    { id: "board-1", profile_id: "profile-1", status: "active" },
    { id: "board-2", profile_id: "profile-2", status: "active" },
    { id: "board-3", profile_id: "profile-2", status: "active" },
    {
      id: "board-4",
      profile_id: "profile-3",
      status: "completed",
      completed_at: "2026-09-27T02:00:00.000Z",
    },
  ];
  const stickerDaily: QueryRow[] = [
    { board_id: "board-2", d: "2026-09-27", count: 1 },
    { board_id: "board-4", d: "2026-09-27", count: 1 },
  ];
  const logs: QueryRow[] = [1, 2, 3].map((number) => ({
    id: `log-${number}`,
    message_body: REMINDER_BODIES.none,
  }));
  const reminders = [1, 2, 3].map((number) => ({
    notification_log_id: `log-${number}`,
    profile_id: `profile-${number}`,
    local_date: "2026-09-27",
    local_time: "21:00",
    push_tokens: [`token-${number}`],
  }));

  const tables: Record<string, QueryRow[]> = {
    boards,
    sticker_daily: stickerDaily,
    notification_logs: logs,
  };

  const from = (table: string) => {
    const state: QueryState = { filters: [] };
    const query = {
      select: (_columns: string) => query,
      in: (column: string, values: unknown[]) => {
        state.filters.push((row) => values.includes(row[column]));
        return query;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push((row) => row[column] === value);
        return query;
      },
      gt: (column: string, value: number) => {
        state.filters.push((row) => Number(row[column]) > value);
        return query;
      },
      gte: (column: string, value: string) => {
        state.filters.push((row) => String(row[column]) >= value);
        return query;
      },
      lt: (column: string, value: string) => {
        state.filters.push((row) => String(row[column]) < value);
        return query;
      },
      order: (_column: string) => query,
      range: (start: number, end: number) => {
        state.range = [start, end];
        return query;
      },
      update: (values: QueryRow) => {
        state.update = values;
        return query;
      },
      then: (
        resolve: (result: {
          data: QueryRow[] | null;
          error: Error | null;
        }) => void,
      ) => {
        if (table === "notification_logs" && failLogUpdate) {
          resolve({ data: null, error: new Error("log update failed") });
          return;
        }
        const rows = tables[table]
          .filter((row) => state.filters.every((filter) => filter(row)))
          .slice(state.range?.[0] ?? 0, (state.range?.[1] ?? Infinity) + 1);
        if (state.update)
          rows.forEach((row) => Object.assign(row, state.update));
        resolve({ data: rows, error: null });
      },
    };
    return query;
  };

  return {
    client: {
      from,
      rpc: jest.fn().mockResolvedValue({ data: reminders, error: null }),
    },
    logs,
  };
};

let handler: (request: Request) => Promise<Response>;
let originalFetch: typeof fetch;

beforeAll(() => {
  mockServe.mockImplementation((callback) => {
    handler = callback;
  });
  jest.requireActual("../supabase/functions/send-reminder-push/index");
  originalFetch = globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  (globalThis as typeof globalThis & { Deno: unknown }).Deno = {
    env: {
      get: (key: string) =>
        (
          ({
            CRON_SECRET: "test-secret",
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
          }) as Record<string, string>
        )[key],
    },
  };
  jest.useFakeTimers().setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

const sendReminder = () =>
  handler(
    new Request("http://localhost/send-reminder-push", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret" },
      body: JSON.stringify({ policy: "fixed_21" }),
    }),
  );

test("sends the three selected bodies and stores the matching log bodies", async () => {
  const { client, logs } = makeSupabase();
  mockCreateClient.mockReturnValue(client);
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [1, 2, 3].map((number) => ({
        status: "ok",
        id: `ticket-${number}`,
      })),
    }),
  });
  globalThis.fetch = fetchMock;

  const response = await sendReminder();
  const messages = JSON.parse(fetchMock.mock.calls[0][1].body);

  expect(response.status).toBe(200);
  expect(client.rpc).toHaveBeenCalledWith(
    "claim_fixed_21_push_reminders",
    expect.objectContaining({ p_message_body: REMINDER_BODIES.none }),
  );
  expect(messages.map((message: { body: string }) => message.body)).toEqual([
    REMINDER_BODIES.none,
    REMINDER_BODIES.partial,
    REMINDER_BODIES.all,
  ]);
  expect(logs.map((log) => log.message_body)).toEqual(
    messages.map((message: { body: string }) => message.body),
  );
});

test("does not send any push when a log body update fails", async () => {
  const { client } = makeSupabase(true);
  mockCreateClient.mockReturnValue(client);
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock;

  const response = await sendReminder();

  expect(response.status).toBe(500);
  expect(fetchMock).not.toHaveBeenCalled();
});
