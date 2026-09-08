import {
  FnbContainer,
  useIsFnbVisible,
  useRootBackExit,
} from "@/features/navigation";
import { postHogClient, useIdentifyUser } from "@/services/analytics";
import { AppLifecycleEffects } from "@/services/app-lifecycle";
import { UserProvider, useUser } from "@/services/user";
import { TopLevelSheetProvider } from "@/shared/components/bottom-sheet/top-level-sheet-provider";
import {
  isDebugEnabled,
  isStorybookEnabled,
} from "@/shared/constants/environment";
import { toastConfig, ToastKeyboardSync } from "@/shared/toasts/toast";
import { ToastRouteSync } from "@/shared/toasts/toast-route-sync";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PostHogProvider } from "posthog-react-native";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import StorybookUIRoot from "../.rnstorybook";
import "../global.css";

if (isDebugEnabled) {
  LogBox.ignoreLogs([
    "SafeAreaView has been deprecated and will be removed in a future release.",
  ]);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const RootLayoutNav = () => {
  const { isInitialized, profileId } = useUser();
  const pathname = usePathname();
  const shouldShowFnb = useIsFnbVisible();
  useRootBackExit(pathname);
  useIdentifyUser(profileId);

  if (!isInitialized) return null;

  const rootBackgroundColor = pathname === "/intro" ? "#000000" : "#FFFFFF";
  const statusBarStyle = pathname === "/intro" ? "light" : "dark";

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <View className="flex-1" style={{ backgroundColor: rootBackgroundColor }}>
        <PostHogProvider
          autocapture={false}
          client={postHogClient}
        >
          <TopLevelSheetProvider>
            <View
              className="flex-1"
              style={{
                backgroundColor: rootBackgroundColor,
              }}
            >
              <Stack
                screenOptions={{ animation: "fade", animationDuration: 175 }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen
                  name="(onboarding)"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="(modals)"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen name="signup" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="stats" options={{ headerShown: false }} />
                <Stack.Screen name="archives" options={{ headerShown: false }} />
                {isDebugEnabled ? (
                  <Stack.Screen
                    name="debug-settings"
                    options={{ headerShown: false }}
                  />
                ) : null}
              </Stack>
            </View>
            {shouldShowFnb && <FnbContainer />}
          </TopLevelSheetProvider>
        </PostHogProvider>
      </View>
    </>
  );
};
export default function RootLayout() {
  const [fontsLoaded, fontLoadError] = useFonts({
    Pretendard: require("../assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("../assets/fonts/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("../assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("../assets/fonts/Pretendard-Bold.otf"),
  });

  // 폰트가 로드되기 전에는 시스템 폰트로 한 프레임 렌더링하지 않는다.
  if (!fontsLoaded && !fontLoadError) return null;

  if (isStorybookEnabled) {
    return <StorybookUIRoot />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <UserProvider>
              <AppLifecycleEffects />
              <RootLayoutNav />
              <ToastRouteSync />
              <ToastKeyboardSync />
              <Toast config={toastConfig} />
            </UserProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
