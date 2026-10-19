/**
 * LanguageSwitcher — a compact EN/FR toggle used on the welcome/splash,
 * registration/login and profile screens. Purely local: it flips the
 * LanguageProvider state and persists to AsyncStorage (never the backend).
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage, type Lang } from "@/src/i18n";
import { theme, radii } from "@/src/theme";

type Variant = "light" | "dark" | "card";

const OPTIONS: { key: Lang; label: string; icon: "language" | "language-outline" }[] = [
    { key: "en", label: "EN", icon: "language-outline" },
    { key: "fr", label: "FR", icon: "language" },
];

export function LanguageSwitcher({ variant = "card" }: { variant?: Variant }) {
    const { lang, setLang } = useLanguage();

    const isLight = variant === "light";
    const bg = isLight ? "rgba(255,255,255,0.18)" : theme.surfaceTertiary;
    const activeBg = isLight ? "#FFFFFF" : theme.surfaceSecondary;
    const activeText = theme.brandPrimary;
    const inactiveText = isLight ? "#FFFFFF" : theme.onSurfaceMuted;

    return (
        <View
            style={[styles.pill, { backgroundColor: bg }]}
            testID="language-switcher"
            accessibilityRole="tablist"
        >
            <Ionicons
                name="language-outline"
                size={16}
                color={isLight ? "#FFFFFF" : theme.onSurfaceMuted}
                style={styles.globe}
            />
            {OPTIONS.map((opt) => {
                const active = lang === opt.key;
                return (
                    <Pressable
                        key={opt.key}
                        onPress={() => setLang(opt.key)}
                        testID={`lang-${opt.key}`}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={[styles.option, active && { backgroundColor: activeBg }]}
                    >
                        <Text
                            style={[
                                styles.optionText,
                                { color: active ? activeText : inactiveText },
                            ]}
                        >
                            {opt.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: radii.pill,
        padding: 3,
        alignSelf: "flex-start",
    },
    globe: {
        marginHorizontal: 6,
    },
    option: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.pill,
    },
    optionText: {
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0.5,
    },
});

export default LanguageSwitcher;