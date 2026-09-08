import { useEffect } from "react";
import { postHogClient } from "../adapters/posthog-client";

export const useIdentifyUser = (profileId: string | null) => {
  useEffect(() => {
    if (!profileId) return;

    postHogClient.identify(profileId);
  }, [profileId]);
};
