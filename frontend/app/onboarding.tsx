

// import { useState } from "react";
// import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii } from "@/src/theme";
// import { api, setToken, readToken } from "@/src/api";
// import { useAuth } from "@/src/auth";

// const STEPS = [
//   {
//     key: "exam_level",
//     title: "What is your primary goal?",
//     options: ["GCE O Level", "GCE A Level", "HND", "Concours"],
//     multi: false,
//   },
//   {
//     key: "subjects",
//     title: "Which subjects do you need help with?",
//     options: ["Mathematics", "Physics", "Chemistry", "Biology", "English", "French", "Economics", "Literature"],
//     multi: true,
//   },
//   {
//     key: "daily_time",
//     title: "How much time can you study daily?",
//     options: ["15 mins", "30 mins", "1 hour", "2+ hours"],
//     multi: false,
//   },
//   {
//     key: "level",
//     title: "What's your current level?",
//     options: ["Beginner", "Intermediate", "Advanced"],
//     multi: false,
//   },
//   {
//     key: "learning_style",
//     title: "How do you learn best?",
//     options: ["Visual", "Auditory", "Reading", "Kinesthetic"],
//     multi: false,
//   },
// ];

// export default function Onboarding() {
//   const router = useRouter();
//   const { refresh, user } = useAuth();
//   const [idx, setIdx] = useState(0);
//   const [answers, setAnswers] = useState<Record<string, any>>({ subjects: [] });
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const step = STEPS[idx];
//   const total = STEPS.length;
//   const value = answers[step.key];
//   const isFilled = step.multi ? (value?.length ?? 0) > 0 : !!value;

//   const toggle = (opt: string) => {
//     setError(null);
//     if (step.multi) {
//       const arr: string[] = answers[step.key] ?? [];
//       const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
//       setAnswers({ ...answers, [step.key]: next });
//     } else {
//       setAnswers({ ...answers, [step.key]: opt });
//     }
//   };

//   const goToWelcome = async () => {
//     await setToken(null);
//     router.replace("/welcome");
//   };

//   const next = async () => {
//     setError(null);

//     if (idx < total - 1) {
//       return setIdx(idx + 1);
//     }

//     const requiredFields = ["exam_level", "subjects", "daily_time", "level", "learning_style"];
//     const missing = requiredFields.filter(field => {
//       const val = answers[field];
//       if (field === "subjects") {
//         return !val || val.length === 0;
//       }
//       return !val;
//     });

//     if (missing.length > 0) {
//       setError("Please complete all questions before finishing.");
//       Alert.alert("Incomplete", "Please complete all questions before finishing.");
//       return;
//     }

//     setBusy(true);

//     try {
//       const token = await readToken();
//       console.log("Token exists:", !!token);

//       if (!token) {
//         setError("Authentication error. Please log in again.");
//         Alert.alert(
//           "Authentication Error",
//           "Your session has expired. Please log in again.",
//           [
//             { text: "Go to Login", onPress: goToWelcome }
//           ]
//         );
//         setBusy(false);
//         return;
//       }

//       console.log("Submitting onboarding data:", {
//         goal: answers.exam_level,
//         exam_level: answers.exam_level,
//         subjects: answers.subjects ?? [],
//         daily_time: answers.daily_time,
//         level: answers.level,
//         learning_style: answers.learning_style,
//       });

//       await api("/users/onboarding", {
//         method: "POST",
//         body: {
//           goal: answers.exam_level,
//           exam_level: answers.exam_level,
//           subjects: answers.subjects ?? [],
//           daily_time: answers.daily_time,
//           level: answers.level,
//           learning_style: answers.learning_style,
//         },
//         auth: true,
//       });

//       console.log("Onboarding submitted successfully");
//       await refresh();
//       router.replace("/(tabs)");

//     } catch (e: any) {
//       console.error("Onboarding error:", e);
//       let errorMessage = "Failed to save your preferences. Please try again.";

