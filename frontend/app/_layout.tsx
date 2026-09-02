// // app/_layout.tsx
// import { Stack, useRouter } from "expo-router";
// import * as SplashScreen from "expo-splash-screen";
// import { useEffect } from "react";
// import { LogBox, StatusBar, View, Text, StyleSheet } from "react-native";
// import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { SafeAreaProvider } from "react-native-safe-area-context";
// import { KeyboardProvider } from "react-native-keyboard-controller";
// import { Ionicons } from "@expo/vector-icons";

// import { useIconFonts } from "@/src/hooks/use-icon-fonts";
// import { AuthProvider, useAuth } from "@/src/auth";
// import { OfflineBanner } from "@/src/components/OfflineBanner";
// import { ThemeProvider, useTheme } from "@/src/theme-context";
// import { LanguageProvider, useLanguage } from "@/src/i18n";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
// import {
//   schedulePushSetup,
//   registerForegroundNotificationListener,
//   registerNotificationResponseListener,
// } from "@/src/lib/pushNotifications";

// LogBox.ignoreAllLogs(true);

// SplashScreen.preventAutoHideAsync();

// // ----- Percentage Loader Component -----
// function AppLoader() {
//   const { loading, loadProgress } = useAuth();
//   const { t } = useLanguage();

//   // If auth is not loading, we don't need to show loader
//   if (!loading) return null;

//   const pct = Math.min(100, Math.max(0, loadProgress));

//   return (
//     <View style={styles.loaderOverlay}>
//       <View style={styles.loaderCard}>
//         <Ionicons name="sparkles" size={32} color={theme.brandPrimary} />
//         <Text style={styles.loaderPercent}>{Math.round(pct)}%</Text>
//         <View style={styles.loaderBar}>
//           <View style={[styles.loaderFill, { width: `${pct}%` }]} />
//         </View>
//         <Text style={styles.loaderText}>{t.common.loading} GC Smart…</Text>
//       </View>
//     </View>
//   );
// }

// // ----- Main App with Auth -----
// function AppContent() {
//   const { loading, user } = useAuth();
//   const t = useTheme();
//   const router = useRouter();

//   // ----- Push notifications (safe/deferred — see src/lib/pushNotifications.ts) -----
//   // Registration only starts AFTER auth has finished loading (we need the
//   // auth token for the backend call) and is deferred 1.5s so it can never
//   // delay or freeze startup. All native calls inside are try/catch-guarded.
//   useEffect(() => {
//     if (loading || !user?.user_id) return;

//     schedulePushSetup();

//     const disposeReceived = registerForegroundNotificationListener();
//     // Tapping a push opens the linked screen when the link is a valid
//     // in-app route; anything else is ignored.
//     const disposeResponse = registerNotificationResponseListener((link) => {
//       if (typeof link === "string" && link.startsWith("/")) {
//         try {
//           router.push(link as any);
//         } catch (e) {
//           console.warn("[push] failed to navigate to link:", link, e);
//         }
//       }
//     });

//     return () => {
//       disposeReceived();
//       disposeResponse();
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [loading, user?.user_id]);

//   // Show loader over the entire app during auth initialization
//   if (loading) {
//     return <AppLoader />;
//   }

//   return (
//     <>
//       {/* Status bar adapts to the active theme (light text on dark mode). */}
//       <StatusBar
//         barStyle={t.onSurface === "#F1F5F9" ? "light-content" : "dark-content"}
//         translucent
//         backgroundColor="transparent"
//       />
//       {/* Slim strip under the status bar whenever the device is offline. */}
//       <OfflineBanner />
//       <Stack
//         screenOptions={{
//           headerShown: false,
//           animation: "fade",
//           // Every pushed screen sits on the themed surface so no white
//           // flash appears behind transitions in dark mode.
//           contentStyle: { backgroundColor: t.surface },
//         }}
//       />
//     </>
//   );
// }

// export default function RootLayout() {
//   useTheme(); // re-render this screen when light/dark changes
//   const [loaded, error] = useIconFonts();

//   useEffect(() => {
//     if (loaded || error) {
//       SplashScreen.hideAsync();
//     }
//   }, [loaded, error]);

//   if (!loaded && !error) return null;

//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <ThemeProvider>
//         <LanguageProvider>
//           <SafeAreaProvider>
//             <KeyboardProvider>
//               <AuthProvider>
//                 <AppContent />
//               </AuthProvider>
//             </KeyboardProvider>
//           </SafeAreaProvider>
//         </LanguageProvider>
//       </ThemeProvider>
//     </GestureHandlerRootView>
//   );
// }

