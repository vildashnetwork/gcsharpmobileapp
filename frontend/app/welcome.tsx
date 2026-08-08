import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useAuth } from "@/src/auth";

type Role = "student" | "teacher";
type Mode = "login" | "signup";

export default function Welcome() {
  const { login, register, loginWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role>("student");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || "New User", role);
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="welcome-screen">
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}>
          <View style={styles.logoCard}>
            <Ionicons name="school" size={44} color={theme.brand} />
          </View>
          <Text style={styles.brandText}>GCSMART</Text>
          <Text style={styles.brandSub}>Redefining Education in Cameroon</Text>
        </View>

        <View style={styles.formWrap}>
          <View style={styles.segment} testID="role-segment">
            {(["student", "teacher"] as Role[]).map((r) => {
              const active = role === r;
              return (
                <Pressable
                  key={r}
                  testID={`role-${r}`}
                  onPress={() => setRole(r)}
                  style={[styles.segItem, active && styles.segItemActive]}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>
                    {r === "student" ? "Student" : "Teacher"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.h1}>{mode === "login" ? "Welcome back" : "Create account"}</Text>
          <Text style={styles.sub}>
            {mode === "login" ? "Access your academic dashboard" : "Start your GCE journey today"}
          </Text>

          {mode === "signup" && (
            <TextInput
              testID="input-name"
              value={name}
              onChangeText={setName}
              placeholder="Full Name"
              placeholderTextColor={theme.onSurfaceMuted}
              style={styles.input}
              autoCapitalize="words"
            />
          )}

          <TextInput
            testID="input-email"
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            placeholderTextColor={theme.onSurfaceMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View style={styles.pwWrap}>
            <TextInput
              testID="input-password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={theme.onSurfaceMuted}
              style={[styles.input, { paddingRight: 44 }]}
              secureTextEntry={!showPw}
            />
            <Pressable style={styles.eye} onPress={() => setShowPw((v) => !v)} testID="toggle-password">
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={theme.onSurfaceMuted} />
            </Pressable>
          </View>

          {err ? <Text testID="auth-error" style={styles.err}>{err}</Text> : null}

          <Pressable
            testID="submit-auth"
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>{mode === "login" ? "Get Started" : "Create Account"}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </Pressable>

          <Pressable testID="google-signin" onPress={loginWithGoogle} style={styles.googleBtn}>
            <Ionicons name="logo-google" size={18} color={theme.brand} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>

          <Pressable
            testID="toggle-mode"
            onPress={() => setMode((m) => (m === "login" ? "signup" : "login"))}
            style={styles.switchRow}
          >
            <Text style={styles.switchText}>
              {mode === "login" ? "New here? " : "Have an account? "}
              <Text style={{ color: theme.brandPrimary, fontWeight: "700" }}>
                {mode === "login" ? "Sign up" : "Sign in"}
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  hero: {
    backgroundColor: theme.brandPrimary, paddingBottom: spacing.xxl,
    alignItems: "center", gap: spacing.md,
  },
  logoCard: {
    width: 82, height: 82, borderRadius: 20, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", ...shadow1,
  },
  brandText: { color: "#fff", fontSize: 32, fontWeight: "800", letterSpacing: 1 },
  brandSub: { color: "#DBEAFE", fontSize: 14 },
  formWrap: { padding: spacing.lg, gap: spacing.md },
  segment: {
    flexDirection: "row", borderRadius: radii.md, padding: 4,
    marginTop: -spacing.lg, marginBottom: spacing.sm, backgroundColor: "#EEF2F6", ...shadow1,
  },
  segItem: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radii.md },
  segItemActive: { backgroundColor: "#fff", ...shadow1 },
  segText: { fontWeight: "600", color: theme.onSurfaceMuted, fontSize: 15 },
  segTextActive: { color: theme.brandPrimary },
  h1: { fontSize: 26, fontWeight: "800", color: theme.onSurface, marginTop: spacing.md },
  sub: { color: theme.onSurfaceMuted, marginBottom: spacing.sm },
  input: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: "#fff",
    paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radii.md,
    fontSize: 15, color: theme.onSurface,
  },
  pwWrap: { position: "relative" },
  eye: { position: "absolute", right: 12, top: 12, padding: 4 },
  err: { color: theme.error, fontSize: 13 },
  primaryBtn: {
    backgroundColor: theme.brand, paddingVertical: 16, borderRadius: radii.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  googleBtn: {
    borderWidth: 1, borderColor: theme.border, paddingVertical: 14, borderRadius: radii.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#fff",
  },
  googleText: { fontWeight: "600", color: theme.onSurface, fontSize: 15 },
  switchRow: { alignItems: "center", paddingVertical: spacing.md },
  switchText: { color: theme.onSurfaceMuted },
});
