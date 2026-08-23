// import { Stack } from "expo-router";
// import * as SplashScreen from "expo-splash-screen";
// import { useEffect } from "react";
// import { LogBox, StatusBar } from "react-native";
// import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { SafeAreaProvider } from "react-native-safe-area-context";
// import { KeyboardProvider } from "react-native-keyboard-controller";

// import { useIconFonts } from "@/src/hooks/use-icon-fonts";
// import { AuthProvider } from "@/src/auth";

// LogBox.ignoreAllLogs(true);

// // Keep the native splash visible from cold start until icon fonts register.
// // Required because @expo/vector-icons' componentDidMount fallback fires
// // Font.loadAsync against a broken vendor path if any <Icon> mounts before
// // the family is registered — which throws on Android Expo Go.
// SplashScreen.preventAutoHideAsync();

// export default function RootLayout() {
//   const [loaded, error] = useIconFonts();

//   useEffect(() => {
//     if (loaded || error) {
//       SplashScreen.hideAsync();
//     }
//   }, [loaded, error]);

//   if (!loaded && !error) return null;

//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <SafeAreaProvider>
//         <KeyboardProvider>
//           <AuthProvider>
//             <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
//             <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
//           </AuthProvider>
//         </KeyboardProvider>
//       </SafeAreaProvider>
//     </GestureHandlerRootView>
//   );
// }



























// app/_layout.tsx
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View, Text, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { theme, spacing, radii, shadow1 } from "@/src/theme";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// ----- Percentage Loader Component -----
function AppLoader() {
  const { loading, loadProgress } = useAuth();

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
        <Text style={styles.loaderText}>Loading GC Smart…</Text>
      </View>
    </View>
  );
}

// ----- Main App with Auth -----
function AppContent() {
  const { loading } = useAuth();

  // Show loader over the entire app during auth initialization
  if (loading) {
    return <AppLoader />;
  }

  return (
    <>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loaderOverlay: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderCard: {
    backgroundColor: "#fff",
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
    color: theme.brand,
  },
  loaderBar: {
    width: 120,
    height: 4,
    backgroundColor: theme.surfaceTertiary,
    borderRadius: 2,
    overflow: "hidden",
  },
  loaderFill: {
    height: "100%",
    backgroundColor: theme.brandPrimary,
    borderRadius: 2,
  },
  loaderText: {
    fontSize: 13,
    color: theme.onSurfaceMuted,
  },
});