import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { theme, spacing } from "@/src/theme";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function PdfViewer() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const fullUrl = url?.startsWith("http") ? url : `${BACKEND}${url ?? ""}`;
  const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fullUrl)}`;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.root} testID="pdf-viewer">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title || "PDF Paper"}</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: viewerUrl }}
          onLoadEnd={() => setLoading(false)}
          startInLoadingState
          testID="pdf-webview"
        />
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={theme.brandPrimary} />
            <Text style={styles.loadTxt}>Loading paper...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: theme.divider,
  },
  title: { fontSize: 16, fontWeight: "800", color: theme.brand, flex: 1, textAlign: "center" },
  loader: {
    position: "absolute", inset: 0, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.surface, gap: 8,
  },
  loadTxt: { color: theme.onSurfaceMuted },
});
