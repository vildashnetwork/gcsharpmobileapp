// app/edit-profile.tsx
import { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import * as ImagePicker from "expo-image-picker";

const LEVELS = ["GCE O Level", "GCE A Level", "HND", "Concours"];
const DAILY_COMMITMENTS = [
    { label: "15 mins", value: "15 mins" },
    { label: "30 mins", value: "30 mins" },
    { label: "45 mins", value: "45 mins" },
    { label: "1 hour", value: "1 hour" },
    { label: "2 hours", value: "2 hours" },
];

const CLOUD_NAME = "qsmemy5r";
const UPLOAD_PRESET = "gcsharp";

export default function EditProfile() {
  useTheme(); // re-render this screen when light/dark changes
    const { user, refresh } = useAuth(); // ✅ Use refresh instead of setUser
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [form, setForm] = useState({
        name: "", // This maps to full_name on the backend
        bio: "",
        institution: "",
        exam_level: "",
        daily_commitment: "1 hour",
        picture: "",
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showLevelPicker, setShowLevelPicker] = useState(false);
    const [showCommitmentPicker, setShowCommitmentPicker] = useState(false);

    useEffect(() => {
        if (user) {
            setForm({
                name: user.full_name || "",
                bio: (user as any).bio || "",
                institution: (user as any).institution || "",
                exam_level: user.exam_level || "",
                daily_commitment: (user as any).daily_commitment || "1 hour",
                picture: user.profile_photo || (user as any).picture || "",
            });
        }
    }, [user]);

    const updateField = (key: string, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const uploadImage = async (uri: string) => {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", {
            uri,
            type: "image/jpeg",
            name: "profile.jpg",
        } as any);
        formData.append("upload_preset", UPLOAD_PRESET);

        try {
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
                { method: "POST", body: formData }
            );
            const data = await response.json();
            if (data.secure_url) {
                updateField("picture", data.secure_url);
                return data.secure_url;
            } else {
                throw new Error(data.error?.message || "Upload failed");
            }
        } catch (error) {
            console.error("Cloudinary upload error:", error);
            Alert.alert("Upload failed", "Could not upload image. Please try again.");
            return null;
        } finally {
            setUploading(false);
        }
    };

    // 🔧 Fixed pickImage with proper guard against undefined ImagePicker
    const pickImage = async (useCamera: boolean) => {
        // Check if ImagePicker is available (e.g., in Expo Go or dev build)
        if (!ImagePicker || typeof ImagePicker.requestMediaLibraryPermissionsAsync !== "function") {
            Alert.alert(
                "Unavailable",
                "Image picker is not available. Please use a development build or update the app."
            );
            return;
        }

        try {
            if (useCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== "granted") {
                    Alert.alert("Permission needed", "Camera access is required.");
                    return;
                }
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== "granted") {
                    Alert.alert("Permission needed", "Gallery access is required.");
                    return;
                }
            }

            const result = useCamera
                ? await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    quality: 0.8,
                })
                : await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    quality: 0.8,
                });

            if (!result.canceled && result.assets[0]) {
                const uri = result.assets[0].uri;
                await uploadImage(uri);
            }
        } catch (error) {
            console.error("Image picker error:", error);
            Alert.alert("Error", "Could not pick image. Please try again.");
        }
    };

    const showImagePickerOptions = () => {
        Alert.alert(
            "Profile Picture",
            "Choose source",
            [
                { text: "Camera", onPress: () => pickImage(true) },
                { text: "Gallery", onPress: () => pickImage(false) },
                { text: "Cancel", style: "cancel" },
            ],
            { cancelable: true }
        );
    };

    const save = async () => {
        setSaving(true);
        try {
            const payload = {
                full_name: form.name, // ✅ Backend expects full_name
                bio: form.bio,
                institution: form.institution,
                exam_level: form.exam_level,
                daily_commitment: form.daily_commitment,
                picture: form.picture,
            };
            await api<any>("/auth/profile", {
                method: "PUT",
                body: payload,
            });
            // ✅ Refresh user state instead of using setUser
            await refresh();
            Alert.alert("Success", "Profile updated!");
            router.back();
        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Could not save changes. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const initials = (form.name || "U").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

    return (
        <SafeAreaView edges={["top"]} style={styles.root} testID="edit-profile-screen">
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.brand} />
                </Pressable>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 20 }}>
                {/* Avatar */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarWrapper}>
                        {form.picture ? (
                            <Image source={{ uri: form.picture }} style={styles.avatarImage} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarPlaceholderText}>{initials}</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={styles.cameraBtn}
                            onPress={showImagePickerOptions}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="camera" size={18} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.avatarHint}>Tap camera to change photo</Text>
                </View>

                {/* Name */}
                <View style={styles.field}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                        style={styles.input}
                        value={form.name}
                        onChangeText={(v) => updateField("name", v)}
                        placeholder="Your full name"
                        placeholderTextColor={theme.onSurfaceMuted}
                    />
                </View>

                {/* Institution */}
                <View style={styles.field}>
                    <Text style={styles.label}>Institution</Text>
                    <TextInput
                        style={styles.input}
                        value={form.institution}
                        onChangeText={(v) => updateField("institution", v)}
                        placeholder="School or university"
                        placeholderTextColor={theme.onSurfaceMuted}
                    />
                </View>

                {/* Exam Level */}
                {user?.role !== "teacher" && (
                    <View style={styles.field}>
                        <Text style={styles.label}>Exam Level</Text>
                        <Pressable
                            style={styles.select}
                            onPress={() => setShowLevelPicker(!showLevelPicker)}
                        >
                            <Text style={[styles.selectText, !form.exam_level && { color: theme.onSurfaceMuted }]}>
                                {form.exam_level || "Select your level"}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color={theme.onSurfaceMuted} />
                        </Pressable>
                        {showLevelPicker && (
                            <View style={styles.options}>
                                {LEVELS.map((l) => (
                                    <Pressable
                                        key={l}
                                        style={[styles.optionItem, form.exam_level === l && styles.optionSelected]}
                                        onPress={() => {
                                            updateField("exam_level", l);
                                            setShowLevelPicker(false);
                                        }}
                                    >
                                        <Text style={[styles.optionText, form.exam_level === l && styles.optionTextSelected]}>
                                            {l}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* Daily Commitment */}
                <View style={styles.field}>
                    <Text style={styles.label}>Daily Study Goal</Text>
                    <Pressable
                        style={styles.select}
                        onPress={() => setShowCommitmentPicker(!showCommitmentPicker)}
                    >
                        <Text style={styles.selectText}>
                            {DAILY_COMMITMENTS.find((c) => c.value === form.daily_commitment)?.label || "Select goal"}
                        </Text>
                        <Ionicons name="chevron-down" size={20} color={theme.onSurfaceMuted} />
                    </Pressable>
                    {showCommitmentPicker && (
                        <View style={styles.options}>
                            {DAILY_COMMITMENTS.map((c) => (
                                <Pressable
                                    key={c.value}
                                    style={[styles.optionItem, form.daily_commitment === c.value && styles.optionSelected]}
                                    onPress={() => {
                                        updateField("daily_commitment", c.value);
                                        setShowCommitmentPicker(false);
                                    }}
                                >
                                    <Text style={[styles.optionText, form.daily_commitment === c.value && styles.optionTextSelected]}>
                                        {c.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                    <Text style={styles.helperText}>This determines your daily streak target.</Text>
                </View>

                {/* Bio */}
                <View style={styles.field}>
                    <Text style={styles.label}>Bio</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={form.bio}
                        onChangeText={(v) => updateField("bio", v)}
                        placeholder="Tell us about yourself"
                        placeholderTextColor={theme.onSurfaceMuted}
                        multiline
                        numberOfLines={4}
                    />
                </View>

                {/* Save Button */}
                <Pressable
                    style={[styles.saveBtn, (saving || uploading) && styles.saveBtnDisabled]}
                    onPress={save}
                    disabled={saving || uploading}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={styles.saveBtnText}>Save Changes</Text>
                    )}
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

const createStyles = (t: Palette) => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.surface },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: t.surfaceSecondary,
        borderBottomWidth: 1,
        borderBottomColor: t.divider,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: "700", color: t.brand },
    avatarSection: { alignItems: "center", marginVertical: spacing.lg },
    avatarWrapper: { position: "relative" },
    avatarImage: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: t.brand,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarPlaceholderText: { color: t.onBrandPrimary, fontSize: 36, fontWeight: "800" },
    cameraBtn: {
        position: "absolute",
        bottom: 0,
        right: 0,
        backgroundColor: t.brandPrimary,
        borderRadius: 20,
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: t.surfaceSecondary,
    },
    avatarHint: { fontSize: 12, color: t.onSurfaceMuted, marginTop: 6 },
    field: { marginBottom: spacing.md },
    label: { fontWeight: "600", color: t.onSurface, marginBottom: 4, fontSize: 14 },
    input: {
        backgroundColor: t.surfaceSecondary,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radii.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: t.onSurface,
    },
    textArea: { minHeight: 80, textAlignVertical: "top" },
    select: {
        backgroundColor: t.surfaceSecondary,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radii.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    selectText: { fontSize: 15, color: t.onSurface },
    options: {
        marginTop: 4,
        backgroundColor: t.surfaceSecondary,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: t.border,
        overflow: "hidden",
    },
    optionItem: { paddingVertical: 10, paddingHorizontal: 12 },
    optionSelected: { backgroundColor: t.brandTertiary },
    optionText: { fontSize: 14, color: t.onSurface },
    optionTextSelected: { color: t.brandPrimary, fontWeight: "600" },
    helperText: { fontSize: 12, color: t.onSurfaceMuted, marginTop: 4 },
    saveBtn: {
        backgroundColor: t.brandPrimary,
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
        marginTop: spacing.md,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: t.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});