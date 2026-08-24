
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, radii, shadow1 } from "@/src/theme";

// Metadata for each tab – the order here is just for reference;
// the actual rendering order comes from the Tabs.Screen order below.
const TAB_ITEMS = [
  { name: "index", label: "Home", icon: "home-outline", iconActive: "home" },
  { name: "lessons", label: "Lessons", icon: "videocam-outline", iconActive: "videocam" },
  { name: "ai", label: "AI", icon: "sparkles-outline", iconActive: "sparkles", center: true },
  { name: "library", label: "Library", icon: "book-outline", iconActive: "book" },
  { name: "profile", label: "Profile", icon: "person-outline", iconActive: "person" },
];

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.barWrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {state.routes.map((route: any, index: number) => {
          const meta = TAB_ITEMS.find((t) => t.name === route.name) ?? TAB_ITEMS[index];
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (meta.center) {
            // Raised circular button – pokes above the bar using negative margin
            return (
              <View key={route.key} style={styles.centerSlot}>
                <Pressable
                  onPress={onPress}
                  style={[styles.centerButton, focused && styles.centerButtonFocused]}
                  hitSlop={8}
                >
                  <Ionicons
                    name={(focused ? meta.iconActive : meta.icon) as any}
                    size={24}
                    color="#fff"
                  />
                </Pressable>
                <Text style={[styles.label, styles.centerLabel, focused && styles.labelActive]}>
                  {meta.label}
                </Text>
              </View>
            );
          }

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item}>
              <Ionicons
                name={(focused ? meta.iconActive : meta.icon) as any}
                size={22}
                color={focused ? theme.brandPrimary : theme.onSurfaceMuted}
              />
              <Text style={[styles.label, focused && styles.labelActive]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* Order here determines tab order – we place AI third (center) */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="lessons" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrapper: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: theme.divider,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.onSurfaceMuted,
  },
  labelActive: {
    color: theme.brandPrimary,
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  centerButton: {
    marginTop: -22, // pulls the button above the bar
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
    ...shadow1,
  },
  centerButtonFocused: {
    backgroundColor: theme.brand,
  },
  centerLabel: {
    marginTop: 4, // space between the raised button and the label
  },
});