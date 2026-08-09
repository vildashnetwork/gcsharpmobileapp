// import { useState } from "react";
// import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";
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
//   const { refresh } = useAuth();
//   const [idx, setIdx] = useState(0);
//   const [answers, setAnswers] = useState<Record<string, any>>({ subjects: [] });
//   const [busy, setBusy] = useState(false);

//   const step = STEPS[idx];
//   const total = STEPS.length;
//   const value = answers[step.key];
//   const isFilled = step.multi ? (value?.length ?? 0) > 0 : !!value;

//   const toggle = (opt: string) => {
//     if (step.multi) {
//       const arr: string[] = answers[step.key] ?? [];
//       const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
//       setAnswers({ ...answers, [step.key]: next });
//     } else {
//       setAnswers({ ...answers, [step.key]: opt });
//     }
//   };

//   const next = async () => {
//     if (idx < total - 1) return setIdx(idx + 1);
//     setBusy(true);
//     try {
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
//       });
//       await refresh();
//       router.replace("/(tabs)");
//     } catch (e) {
//       setBusy(false);
//     }
//   };

//   return (
//     <SafeAreaView style={styles.root} testID="onboarding-screen">
//       <View style={styles.header}>
//         <Pressable onPress={() => (idx > 0 ? setIdx(idx - 1) : router.back())} testID="back-btn">
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
//   body: { padding: spacing.lg },
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
// });

























import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii } from "@/src/theme";
import { api, setToken, readToken } from "@/src/api";
import { useAuth } from "@/src/auth";

const STEPS = [
  {
    key: "exam_level",
    title: "What is your primary goal?",
    options: ["GCE O Level", "GCE A Level", "HND", "Concours"],
    multi: false,
  },
  {
    key: "subjects",
    title: "Which subjects do you need help with?",
    options: ["Mathematics", "Physics", "Chemistry", "Biology", "English", "French", "Economics", "Literature"],
    multi: true,
  },
  {
    key: "daily_time",
    title: "How much time can you study daily?",
    options: ["15 mins", "30 mins", "1 hour", "2+ hours"],
    multi: false,
  },
  {
    key: "level",
    title: "What's your current level?",
    options: ["Beginner", "Intermediate", "Advanced"],
    multi: false,
  },
  {
    key: "learning_style",
    title: "How do you learn best?",
    options: ["Visual", "Auditory", "Reading", "Kinesthetic"],
    multi: false,
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { refresh, user } = useAuth();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({ subjects: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[idx];
  const total = STEPS.length;
  const value = answers[step.key];
  const isFilled = step.multi ? (value?.length ?? 0) > 0 : !!value;

  const toggle = (opt: string) => {
    setError(null);
    if (step.multi) {
      const arr: string[] = answers[step.key] ?? [];
      const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
      setAnswers({ ...answers, [step.key]: next });
    } else {
      setAnswers({ ...answers, [step.key]: opt });
    }
  };

  const goToWelcome = async () => {
    await setToken(null);
    router.replace("/welcome");
  };

  const next = async () => {
    setError(null);

    if (idx < total - 1) {
      return setIdx(idx + 1);
    }

    const requiredFields = ["exam_level", "subjects", "daily_time", "level", "learning_style"];
    const missing = requiredFields.filter(field => {
      const val = answers[field];
      if (field === "subjects") {
        return !val || val.length === 0;
      }
      return !val;
    });

    if (missing.length > 0) {
      setError("Please complete all questions before finishing.");
      Alert.alert("Incomplete", "Please complete all questions before finishing.");
      return;
    }

    setBusy(true);

    try {
      const token = await readToken();
      console.log("Token exists:", !!token);

      if (!token) {
        setError("Authentication error. Please log in again.");
        Alert.alert(
          "Authentication Error",
          "Your session has expired. Please log in again.",
          [
            { text: "Go to Login", onPress: goToWelcome }
          ]
        );
        setBusy(false);
        return;
      }

      console.log("Submitting onboarding data:", {
        goal: answers.exam_level,
        exam_level: answers.exam_level,
        subjects: answers.subjects ?? [],
        daily_time: answers.daily_time,
        level: answers.level,
        learning_style: answers.learning_style,
      });

      await api("/users/onboarding", {
        method: "POST",
        body: {
          goal: answers.exam_level,
          exam_level: answers.exam_level,
          subjects: answers.subjects ?? [],
          daily_time: answers.daily_time,
          level: answers.level,
          learning_style: answers.learning_style,
        },
        auth: true,
      });

      console.log("Onboarding submitted successfully");
      await refresh();
      router.replace("/(tabs)");

    } catch (e: any) {
      console.error("Onboarding error:", e);
      let errorMessage = "Failed to save your preferences. Please try again.";

      if (e.message === "Missing token" || e.message.includes("401") || e.message.includes("403")) {
        errorMessage = "Your session has expired. Please log in again.";
        Alert.alert(
          "Session Expired",
          errorMessage,
          [
            { text: "Go to Login", onPress: goToWelcome }
          ]
        );
      } else if (e.message) {
        errorMessage = e.message;
        Alert.alert("Error", errorMessage);
      }

      setError(errorMessage);
      setBusy(false);
    }
  };

  const goBack = () => {
    if (idx > 0) {
      setIdx(idx - 1);
      setError(null);
    } else {
      // If on first step, ask if they want to go to login
      Alert.alert(
        "Leave Onboarding?",
        "Your progress will be lost. Are you sure you want to go back?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to Login", onPress: goToWelcome }
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="onboarding-screen">
      <View style={styles.header}>
        <Pressable onPress={goBack} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.progress}>{idx + 1} / {total}</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((idx + 1) / total) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.sub}>{step.multi ? "Select all that apply" : "Choose one"}</Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {step.options.map((opt) => {
            const selected = step.multi
              ? (answers[step.key] ?? []).includes(opt)
              : answers[step.key] === opt;
            return (
              <Pressable
                key={opt}
                testID={`opt-${opt}`}
                onPress={() => toggle(opt)}
                style={[styles.opt, selected && styles.optSelected]}
              >
                <Text style={[styles.optText, selected && styles.optTextSelected]}>{opt}</Text>
                {selected && <Ionicons name="checkmark-circle" size={22} color={theme.brandPrimary} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable
          testID="next-btn"
          disabled={!isFilled || busy}
          onPress={next}
          style={[styles.cta, (!isFilled || busy) && { opacity: 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{idx === total - 1 ? "Finish" : "Continue"}</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  progress: { color: theme.onSurfaceMuted, fontWeight: "600" },
  progressBar: { height: 4, backgroundColor: theme.surfaceTertiary, marginHorizontal: spacing.lg, borderRadius: 4 },
  progressFill: { height: 4, backgroundColor: theme.brandPrimary, borderRadius: 4 },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
  sub: { color: theme.onSurfaceMuted, marginTop: spacing.xs },
  opt: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border, borderRadius: radii.md,
    padding: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  optSelected: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  optText: { fontSize: 15, color: theme.onSurface, fontWeight: "500" },
  optTextSelected: { color: theme.brand, fontWeight: "700" },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: theme.divider, backgroundColor: "#fff" },
  cta: { backgroundColor: theme.brand, paddingVertical: 16, borderRadius: radii.md, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
  },
});