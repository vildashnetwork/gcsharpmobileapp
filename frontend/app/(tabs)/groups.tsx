import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useLanguage } from "@/src/i18n";

type Group = {
  group_id: string;
  name: string;
  description: string;
  exam_level: string;
  member_count: number;
  is_member: boolean;
  is_admin: boolean;
  avatar?: string | null;
  members: { user_id: string; full_name: string; profile_photo?: string | null }[];
  last_message?: { kind: string; text: string; sender_name: string; created_at: string } | null;
  updated_at: string;
};

export default function StudyGroups() {
  useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [mine, setMine] = useState<Group[]>([]);
  const [discover, setDiscover] = useState<Group[]>([]);
  const [myLevel, setMyLevel] = useState("");
  const [pendingOut, setPendingOut] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{
        mine: Group[]; discover: Group[]; my_level: string;
        pending_out: { group_id: string }[];
      }>("/study-groups");
      setMine(r.mine || []);
      setDiscover(r.discover || []);
      setMyLevel(r.my_level || "");
      setPendingOut((r.pending_out || []).map((x) => x.group_id));
    } catch (e) {
      console.error("[Groups] load failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createGroup = async () => {
    const n = name.trim();
    if (!n) { Alert.alert("Name required", "Give your study group a name."); return; }
    setCreating(true);
    try {
      const r = await api<{ group: Group }>("/study-groups", {
        method: "POST", body: { name: n, description: desc.trim() },
      });
      setCreateOpen(false);
      setName(""); setDesc("");
      await load();
      router.push(`/study-groups/${r.group.group_id}` as any);
    } catch (e: any) {
      Alert.alert("Could not create group", e.message || "Try again.");
    } finally {
      setCreating(false);
    }
  };

  const requestJoin = async (g: Group) => {
    setActing(g.group_id);
    try {
      await api(`/study-groups/${g.group_id}/requests`, { method: "POST" });
      setPendingOut((p) => [...p, g.group_id]);
    } catch (e: any) {
      Alert.alert("Request failed", e.message || "Try again.");
    } finally {
      setActing(null);
    }
  };
  const renderCard = (g: Group, inDiscover: boolean) => (
    <Pressable
      key={g.group_id}
      style={styles.card}
      onPress={() => router.push(`/study-groups/${g.group_id}` as any)}
      testID={`group-${g.group_id}`}
    >
      <View style={styles.avatar}>
        {g.avatar ? (
          <Image source={{ uri: g.avatar }} style={styles.avatarImg} />
        ) : (
          <Ionicons name="people" size={22} color={theme.brand} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{g.name}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {g.exam_level} - {g.member_count} members
        </Text>
        {g.last_message ? (
          <Text style={styles.cardLast} numberOfLines={1}>
            {g.last_message.sender_name}: {g.last_message.text}
          </Text>
        ) : !!g.description ? (
          <Text style={styles.cardLast} numberOfLines={1}>{g.description}</Text>
        ) : null}
      </View>
      {inDiscover && !g.is_member && (
        pendingOut.includes(g.group_id) ? (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingTxt}>Requested</Text>
          </View>
        ) : (
          <Pressable
            style={styles.joinBtn}
            disabled={acting === g.group_id}
            onPress={() => requestJoin(g)}
          >
            {acting === g.group_id
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.joinTxt}>Join</Text>}
          </Pressable>
        )
      )}
      <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceMuted} />
    </Pressable>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="groups-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{(t.tabs as any).groups ?? "Groups"}</Text>
        <Pressable style={styles.newBtn} onPress={() => setCreateOpen(true)} testID="new-group-btn">
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newTxt}>New</Text>
        </Pressable>
      </View>
      {!!myLevel && (
        <Text style={styles.levelHint}>Groups for {myLevel}</Text>
      )}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tabBtn, tab === "mine" && styles.tabActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.tabTxt, tab === "mine" && styles.tabTxtActive]}>
            My groups ({mine.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "discover" && styles.tabActive]}
          onPress={() => setTab("discover")}
        >
          <Text style={[styles.tabTxt, tab === "discover" && styles.tabTxtActive]}>
            Discover ({discover.length})
          </Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brandPrimary} />
          <Text style={styles.hint}>Loading study groups...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {(tab === "mine" ? mine : discover).map((g) => renderCard(g, tab === "discover"))}
          {(tab === "mine" ? mine : discover).length === 0 && (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={44} color={theme.onSurfaceMuted} />
              <Text style={styles.hint}>No groups here yet.</Text>
            </View>
          )}
        </ScrollView>
      )}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
          bottomOffset={24}
          extraKeyboardSpace={12}
        >
        <View style={styles.backdrop}>
          <View style={styles.sheet} testID="create-group-sheet">
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>New study group</Text>
            <Text style={styles.sheetHint}>
              For {user?.exam_level || myLevel || "your level"}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Group name"
              placeholderTextColor={theme.onSurfaceMuted}
              style={styles.input}
              maxLength={80}
              testID="group-name-input"
            />
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="What will you study together? (optional)"
              placeholderTextColor={theme.onSurfaceMuted}
              style={[styles.input, { minHeight: 70 }]}
              multiline
              maxLength={500}
              testID="group-desc-input"
            />
            <Pressable style={styles.primaryBtn} onPress={createGroup} disabled={creating} testID="create-group-btn">
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryTxt}>Create group</Text>}
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setCreateOpen(false)}>
              <Text style={styles.ghostTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAwareScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { fontSize: 22, fontWeight: "800", color: t.brand },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: t.brandPrimary, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.pill,
  },
  newTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  levelHint: {
    paddingHorizontal: spacing.lg, fontSize: 12, color: t.onSurfaceMuted,
    marginBottom: spacing.sm,
  },
  tabs: {
    flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  tabBtn: {
    flex: 1, paddingVertical: 9, borderRadius: radii.pill,
    backgroundColor: t.surfaceSecondary, alignItems: "center",
    borderWidth: 1, borderColor: t.border,
  },
  tabActive: { backgroundColor: t.brandPrimary, borderColor: t.brandPrimary },
  tabTxt: { fontWeight: "700", fontSize: 13, color: t.onSurface },
  tabTxtActive: { color: "#fff" },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: t.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.md, borderWidth: 1, borderColor: t.border, ...shadow1,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: t.brandTertiary,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: 46, height: 46 },
  cardTitle: { fontWeight: "800", fontSize: 15, color: t.onSurface },
  cardMeta: { fontSize: 12, color: t.onSurfaceMuted, marginTop: 1 },
  cardLast: { fontSize: 12.5, color: t.onSurfaceMuted, marginTop: 3, fontStyle: "italic" },
  joinBtn: {
    backgroundColor: t.brandPrimary, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radii.pill,
  },
  joinTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  pendingPill: {
    backgroundColor: t.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radii.pill,
  },
  pendingTxt: { color: t.onSurfaceMuted, fontWeight: "600", fontSize: 12 },
  center: { alignItems: "center", gap: 10, paddingVertical: 40 },
  hint: { color: t.onSurfaceMuted, textAlign: "center", fontSize: 13, lineHeight: 19, paddingHorizontal: 30 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: t.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, gap: spacing.md,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: t.borderStrong, opacity: 0.4 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: t.onSurface },
  sheetHint: { fontSize: 12.5, color: t.onSurfaceMuted },
  input: {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: radii.md, padding: spacing.md, color: t.onSurface, fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: t.brandPrimary, paddingVertical: 13, borderRadius: radii.md,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  ghostBtn: { paddingVertical: 10, alignItems: "center" },
  ghostTxt: { color: t.onSurfaceMuted, fontWeight: "600" },
});

let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => { styles = createStyles(getPaletteSnapshot()); });

