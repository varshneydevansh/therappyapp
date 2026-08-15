import { Stack } from "expo-router";
import {
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  usePreventScreenCapture,
} from "expo-screen-capture";
import { useEffect } from "react";
import { Platform } from "react-native";

const GLOBAL_SCREEN_CAPTURE_KEY = "therapy-app-global-screen-capture";

export default function RootLayout() {
  usePreventScreenCapture(GLOBAL_SCREEN_CAPTURE_KEY);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    void enableAppSwitcherProtectionAsync(1).catch((error) => {
      console.warn("Unable to enable app-switcher privacy protection", error);
    });

    return () => {
      void disableAppSwitcherProtectionAsync().catch((error) => {
        console.warn("Unable to disable app-switcher privacy protection", error);
      });
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="login"
        options={{
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="course/[id]" />
    </Stack>
  );
}
