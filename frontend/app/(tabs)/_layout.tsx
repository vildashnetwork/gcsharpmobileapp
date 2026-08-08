import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, radii } from "@/src/theme";

function Icon({ name, focused, label }: { name: any; focused: boolean; label: string }) {
  return (
    <View style={[styles.item, focused && styles.itemActive]}>
      <Ionicons name={name} size={20} color={focused ? theme.brandPrimary : theme.onSurfaceMuted} />
      <Text style={[styles.label, focused && { color: theme.brandPrimary }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: "#fff",
          borderTopColor: theme.divider,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <Icon name="home-outline" focused={focused} label="Home" /> }}
      />
      <Tabs.Screen
        name="lessons"
        options={{ tabBarIcon: ({ focused }) => <Icon name="videocam-outline" focused={focused} label="Lessons" /> }}
      />
      <Tabs.Screen
        name="ai"
        options={{ tabBarIcon: ({ focused }) => <Icon name="sparkles-outline" focused={focused} label="AI" /> }}
      />
      <Tabs.Screen
        name="library"
        options={{ tabBarIcon: ({ focused }) => <Icon name="book-outline" focused={focused} label="Library" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ focused }) => <Icon name="person-outline" focused={focused} label="Profile" /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radii.md, gap: 2, minWidth: 60,
  },
  itemActive: { backgroundColor: theme.brandTertiary },
  label: { fontSize: 10, color: theme.onSurfaceMuted, fontWeight: "600", marginTop: 2 },
});
