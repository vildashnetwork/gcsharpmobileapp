// src/hooks/useAppUpdates.ts
// Checks for EAS Updates (OTA) published after the Play Store build was
// installed, downloads them, and asks the user to restart to apply them.
//
// Works only in standalone / EAS builds (Updates.isEnabled === true).
// No-ops in dev and Expo Go, so local development is unaffected.
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import * as Updates from "expo-updates";

export function useAppUpdates() {
  const checkingRef = useRef(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const checkAndApply = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable && !promptedRef.current) {
          await Updates.fetchUpdateAsync();
          promptedRef.current = true;
          Alert.alert(
            "Update available",
            "A newer version of GCSHARP has been downloaded. Restart now to apply it?",
            [
              { text: "Later", style: "cancel" },
              { text: "Restart now", onPress: () => Updates.reloadAsync() },
            ]
          );
        }
      } catch (e) {
        console.warn("[updates] check failed:", e);
      } finally {
        checkingRef.current = false;
      }
    };

    // Check once on launch…
    checkAndApply();

    // …and again every time the app returns to the foreground.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkAndApply();
    });
    return () => sub.remove();
  }, []);
}