//       if (e.message === "Missing token" || e.message.includes("401") || e.message.includes("403")) {
//         errorMessage = "Your session has expired. Please log in again.";
//         Alert.alert(
//           "Session Expired",
//           errorMessage,
//           [
//             { text: "Go to Login", onPress: goToWelcome }
//           ]
//         );
//       } else if (e.message) {
//         errorMessage = e.message;
//         Alert.alert("Error", errorMessage);
//       }

//       setError(errorMessage);
//       setBusy(false);
//     }
//   };

//   const goBack = () => {
//     if (idx > 0) {
//       setIdx(idx - 1);
//       setError(null);
//     } else {
//       // If on first step, ask if they want to go to login
//       Alert.alert(
//         "Leave Onboarding?",
//         "Your progress will be lost. Are you sure you want to go back?",
//         [
//           { text: "Cancel", style: "cancel" },
//           { text: "Go to Login", onPress: goToWelcome }
//         ]
//       );
//     }
//   };

//   return (
//     <SafeAreaView style={styles.root} testID="onboarding-screen">
//       <View style={styles.header}>
//         <Pressable onPress={goBack} testID="back-btn">
//           <Ionicons name="arrow-back" size={22} color={theme.brand} />
//         </Pressable>
//         <Text style={styles.progress}>{idx + 1} / {total}</Text>
//       </View>
//       <View style={styles.progressBar}>
//         <View style={[styles.progressFill, { width: `${((idx + 1) / total) * 100}%` }]} />
//       </View>

//       <ScrollView contentContainerStyle={styles.body}>
//         <Text style={styles.title}>{step.title}</Text>
//         <Text style={styles.sub}>{step.multi ? "Select all that apply" : "Choose one"}</Text>

//         {error && (
//           <View style={styles.errorContainer}>
//             <Text style={styles.errorText}>{error}</Text>
//           </View>
//         )}

//         <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
//           {step.options.map((opt) => {
//             const selected = step.multi
//               ? (answers[step.key] ?? []).includes(opt)
//               : answers[step.key] === opt;
//             return (
//               <Pressable
//                 key={opt}
//                 testID={`opt-${opt}`}
//                 onPress={() => toggle(opt)}
//                 style={[styles.opt, selected && styles.optSelected]}
//               >
//                 <Text style={[styles.optText, selected && styles.optTextSelected]}>{opt}</Text>
//                 {selected && <Ionicons name="checkmark-circle" size={22} color={theme.brandPrimary} />}
//               </Pressable>
//             );
//           })}
//         </View>
//       </ScrollView>

//       <SafeAreaView edges={["bottom"]} style={styles.footer}>
//         <Pressable
//           testID="next-btn"
//           disabled={!isFilled || busy}
//           onPress={next}
//           style={[styles.cta, (!isFilled || busy) && { opacity: 0.5 }]}
//         >
//           {busy ? (
//             <ActivityIndicator color="#fff" />
//           ) : (
//             <Text style={styles.ctaText}>{idx === total - 1 ? "Finish" : "Continue"}</Text>
//           )}
//         </Pressable>
//       </SafeAreaView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row", justifyContent: "space-between", alignItems: "center",
//     paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
//   },
//   progress: { color: theme.onSurfaceMuted, fontWeight: "600" },
//   progressBar: { height: 4, backgroundColor: theme.surfaceTertiary, marginHorizontal: spacing.lg, borderRadius: 4 },
//   progressFill: { height: 4, backgroundColor: theme.brandPrimary, borderRadius: 4 },
//   body: { padding: spacing.lg, paddingBottom: spacing.xxl },
//   title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
//   sub: { color: theme.onSurfaceMuted, marginTop: spacing.xs },
//   opt: {
//     backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border, borderRadius: radii.md,
//     padding: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
//   },
//   optSelected: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//   optText: { fontSize: 15, color: theme.onSurface, fontWeight: "500" },
//   optTextSelected: { color: theme.brand, fontWeight: "700" },
//   footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: theme.divider, backgroundColor: "#fff" },
//   cta: { backgroundColor: theme.brand, paddingVertical: 16, borderRadius: radii.md, alignItems: "center" },
//   ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
//   errorContainer: {
//     backgroundColor: "#FEE2E2",
//     padding: spacing.md,
//     borderRadius: radii.md,
//     marginTop: spacing.md,
//   },
//   errorText: {
//     color: "#991B1B",
//     fontSize: 14,
//   },
// });























