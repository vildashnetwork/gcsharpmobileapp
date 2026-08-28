
















// app/_layout.tsx
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View, Text, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { ThemeProvider, useTheme } from "@/src/theme-context";
import { LanguageProvider, useLanguage } from "@/src/i18n";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import {
  schedulePushSetup,
  registerForegroundNotificationListener,
  registerNotificationResponseListener,
} from "@/src/lib/pushNotifications";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// ----- Percentage Loader Component -----
function AppLoader() {
  const { loading, loadProgress } = useAuth();
  const { t } = useLanguage();

  // If auth is not loading, we don't need to show loader
  if (!loading) return null;

  const pct = Math.min(100, Math.max(0, loadProgress));

  return (
    <View style={styles.loaderOverlay}>
      <View style={styles.loaderCard}>
        <Ionicons name="sparkles" size={32} color={theme.brandPrimary} />
        <Text style={styles.loaderPercent}>{Math.round(pct)}%</Text>
        <View style={styles.loaderBar}>
          <View style={[styles.loaderFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.loaderText}>{t.common.loading} GC Smart…</Text>
      </View>
    </View>
  );
}

// ----- Main App with Auth -----
function AppContent() {
  const { loading, user } = useAuth();
  const t = useTheme();
  const router = useRouter();

  // ----- Push notifications (safe/deferred — see src/lib/pushNotifications.ts) -----
  // Registration only starts AFTER auth has finished loading (we need the
  // auth token for the backend call) and is deferred 1.5s so it can never
  // delay or freeze startup. All native calls inside are try/catch-guarded.
  useEffect(() => {
    if (loading || !user?.user_id) return;

    schedulePushSetup();

    const disposeReceived = registerForegroundNotificationListener();
    // Tapping a push opens the linked screen when the link is a valid
    // in-app route; anything else is ignored.
    const disposeResponse = registerNotificationResponseListener((link) => {
      if (typeof link === "string" && link.startsWith("/")) {
        try {
          router.push(link as any);
        } catch (e) {
          console.warn("[push] failed to navigate to link:", link, e);
        }
      }
    });

    return () => {
      disposeReceived();
      disposeResponse();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.user_id]);

  // Show loader over the entire app during auth initialization
  if (loading) {
    return <AppLoader />;
  }

  return (
    <>
      {/* Status bar adapts to the active theme (light text on dark mode). */}
      <StatusBar
        barStyle={t.onSurface === "#F1F5F9" ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />
      {/* Slim strip under the status bar whenever the device is offline. */}
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          // Every pushed screen sits on the themed surface so no white
          // flash appears behind transitions in dark mode.
          contentStyle: { backgroundColor: t.surface },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  useTheme(); // re-render this screen when light/dark changes
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LanguageProvider>
          <SafeAreaProvider>
            <KeyboardProvider>
              <AuthProvider>
                <AppContent />
              </AuthProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </LanguageProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  loaderOverlay: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderCard: {
    backgroundColor: t.surfaceSecondary,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: 8,
    minWidth: 160,
    ...shadow1,
  },
  loaderPercent: {
    fontSize: 28,
    fontWeight: "800",
    color: t.brand,
  },
  loaderBar: {
    width: 120,
    height: 4,
    backgroundColor: t.surfaceTertiary,
    borderRadius: 2,
    overflow: "hidden",
  },
  loaderFill: {
    height: "100%",
    backgroundColor: t.brandPrimary,
    borderRadius: 2,
  },
  loaderText: {
    fontSize: 13,
    color: t.onSurfaceMuted,
  },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});