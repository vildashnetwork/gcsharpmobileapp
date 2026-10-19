/**
 * OfflineBanner — a slim strip shown under the status bar while the device
 * is offline. Reassures the user the app still works on cached data.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "@/src/lib/useNetworkStatus";
import { theme } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";

export function OfflineBanner() {
    const isOnline = useNetworkStatus();
    if (isOnline) return null;

    return (
        <View style={styles.banner} testID="offline-banner">
            <Ionicons name="cloud-offline-outline" size={13} color="#fff" />
            <Text style={styles.text}>Offline — showing saved content</Text>
        </View>
    );
}

const createStyles = (t: Palette) => StyleSheet.create({
    banner: {
        backgroundColor: t.warning,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 12,
    },
    text: {
        color: t.onBrandPrimary,
        fontSize: 12,
        fontWeight: "600",
    },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});