import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii } from "@/src/theme";
import { api, readToken } from "@/src/api";
import { useAuth } from "@/src/auth";

// ---------- Constants ----------
const LEVELS = ["GCE O Level", "GCE A Level", "HND", "Concours"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English Language", "French", "Economics", "Computer Science", "Accounting", "Literature"];
const COMMIT = ["15 mins", "30 mins", "1 hour", "2+ hours"];
const PROF = ["Beginner", "Intermediate", "Advanced"];
const STYLE = ["Visual", "Auditory", "Reading", "Kinesthetic"];
const GOALS = ["Exam preparation", "Skill improvement", "Revision", "Career advancement"];

type FormData = {
  role: "student" | "teacher";
  exam_level: string;
  specialization: string;
  institution: string;
  bio: string;
  subjects: string[];
  goals: string[];
  daily_commitment: string;
  proficiency: string;
  learning_style: string;
};

export default function Onboarding() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>({
    role: "student",
    exam_level: "",
    specialization: "",
    institution: "",
    bio: "",
    subjects: [],
    goals: [],
    daily_commitment: "",
    proficiency: "",
    learning_style: "",
  });

  const steps = form.role === "teacher"
    ? ["Role", "Profile", "Expertise"]
    : ["Role", "Profile", "Goals"];

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleArr = (key: "subjects" | "goals", value: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value)
        ? f[key].filter((x) => x !== value)
        : [...f[key], value],
    }));

  const canNext = () => {
    if (step === 0) return !!form.role;
    if (step === 1) {
      if (form.role === "teacher") return !!form.specialization && !!form.institution;
      return !!form.exam_level && !!form.institution;
    }
    if (step === 2) {
      if (form.role === "teacher") return form.subjects.length > 0;
      return form.subjects.length > 0 && form.goals.length > 0 && !!form.daily_commitment && !!form.proficiency && !!form.learning_style;
    }
    return true;
  };

  const goToWelcome = async () => {
    router.replace("/welcome");
  };

  const finish = async () => {
    setSaving(true);
    try {
      const token = await readToken();
      if (!token) {
        Alert.alert("Session Error", "Please log in again.", [
          { text: "OK", onPress: goToWelcome },
        ]);
        setSaving(false);
        return;
      }

      const payload: any = {
        ...form,
        onboarded: true,
      };
      await api("/auth/profile", {
        method: "PUT",
        body: payload,
        auth: true,
      });

      await refresh();
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error("Onboarding error:", e);
      let msg = "Failed to save your preferences. Please try again.";
      if (e.message?.includes("401") || e.message?.includes("403")) {
        msg = "Your session has expired. Please log in again.";
        Alert.alert("Session Expired", msg, [
          { text: "Go to Login", onPress: goToWelcome },
        ]);
      } else if (e.message) {
        Alert.alert("Error", e.message);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      finish();
    }
  };

  const back = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      Alert.alert("Leave Onboarding?", "Your progress will be lost.", [
        { text: "Cancel", style: "cancel" },
        { text: "Go to Login", onPress: goToWelcome },
      ]);
    }
  };

  // ---------- Reusable pieces ----------
  const SectionLabel = ({ children }: { children: string }) => (
    <Text style={styles.label}>{children}</Text>
  );

  const OptionChip = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress} style={[styles.optionChip, selected && styles.optionChipSelected]}>
      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{label}</Text>
    </Pressable>
  );

  const renderRoleStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Choose your role</Text>
      <Text style={styles.sub}>You can change this later in settings.</Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Pressable
          onPress={() => set("role", "student")}
          style={[styles.roleCard, form.role === "student" && styles.roleCardSelected]}
        >
          <View style={[styles.roleIcon, form.role === "student" && styles.roleIconSelected]}>
            <Ionicons name="school" size={20} color={form.role === "student" ? "#fff" : theme.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>Student</Text>
            <Text style={styles.roleDesc}>Practice past questions, learn with AI, track progress.</Text>
          </View>
          {form.role === "student" && <Ionicons name="checkmark-circle" size={20} color={theme.brandPrimary} />}
        </Pressable>
        <Pressable
          onPress={() => set("role", "teacher")}
          style={[styles.roleCard, form.role === "teacher" && styles.roleCardSelected]}
        >
          <View style={[styles.roleIcon, form.role === "teacher" && styles.roleIconSelected]}>
            <Ionicons name="people" size={20} color={form.role === "teacher" ? "#fff" : theme.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>Teacher</Text>
            <Text style={styles.roleDesc}>Post lessons, share papers, earn per student view.</Text>
          </View>
          {form.role === "teacher" && <Ionicons name="checkmark-circle" size={20} color={theme.brandPrimary} />}
        </Pressable>
      </View>
    </View>
  );

  const renderProfileStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Your profile</Text>
      {form.role !== "teacher" ? (
        <View style={styles.field}>
          <SectionLabel>Exam level</SectionLabel>
          <View style={styles.optionsGrid}>
            {LEVELS.map((l) => (
              <OptionChip key={l} label={l} selected={form.exam_level === l} onPress={() => set("exam_level", l)} />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <SectionLabel>Subject specialization</SectionLabel>
          <View style={styles.optionsGrid}>
            {SUBJECTS.map((s) => (
              <OptionChip key={s} label={s} selected={form.specialization === s} onPress={() => set("specialization", s)} />
            ))}
          </View>
        </View>
      )}
      <View style={styles.field}>
        <SectionLabel>Institution / School</SectionLabel>
        <TextInput
          style={styles.input}
          value={form.institution}
          onChangeText={(v) => set("institution", v)}
          placeholder="e.g. Government Bilingual High School"
          placeholderTextColor={theme.muted}
        />
      </View>
      <View style={styles.field}>
        <SectionLabel>Short bio</SectionLabel>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.bio}
          onChangeText={(v) => set("bio", v)}
          placeholder="Tell us a bit about yourself"
          placeholderTextColor={theme.muted}
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  const renderGoalsStep = () => {
    if (form.role === "teacher") {
      return (
        <View style={styles.stepContainer}>
          <Text style={styles.title}>Teaching expertise</Text>
          <View style={styles.field}>
            <SectionLabel>Subjects you teach</SectionLabel>
            <View style={styles.optionsGrid}>
              {SUBJECTS.map((s) => (
                <OptionChip key={s} label={s} selected={form.subjects.includes(s)} onPress={() => toggleArr("subjects", s)} />
              ))}
            </View>
          </View>
          <View style={styles.infoBox}>
            <Ionicons name="ribbon-outline" size={16} color={theme.brandPrimary} style={{ marginBottom: 4 }} />
            <Text style={styles.infoText}>
              As a teacher you'll earn <Text style={styles.infoHighlight}>90 FCFA</Text> per qualified student view on your lesson videos.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.title}>Personalize your learning</Text>
        <View style={styles.field}>
          <SectionLabel>Subjects you need help with</SectionLabel>
          <View style={styles.optionsGrid}>
            {SUBJECTS.map((s) => (
              <OptionChip key={s} label={s} selected={form.subjects.includes(s)} onPress={() => toggleArr("subjects", s)} />
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <SectionLabel>Primary goal</SectionLabel>
          <View style={styles.optionsGrid}>
            {GOALS.map((g) => (
              <OptionChip key={g} label={g} selected={form.goals.includes(g)} onPress={() => set("goals", [g])} />
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <SectionLabel>Daily commitment</SectionLabel>
            <View style={styles.optionsGrid}>
              {COMMIT.map((c) => (
                <OptionChip key={c} label={c} selected={form.daily_commitment === c} onPress={() => set("daily_commitment", c)} />
              ))}
            </View>
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <SectionLabel>Proficiency</SectionLabel>
            <View style={styles.optionsGrid}>
              {PROF.map((p) => (
                <OptionChip key={p} label={p} selected={form.proficiency === p} onPress={() => set("proficiency", p)} />
              ))}
            </View>
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <SectionLabel>Learning style</SectionLabel>
            <View style={styles.optionsGrid}>
              {STYLE.map((s) => (
                <OptionChip key={s} label={s} selected={form.learning_style === s} onPress={() => set("learning_style", s)} />
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return renderRoleStep();
      case 1:
        return renderProfileStep();
      case 2:
        return renderGoalsStep();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="onboarding-screen">
      <View style={styles.header}>
        <Pressable onPress={back} testID="back-btn" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>

        {/* Step markers */}
        <View style={styles.stepMarkers}>
          {steps.map((label, i) => (
            <View key={label} style={styles.stepMarkerItem}>
              <View
                style={[
                  styles.stepDot,
                  i < step && styles.stepDotDone,
                  i === step && styles.stepDotActive,
                ]}
              >
                {i < step ? (
                  <Ionicons name="checkmark" size={11} color="#fff" />
                ) : (
                  <Text style={[styles.stepDotText, i === step && styles.stepDotTextActive]}>{i + 1}</Text>
                )}
              </View>
              {i < steps.length - 1 && <View style={[styles.stepConnector, i < step && styles.stepConnectorDone]} />}
            </View>
          ))}
        </View>

        <Text style={styles.progressLabel}>{step + 1}/{steps.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {renderStep()}
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable
          testID="next-btn"
          disabled={!canNext() || saving}
          onPress={next}
          style={[styles.cta, (!canNext() || saving) && styles.ctaDisabled]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{step === steps.length - 1 ? "Finish" : "Continue"}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  progressLabel: { color: theme.onSurfaceMuted, fontWeight: "600", fontSize: 12 },

  // Step markers
  stepMarkers: { flexDirection: "row", alignItems: "center" },
  stepMarkerItem: { flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  stepDotDone: { borderColor: theme.brandPrimary, backgroundColor: theme.brandPrimary },
  stepDotText: { fontSize: 11, fontWeight: "700", color: theme.onSurfaceMuted },
  stepDotTextActive: { color: theme.brand },
  stepConnector: { width: 18, height: 1, backgroundColor: theme.border, marginHorizontal: 4 },
  stepConnectorDone: { backgroundColor: theme.brandPrimary },

  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  stepContainer: { gap: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
  sub: { color: theme.onSurfaceMuted, marginTop: spacing.xs },

  // Role cards
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: "#fff",
  },
  roleCardSelected: {
    borderColor: theme.brandPrimary,
    backgroundColor: theme.brandTertiary,
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconSelected: { backgroundColor: theme.brand },
  roleTitle: { fontWeight: "600", fontSize: 16, color: theme.onSurface },
  roleDesc: { fontSize: 13, color: theme.onSurfaceMuted },

  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: theme.onSurface },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontSize: 15,
    color: theme.onSurface,
    backgroundColor: "#fff",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#fff",
  },
  optionChipSelected: {
    borderColor: theme.brandPrimary,
    backgroundColor: theme.brandPrimary,
  },
  optionChipText: {
    fontSize: 13,
    color: theme.onSurface,
  },
  optionChipTextSelected: {
    color: "#fff",
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  infoBox: {
    backgroundColor: theme.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoText: {
    fontSize: 13,
    color: theme.onSurfaceMuted,
  },
  infoHighlight: {
    fontWeight: "700",
    color: theme.onSurface,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.divider,
    backgroundColor: "#fff",
  },
  cta: {
    backgroundColor: theme.brand,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});