// const createStyles = (t: Palette) => StyleSheet.create({
//   loaderOverlay: {
//     flex: 1,
//     backgroundColor: "rgba(255,255,255,0.95)",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   loaderCard: {
//     backgroundColor: t.surfaceSecondary,
//     borderRadius: radii.md,
//     padding: spacing.xl,
//     alignItems: "center",
//     gap: 8,
//     minWidth: 160,
//     ...shadow1,
//   },
//   loaderPercent: {
//     fontSize: 28,
//     fontWeight: "800",
//     color: t.brand,
//   },
//   loaderBar: {
//     width: 120,
//     height: 4,
//     backgroundColor: t.surfaceTertiary,
//     borderRadius: 2,
//     overflow: "hidden",
//   },
//   loaderFill: {
//     height: "100%",
//     backgroundColor: t.brandPrimary,
//     borderRadius: 2,
//   },
//   loaderText: {
//     fontSize: 13,
//     color: t.onSurfaceMuted,
//   },
// });

// // Rebuild the module styles whenever the active palette changes so
// // every consumer (including helper components outside the screen
// // function) picks up light/dark without prop drilling.
// let styles = createStyles(getPaletteSnapshot());
// subscribeTheme(() => {
//   styles = createStyles(getPaletteSnapshot());
// });













































// app/_layout.tsx
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { LogBox, StatusBar, View, Text, StyleSheet, Modal, Pressable } from "react-native";
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
import { storage } from "@/src/utils/storage";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

const PROFILE_PHOTO_REMINDER_KEY = "gcsharp_profile_photo_reminder_disabled";
const PROFILE_PHOTO_REMINDER_DELAY = 2 * 60 * 1000;

function ProfilePhotoReminder() {
  const { user } = useAuth();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPhoto = Boolean(user?.profile_photo || user?.local_photo_uri);

  useEffect(() => {
    let mounted = true;
    storage.getItem<boolean>(PROFILE_PHOTO_REMINDER_KEY, false).then((saved) => {
      if (mounted) setDisabled(Boolean(saved));
    });
    return () => {
      mounted = false;
    };
  }, [user?.user_id]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);

    if (!user?.user_id || hasPhoto || disabled) return;

    timerRef.current = setTimeout(() => setVisible(true), PROFILE_PHOTO_REMINDER_DELAY);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [disabled, hasPhoto, user?.user_id]);

  const cancel = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), PROFILE_PHOTO_REMINDER_DELAY);
  };

  const disableReminder = async () => {
    setDisabled(true);
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    await storage.setItem(PROFILE_PHOTO_REMINDER_KEY, true);
  };

  const openEditProfile = () => {
    setVisible(false);
    router.push("/edit-profile");
  };

  if (!user?.user_id || hasPhoto || disabled) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.profileReminderBackdrop}>
        <View style={styles.profileReminderCard}>
          <View style={styles.profileReminderIcon}>
            <Ionicons name="person-add-outline" size={28} color={theme.brandPrimary} />
          </View>
          <Text style={styles.profileReminderTitle}>Add a profile picture</Text>
          <Text style={styles.profileReminderText}>
            Help other students recognise you on the leaderboard by adding a profile picture.
          </Text>
          <Pressable onPress={openEditProfile} style={styles.profileReminderPrimary}>
            <Text style={styles.profileReminderPrimaryText}>Go to Edit Profile</Text>
          </Pressable>
          <Pressable onPress={cancel} style={styles.profileReminderSecondary}>
            <Text style={styles.profileReminderSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={disableReminder} style={styles.profileReminderNever}>
            <Text style={styles.profileReminderNeverText}>Don&apos;t show me this again</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

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
  const { loading } = useAuth();
  const t = useTheme();

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
      <ProfilePhotoReminder />
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
  profileReminderBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  profileReminderCard: {
    width: "100%",
    maxWidth: 380,
    padding: spacing.xl,
    alignItems: "center",
    borderRadius: radii.lg,
    backgroundColor: t.surfaceSecondary,
    ...shadow1,
  },
  profileReminderIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: t.brandTertiary,
    marginBottom: spacing.md,
  },
  profileReminderTitle: { color: t.onSurface, fontSize: 20, fontWeight: "800", textAlign: "center" },
  profileReminderText: { color: t.onSurfaceMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8, marginBottom: spacing.lg },
  profileReminderPrimary: { width: "100%", minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.md, backgroundColor: t.brandPrimary },
  profileReminderPrimaryText: { color: t.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  profileReminderSecondary: { width: "100%", minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
  profileReminderSecondaryText: { color: t.onSurface, fontSize: 14, fontWeight: "700" },
  profileReminderNever: { padding: 8, marginTop: 2 },
  profileReminderNeverText: { color: t.onSurfaceMuted, fontSize: 12, textDecorationLine: "underline" },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});