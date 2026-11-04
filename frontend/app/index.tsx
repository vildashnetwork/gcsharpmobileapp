import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";

export default function Index() {
  useTheme(); // re-render this screen when light/dark changes
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/welcome");
    } else if (!user.onboarded && user.role === "student") {
      router.replace("/onboarding");
    } else if (user.role === "teacher") {
      router.replace("/teacher");
    } else {
      router.replace("/(tabs)");
    }
  }, [user, loading, router]);

  return (
    <View style={styles.c} testID="splash-screen">
      <ActivityIndicator color={theme.brandPrimary} size="large" />
    </View>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});
