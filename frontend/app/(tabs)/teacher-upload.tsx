import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import TeacherUploadScreen from "../teacher-upload";

export default function TeacherUploadTab() {
  const { user } = useAuth();
  const router = useRouter();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  if (!isTeacher) {
    return (
      <View style={guardStyles.root}>
        <Text style={guardStyles.title}>Teachers only</Text>
        <Text style={guardStyles.sub}>
          The lesson upload area is only available to teacher accounts.
        </Text>
        <Pressable style={guardStyles.btn} onPress={() => router.replace("/(tabs)/lessons")}>
          <Text style={guardStyles.btnTxt}>Back to Lessons</Text>
        </Pressable>
      </View>
    );
  }
  return <TeacherUploadScreen />;
}

const guardStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  title: { fontSize: 18, fontWeight: "800" },
  sub: { textAlign: "center", opacity: 0.7 },
  btn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "#1D4ED8" },
  btnTxt: { color: "#fff", fontWeight: "800" },
});
