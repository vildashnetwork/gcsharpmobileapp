
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { useLanguage } from "@/src/i18n";

// Metadata for each tab — labels resolve from the active language dictionary
// at render time; the actual rendering order comes from the Tabs.Screen order.
function useTabItems() {
  const { t } = useLanguage();
  return [
    { name: "index", label: t.tabs.home, icon: "home-outline", iconActive: "home" },
    { name: "lessons", label: t.tabs.lessons, icon: "videocam-outline", iconActive: "videocam" },
    { name: "ai", label: t.tabs.ai, icon: "sparkles-outline", iconActive: "sparkles", center: true },
    { name: "library", label: t.tabs.library, icon: "book-outline", iconActive: "book" },
    { name: "profile", label: t.tabs.profile, icon: "person-outline", iconActive: "person" },
  ];
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const TAB_ITEMS = useTabItems();

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
  useTheme(); // re-render this screen when light/dark changes
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

const createStyles = (t: Palette) => StyleSheet.create({
  barWrapper: {
    backgroundColor: t.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: t.divider,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    paddingHorizontal: 6,
    backgroundColor: t.surfaceSecondary,
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
    color: t.onSurfaceMuted,
  },
  labelActive: {
    color: t.brandPrimary,
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
    backgroundColor: t.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: t.surfaceSecondary,
    ...shadow1,
  },
  centerButtonFocused: {
    backgroundColor: t.brand,
  },
  centerLabel: {
    marginTop: 4, // space between the raised button and the label
  },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});