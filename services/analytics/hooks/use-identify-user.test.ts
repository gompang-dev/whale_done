import { renderHook } from "@testing-library/react-native";
import { postHogClient } from "../adapters/posthog-client";
import { useIdentifyUser } from "./use-identify-user";

jest.mock("../adapters/posthog-client", () => ({
  postHogClient: {
    identify: jest.fn(),
  },
}));

const identifyMock = jest.mocked(postHogClient.identify);

test("profile ID가 준비되면 PostHog 사용자를 식별한다", async () => {
  const view = await renderHook(
    ({ profileId }: { profileId: string | null }) => useIdentifyUser(profileId),
    { initialProps: { profileId: null as string | null } },
  );

  expect(identifyMock).not.toHaveBeenCalled();

  await view.rerender({ profileId: "profile-1" });

  expect(identifyMock).toHaveBeenCalledWith("profile-1");
  expect(identifyMock).toHaveBeenCalledTimes(1);
});
