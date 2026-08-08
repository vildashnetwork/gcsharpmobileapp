import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function Index() {
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

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface },
});
