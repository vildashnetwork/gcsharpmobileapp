
// import { useEffect, useState, useCallback, useRef } from "react";

// import {
//   View,
//   Text,
//   StyleSheet,
//   ScrollView,
//   Pressable,
//   RefreshControl,
//   Dimensions,
//   FlatList,
//   Image,
//   Modal,
//   TouchableOpacity,
//   Animated,
//   Easing,
// } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { useAuth } from "@/src/auth";
// import { api } from "@/src/api";
// import Svg, { Circle } from "react-native-svg";
// import { Path } from "react-native-svg";
// const { width: SCREEN_WIDTH } = Dimensions.get("window");

// type DashboardStats = {
//   study_hours: number;
//   study_seconds: number;
//   questions_attempted: number;
//   accuracy: number;
//   streak: number;
//   xp: number;
//   level: number;
//   xp_to_next: number;
//   weak_topics: string[];
//   strong_topics: string[];
//   consistency: { day: string; minutes: number }[];
//   total_attempts: number;
// };

// type LeaderboardEntry = {
//   rank: number;
//   name: string;
//   xp: number;
//   level: number;
//   is_me?: boolean;
// };

// type Course = {
//   course_id: string;
//   title: string;
//   subject: string;
//   level: string;
//   teacher_name: string;
//   thumbnail?: string;
//   video_url: string;
// };

// type Notification = {
//   _id: string;
//   message: string;
//   type: string;
//   link?: string;
//   read: boolean;
//   created_at: string;
// };



// function GraduationCap({ size = 32, color = theme.brandPrimary }) {
//   return (
//     <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
//       <Path
//         d="M256 64L16 176l240 112 240-112L256 64zM16 176v176"
//         stroke={color}
//         strokeWidth="32"
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         fill="none"
//       />
//       <Path
//         d="M464 288v128"
//         stroke={color}
//         strokeWidth="32"
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         fill="none"
//       />
//       <Path
//         d="M256 400c-88.366 0-160-35.817-160-80s71.634-80 160-80 160 35.817 160 80-71.634 80-160 80z"
//         stroke={color}
//         strokeWidth="32"
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         fill="none"
//       />
//       <Path
//         d="M256 400v-80"
//         stroke={color}
//         strokeWidth="32"
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         fill="none"
//       />
//     </Svg>
//   );
// }
// // ----- XP Progress Ring -----
// function XPRing({ xp, level, toNext }: { xp: number; level: number; toNext: number }) {
//   const size = 100;
//   const strokeWidth = 8;
//   const radius = (size - strokeWidth) / 2;
//   const circumference = 2 * Math.PI * radius;
//   const progress = Math.min(100, ((500 - toNext) / 500) * 100);
//   const strokeDashoffset = circumference - (progress / 100) * circumference;

//   return (
//     <View style={styles.ringContainer}>
//       <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
//         <Circle
//           cx={size / 2}
//           cy={size / 2}
//           r={radius}
//           stroke={theme.surfaceTertiary}
//           strokeWidth={strokeWidth}
//           fill="none"
//         />
//         <Circle
//           cx={size / 2}
//           cy={size / 2}
//           r={radius}
//           stroke={theme.brandPrimary}
//           strokeWidth={strokeWidth}
//           strokeDasharray={circumference}
//           strokeDashoffset={strokeDashoffset}
//           strokeLinecap="round"
//           fill="none"
//           origin={`${size / 2}, ${size / 2}`}
//           rotation="-90"
//         />
//       </Svg>
//       <View style={styles.ringContent}>
//         <Text style={styles.ringLevelLabel}>Level</Text>
//         <Text style={styles.ringLevel}>{level}</Text>
//         <Text style={styles.ringXp}>{xp} XP</Text>
//       </View>
//     </View>
//   );
// }

// // ----- Consistency Chart -----
// function ConsistencyChart({ data }: { data: { day: string; minutes: number }[] }) {
//   if (!data || data.length === 0) {
//     return <Text style={styles.emptyChart}>No study data yet</Text>;
//   }

//   const max = Math.max(1, ...data.map((d) => d.minutes));
//   const today = new Date().getDay();
//   const todayIndex = today === 0 ? 6 : today - 1;

//   return (
//     <View style={styles.chartWrapper}>
//       {data.map((item, index) => {
//         const height = Math.max(6, (item.minutes / max) * 80);
//         const isToday = index === todayIndex;
//         return (
//           <View key={item.day} style={styles.barColumn}>
//             <Text style={styles.barValue}>{item.minutes}</Text>
//             <View
//               style={[
//                 styles.bar,
//                 {
//                   height,
//                   backgroundColor: isToday ? theme.brandPrimary : theme.brandPrimary,
//                   opacity: isToday ? 1 : 0.4,
//                 },
//               ]}
//             />
//             <Text style={styles.barLabel}>{item.day}</Text>
//           </View>
//         );
//       })}
//     </View>
//   );
// }

// // ----- Action Component -----
// function Action({ icon, label, onPress, testID }: any) {
//   return (
//     <Pressable style={styles.actionItem} onPress={onPress} testID={testID}>
//       <View style={styles.actionIcon}>
//         <Ionicons name={icon} size={22} color={theme.brandPrimary} />
//       </View>
//       <Text style={styles.actionLabel}>{label}</Text>
//     </Pressable>
//   );
// }

// // ----- Percentage Loader -----
// function PercentageLoader({ progress }: { progress: number }) {
//   const opacity = useRef(new Animated.Value(0)).current;

//   useEffect(() => {
//     Animated.timing(opacity, {
//       toValue: 1,
//       duration: 300,
//       easing: Easing.inOut(Easing.ease),
//       useNativeDriver: true,
//     }).start();
//   }, []);

//   return (
//     <Animated.View style={[styles.loaderOverlay, { opacity }]}>
//       <View style={styles.loaderCard}>
//         {/* <Ionicons name="sparkles" size={32} color={theme.brandPrimary} /> */}
//         <GraduationCap size={40} color={theme.brandPrimary} />
//         <Text style={styles.loaderPercent}>{Math.round(progress)}%</Text>
//         <View style={styles.loaderBar}>
//           <View style={[styles.loaderFill, { width: `${Math.min(100, progress)}%` }]} />
//         </View>
//         <Text style={styles.loaderText}>Loading dashboard…</Text>
//       </View>
//     </Animated.View>
//   );
// }

// export default function Home() {
//   const { user } = useAuth();
//   const router = useRouter();
//   const [stats, setStats] = useState<DashboardStats | null>(null);
//   const [leaderboard, setLeaderboard] = useState<{ top: LeaderboardEntry[]; my_rank?: LeaderboardEntry } | null>(null);
//   const [courses, setCourses] = useState<Course[]>([]);
//   const [refreshing, setRefreshing] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [loadingProgress, setLoadingProgress] = useState(0);
//   const [error, setError] = useState<string | null>(null);
//   const [unreadCount, setUnreadCount] = useState(0);
//   const [notifications, setNotifications] = useState<Notification[]>([]);
//   const [modalVisible, setModalVisible] = useState(false);
//   const [loadingNotifications, setLoadingNotifications] = useState(false);

//   // Load notifications
//   const loadNotifications = async () => {
//     try {
//       setLoadingNotifications(true);
//       const res = await api<{ notifications: Notification[] }>("/notifications");
//       const notifs = res.notifications || [];
//       setNotifications(notifs);
//       const unread = notifs.filter((n) => !n.read).length;
//       setUnreadCount(unread);
//     } catch (err) {
//       console.error("Failed to load notifications:", err);
//     } finally {
//       setLoadingNotifications(false);
//     }
//   };

//   const loadData = useCallback(async () => {
//     setError(null);
//     setLoadingProgress(0);

//     // Start with 10% for initializing
//     setLoadingProgress(10);

//     try {
//       // Fetch stats (30% after this)
//       const statsPromise = api<DashboardStats>("/dashboard/stats").then((res) => {
//         setStats(res);
//         setLoadingProgress((p) => Math.min(p + 20, 50));
//         return res;
//       });

//       // Fetch leaderboard (50% after this)
//       const leaderboardPromise = api<{ top: LeaderboardEntry[]; my_rank?: LeaderboardEntry }>("/leaderboard").then((res) => {
//         setLeaderboard(res);
//         setLoadingProgress((p) => Math.min(p + 20, 70));
//         return res;
//       });

//       // Fetch courses (70% after this)
//       const coursesPromise = api<Course[]>("/courses").then((res) => {
//         setCourses(res.slice(0, 4));
//         setLoadingProgress((p) => Math.min(p + 20, 85));
//         return res;
//       });

//       // Fetch notifications (90% after this)
//       const notificationsPromise = api<{ notifications: Notification[] }>("/notifications").then((res) => {
//         const notifs = res.notifications || [];
//         setNotifications(notifs);
//         const unread = notifs.filter((n) => !n.read).length;
//         setUnreadCount(unread);
//         setLoadingProgress((p) => Math.min(p + 10, 95));
//         return res;
//       });

//       // Wait for all to complete
//       await Promise.all([statsPromise, leaderboardPromise, coursesPromise, notificationsPromise]);

//       // Complete
//       setLoadingProgress(100);

//       // Small delay to show 100%
//       await new Promise((resolve) => setTimeout(resolve, 300));

//       setLoading(false);
//     } catch (err: any) {
//       console.log("Dashboard load error:", err);
//       setError("Could not load some data. Pull to refresh.");
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadData();
//   }, [loadData]);

//   const onRefresh = async () => {
//     setRefreshing(true);
//     // Reset loading state for refresh
//     setLoading(true);
//     setLoadingProgress(0);
//     await loadData();
//     setRefreshing(false);
//   };

//   // Mark a single notification as read
//   const markAsRead = async (notificationId: string) => {
//     try {
//       await api.put(`/notifications/${notificationId}/read`);
//       setNotifications((prev) =>
//         prev.map((n) => (n._id === notificationId ? { ...n, read: true } : n))
//       );
//       setUnreadCount((prev) => Math.max(0, prev - 1));
//     } catch (err) {
//       console.error("Failed to mark as read:", err);
//     }
//   };

//   // Mark all as read
//   const markAllAsRead = async () => {
//     try {
//       await api.put("/notifications/read-all");
//       setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
//       setUnreadCount(0);
//     } catch (err) {
//       console.error("Failed to mark all as read:", err);
//     }
//   };

//   // Navigate based on notification link
//   const handleNotificationPress = (notification: Notification) => {
//     if (!notification.read) {
//       markAsRead(notification._id);
//     }
//     if (notification.link) {
//       router.push(notification.link);
//       setModalVisible(false);
//     }
//   };

//   const initials = (user?.full_name || "U")
//     .split(" ")
//     .map((s) => s[0])
//     .slice(0, 2)
//     .join("");

//   const data = stats;

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="home-screen">
//       {loading && <PercentageLoader progress={loadingProgress} />}

//       <ScrollView
//         contentContainerStyle={{ paddingBottom: 24 }}
//         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
//       >
//         {error && (
//           <View style={styles.errorBanner}>
//             <Text style={styles.errorText}>{error}</Text>
//           </View>
//         )}

//         {/* Header */}
//         <View style={styles.header}>
//           <View style={styles.avatarRow}>
//             <View style={styles.avatar}>
//               <Text style={styles.avatarTxt}>{initials}</Text>
//             </View>
//             <View>
//               <Text style={styles.greet}>Hello, {user?.full_name?.split(" ")[0] || "Student"}</Text>
//               <Text style={styles.brandTop}>GCSHARP</Text>
//             </View>
//           </View>
//           <Pressable style={styles.bell} onPress={() => setModalVisible(true)} testID="notifications-btn">
//             <Ionicons name="notifications-outline" size={22} color={theme.brand} />
//             {unreadCount > 0 && (
//               <View style={styles.badge}>
//                 <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
//               </View>
//             )}
//           </Pressable>
//         </View>

//         {/* Stat Cards */}
//         <View style={styles.statsRow}>
//           <View style={[styles.stat, { backgroundColor: theme.brand }]}>
//             <Ionicons name="flame" size={20} color="#FDBA74" />
//             <Text style={styles.statValue}>{data?.streak ?? 0}</Text>
//             <Text style={styles.statLabel}>Day Streak</Text>
//           </View>
//           <View style={styles.stat}>
//             <Ionicons name="trophy-outline" size={20} color={theme.warning} />
//             <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.xp ?? 0}</Text>
//             <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>XP Points</Text>
//           </View>
//           <View style={styles.stat}>
//             <Ionicons name="checkmark-circle-outline" size={20} color={theme.success} />
//             <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.accuracy ?? 0}%</Text>
//             <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>Accuracy</Text>
//           </View>
//         </View>

//         {/* Quick Actions */}
//         <Text style={styles.sectionTitle}>Quick actions</Text>
//         <View style={styles.actions}>
//           <Action
//             icon="document-text-outline"
//             label="Past Questions"
//             onPress={() => router.push("/past-questions")}
//             testID="action-past-questions"
//           />
//           <Action
//             icon="chatbubble-ellipses-outline"
//             label="AI Tutor"
//             onPress={() => router.push("/(tabs)/ai")}
//             testID="action-ai"
//           />
//           <Action
//             icon="stats-chart-outline"
//             label="Stats"
//             onPress={() => router.push("/stats")}
//             testID="action-stats"
//           />
//           <Action
//             icon="book-outline"
//             label="Library"
//             onPress={() => router.push("/(tabs)/library")}
//             testID="action-library"
//           />
//         </View>

//         {/* Start Practice Button */}
//         <Pressable
//           style={styles.startPractice}
//           onPress={() => router.push("/past-questions")}
//           testID="start-practice-btn"
//         >
//           <Text style={styles.startPracticeText}>Start Practice</Text>
//           <Ionicons name="arrow-forward" size={18} color="#fff" />
//         </Pressable>

//         {/* Study Consistency Chart */}
//         <Text style={styles.sectionTitle}>Study Consistency</Text>
//         <View style={styles.card}>
//           <View style={styles.chartHeader}>
//             <Text style={styles.chartSubtitle}>Minutes studied · last 7 days</Text>
//             <View style={styles.trendBadge}>
//               <Ionicons name="trending-up" size={14} color={theme.success} />
//               <Text style={styles.trendText}>Keep it up</Text>
//             </View>
//           </View>
//           {data?.consistency ? (
//             <ConsistencyChart data={data.consistency} />
//           ) : (
//             <Text style={styles.emptyChart}>No data yet</Text>
//           )}
//           <Pressable onPress={() => router.push("/stats")} style={styles.detailsBtn}>
//             <Text style={styles.detailsText}>View full analytics</Text>
//             <Ionicons name="arrow-forward" size={14} color={theme.brandPrimary} />
//           </Pressable>
//         </View>

//         {/* AI Recommendations */}
//         <Text style={styles.sectionTitle}>AI Recommendations</Text>
//         <View style={[styles.card, styles.aiCard]}>
//           <View style={styles.aiHeader}>
//             <Ionicons name="sparkles" size={20} color={theme.brandPrimary} />
//             <Text style={styles.aiTitle}>GC AI Suggestions</Text>
//           </View>
//           {data?.weak_topics && data.weak_topics.length > 0 ? (
//             <>
//               <Text style={styles.aiSub}>Focus on these weak topics:</Text>
//               <View style={styles.topicTags}>
//                 {data.weak_topics.slice(0, 3).map((t) => (
//                   <View key={t} style={styles.weakTag}>
//                     <Text style={styles.weakTagText}>{t}</Text>
//                   </View>
//                 ))}
//               </View>
//             </>
//           ) : (
//             <Text style={styles.aiSub}>Complete a practice test and GC AI will pinpoint your weak topics.</Text>
//           )}
//           <View style={styles.aiButtons}>
//             <Pressable style={styles.aiBtn} onPress={() => router.push("/(tabs)/ai")}>
//               <Ionicons name="chatbubble-ellipses" size={16} color={theme.brandPrimary} />
//               <Text style={styles.aiBtnText}>Ask AI Tutor</Text>
//             </Pressable>
//             <Pressable style={styles.aiBtn} onPress={() => router.push("/past-questions")}>
//               <Ionicons name="compass-outline" size={16} color={theme.brandPrimary} />
//               <Text style={styles.aiBtnText}>Practice weak topics</Text>
//             </Pressable>
//           </View>
//         </View>

//         {/* XP Progress Ring */}
//         <View style={styles.ringRow}>
//           <View style={[styles.card, styles.ringCard]}>
//             <Text style={styles.ringTitle}>Level Progress</Text>
//             {data ? (
//               <XPRing xp={data.xp} level={data.level} toNext={data.xp_to_next} />
//             ) : (
//               <Text style={styles.ringSub}>No data</Text>
//             )}
//             <Text style={styles.ringSub}>{data?.xp_to_next ?? 0} XP to next level</Text>
//           </View>
//         </View>

//         {/* Lesson Videos */}
//         <Text style={styles.sectionTitle}>Lesson Videos for You</Text>
//         {courses.length > 0 ? (
//           <FlatList
//             horizontal
//             showsHorizontalScrollIndicator={false}
//             data={courses}
//             keyExtractor={(item) => item.course_id}
//             contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
//             renderItem={({ item }) => (
//               <Pressable
//                 style={styles.courseCard}
//                 onPress={() => router.push(`/library/${item.course_id}`)}
//               >
//                 <View style={styles.courseThumb}>
//                   {item.thumbnail ? (
//                     <Image source={{ uri: item.thumbnail }} style={styles.courseThumbImage} />
//                   ) : (
//                     <View style={styles.courseThumbPlaceholder}>
//                       <Ionicons name="play-circle" size={32} color="#fff" />
//                     </View>
//                   )}
//                 </View>
//                 <Text style={styles.courseSubject}>{item.subject}</Text>
//                 <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
//                 <Text style={styles.courseTeacher}>{item.teacher_name}</Text>
//               </Pressable>
//             )}
//           />
//         ) : (
//           <Text style={styles.emptyText}>No lessons yet. Check back soon.</Text>
//         )}

//         {/* Leaderboard Preview */}
//         <Text style={styles.sectionTitle}>Leaderboard</Text>
//         <View style={styles.card}>
//           {leaderboard?.my_rank ? (
//             <View style={styles.leaderboardHeader}>
//               <Text style={styles.leaderboardRank}>Your rank: #{leaderboard.my_rank.rank}</Text>
//             </View>
//           ) : (
//             <Text style={styles.leaderboardRank}>Complete a quiz to see your rank</Text>
//           )}
//           {leaderboard?.top && leaderboard.top.length > 0 ? (
//             leaderboard.top.slice(0, 5).map((entry) => (
//               <View key={entry.rank} style={[styles.leaderboardRow, entry.is_me && styles.leaderboardMe]}>
//                 <Text style={[styles.leaderboardRankNum, entry.rank <= 3 && styles.leaderboardTopRank]}>
//                   {entry.rank}
//                 </Text>
//                 <Text style={styles.leaderboardName} numberOfLines={1}>
//                   {entry.name}
//                   {entry.is_me && <Text style={styles.leaderboardYou}> (You)</Text>}
//                 </Text>
//                 <Text style={styles.leaderboardLevel}>Lvl {entry.level}</Text>
//                 <Text style={styles.leaderboardXp}>{entry.xp} XP</Text>
//               </View>
//             ))
//           ) : (
//             <Text style={styles.emptyText}>Be the first on the leaderboard — start practicing!</Text>
//           )}
//         </View>
//       </ScrollView>

//       {/* ---- NOTIFICATIONS MODAL ---- */}
//       <Modal
//         animationType="slide"
//         transparent={true}
//         visible={modalVisible}
//         onRequestClose={() => setModalVisible(false)}
//       >
//         <View style={styles.modalOverlay}>
//           <View style={styles.modalContainer}>
//             <View style={styles.modalHandle} />

//             <View style={styles.modalHeader}>
//               <Text style={styles.modalTitle}>Notifications</Text>
//               <View style={styles.modalHeaderActions}>
//                 {unreadCount > 0 && (
//                   <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
//                     <Text style={styles.markAllText}>Mark all as read</Text>
//                   </TouchableOpacity>
//                 )}
//                 <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
//                   <Ionicons name="close" size={24} color={theme.onSurface} />
//                 </TouchableOpacity>
//               </View>
//             </View>

//             {loadingNotifications ? (
//               <View style={styles.modalLoading}>
//                 <Text style={styles.modalLoadingText}>Loading notifications...</Text>
//               </View>
//             ) : notifications.length === 0 ? (
//               <View style={styles.emptyNotifications}>
//                 <Ionicons name="notifications-off-outline" size={48} color={theme.onSurfaceMuted} />
//                 <Text style={styles.emptyNotificationsText}>No notifications yet</Text>
//                 <Text style={styles.emptyNotificationsSub}>Check back later for updates</Text>
//               </View>
//             ) : (
//               <ScrollView style={styles.notificationList}>
//                 {notifications.map((notification) => (
//                   <Pressable
//                     key={notification._id}
//                     style={[styles.notificationItem, notification.read && styles.notificationRead]}
//                     onPress={() => handleNotificationPress(notification)}
//                   >
//                     <View style={styles.notificationIcon}>
//                       {notification.type === "streak" && (
//                         <Ionicons name="flame" size={20} color={theme.warning} />
//                       )}
//                       {notification.type === "reminder" && (
//                         <Ionicons name="time-outline" size={20} color={theme.brandPrimary} />
//                       )}
//                       {notification.type === "ai_reply" && (
//                         <Ionicons name="chatbubble-ellipses" size={20} color={theme.brandPrimary} />
//                       )}
//                       {(!notification.type || notification.type === "info") && (
//                         <Ionicons name="information-circle" size={20} color={theme.brand} />
//                       )}
//                     </View>
//                     <View style={styles.notificationContent}>
//                       <Text style={[styles.notificationMessage, notification.read && styles.notificationMessageRead]}>
//                         {notification.message}
//                       </Text>
//                       <Text style={styles.notificationTime}>
//                         {new Date(notification.created_at).toLocaleDateString()} ·{" "}
//                         {new Date(notification.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
//                       </Text>
//                     </View>
//                     {!notification.read && <View style={styles.unreadDot} />}
//                   </Pressable>
//                 ))}
//               </ScrollView>
//             )}
//           </View>
//         </View>
//       </Modal>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   errorBanner: {
//     marginHorizontal: spacing.lg,
//     marginTop: spacing.sm,
//     backgroundColor: "#FEE2E2",
//     padding: spacing.sm,
//     borderRadius: radii.sm,
//   },
//   errorText: { color: "#991B1B", fontSize: 14, textAlign: "center" },
//   header: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     paddingHorizontal: spacing.lg,
//     paddingVertical: spacing.md,
//   },
//   avatarRow: { flexDirection: "row", alignItems: "center", gap: 12 },
//   avatar: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: theme.brandTertiary,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   avatarTxt: { color: theme.brand, fontWeight: "800" },
//   greet: { color: theme.onSurfaceMuted, fontSize: 12 },
//   brandTop: { color: theme.brand, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
//   bell: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: "#fff",
//     alignItems: "center",
//     justifyContent: "center",
//     ...shadow1,
//     position: "relative",
//   },
//   badge: {
//     position: "absolute",
//     top: -4,
//     right: -4,
//     backgroundColor: theme.error,
//     borderRadius: 10,
//     minWidth: 18,
//     height: 18,
//     alignItems: "center",
//     justifyContent: "center",
//     paddingHorizontal: 4,
//   },
//   badgeText: {
//     color: "#fff",
//     fontSize: 10,
//     fontWeight: "700",
//   },
//   statsRow: {
//     flexDirection: "row",
//     gap: spacing.sm,
//     paddingHorizontal: spacing.lg,
//     marginTop: spacing.sm,
//   },
//   stat: {
//     flex: 1,
//     backgroundColor: "#fff",
//     borderRadius: radii.md,
//     padding: spacing.md,
//     ...shadow1,
//     gap: 4,
//   },
//   statValue: { fontSize: 20, fontWeight: "800", color: "#fff", marginTop: 4 },
//   statLabel: { fontSize: 11, color: "#DBEAFE" },
//   sectionTitle: {
//     fontSize: 16,
//     fontWeight: "800",
//     color: theme.onSurface,
//     paddingHorizontal: spacing.lg,
//     marginTop: spacing.xl,
//     marginBottom: spacing.sm,
//   },
//   actions: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: spacing.sm,
//     paddingHorizontal: spacing.lg,
//   },
//   actionItem: {
//     width: "48%",
//     backgroundColor: "#fff",
//     padding: spacing.lg,
//     borderRadius: radii.md,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 10,
//     ...shadow1,
//   },
//   actionIcon: {
//     width: 40,
//     height: 40,
//     borderRadius: 10,
//     backgroundColor: theme.brandTertiary,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   actionLabel: { fontWeight: "700", color: theme.onSurface, flex: 1 },
//   startPractice: {
//     marginHorizontal: spacing.lg,
//     marginTop: spacing.md,
//     backgroundColor: theme.brand,
//     paddingVertical: 14,
//     borderRadius: radii.md,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 8,
//     ...shadow1,
//   },
//   startPracticeText: { color: "#fff", fontWeight: "700", fontSize: 16 },
//   card: {
//     marginHorizontal: spacing.lg,
//     marginBottom: 12,
//     backgroundColor: "#fff",
//     borderRadius: radii.md,
//     padding: spacing.md,
//     ...shadow1,
//   },
//   chartHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     marginBottom: spacing.sm,
//   },
//   chartSubtitle: { fontSize: 12, color: theme.onSurfaceMuted },
//   trendBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
//   trendText: { fontSize: 12, color: theme.success, fontWeight: "600" },
//   chartWrapper: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "flex-end",
//     height: 110,
//     marginVertical: spacing.sm,
//     gap: 4,
//   },
//   barColumn: { alignItems: "center", flex: 1 },
//   bar: { width: 16, borderRadius: 4 },
//   barLabel: { fontSize: 10, color: theme.onSurfaceMuted, marginTop: 4 },
//   barValue: { fontSize: 10, color: theme.onSurfaceMuted, marginBottom: 2, fontWeight: "600" },
//   emptyChart: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.md },
//   detailsBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: 6 },
//   detailsText: { color: theme.brandPrimary, fontWeight: "700", fontSize: 13 },
//   aiCard: { gap: spacing.sm },
//   aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
//   aiTitle: { fontWeight: "700", fontSize: 15, color: theme.onSurface },
//   aiSub: { fontSize: 13, color: theme.onSurfaceMuted },
//   topicTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
//   weakTag: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
//   weakTagText: { color: "#991B1B", fontSize: 12, fontWeight: "600" },
//   aiButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
//   aiBtn: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//     borderWidth: 1,
//     borderColor: theme.border,
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: radii.pill,
//     backgroundColor: "#fff",
//   },
//   aiBtnText: { fontSize: 13, color: theme.brandPrimary, fontWeight: "600" },
//   ringRow: { paddingHorizontal: spacing.lg, marginTop: 19 },
//   ringCard: { alignItems: "center", paddingVertical: spacing.lg },
//   ringTitle: { fontWeight: "700", fontSize: 15, color: theme.onSurface, marginBottom: spacing.sm },
//   ringContainer: { position: "relative", alignItems: "center", justifyContent: "center" },
//   ringContent: { position: "absolute", alignItems: "center" },
//   ringLevelLabel: { fontSize: 10, color: theme.onSurfaceMuted },
//   ringLevel: { fontSize: 28, fontWeight: "800", color: theme.brand, marginTop: -2 },
//   ringXp: { fontSize: 11, color: theme.onSurfaceMuted },
//   ringSub: { fontSize: 13, color: theme.onSurfaceMuted, marginTop: 6 },
//   courseCard: {
//     width: 140,
//     backgroundColor: "#fff",
//     borderRadius: radii.md,
//     overflow: "hidden",
//     ...shadow1,
//     marginRight: spacing.sm,
//   },
//   courseThumb: { height: 80, backgroundColor: theme.surfaceTertiary },
//   courseThumbImage: { width: "100%", height: "100%", resizeMode: "cover" },
//   courseThumbPlaceholder: {
//     flex: 1,
//     backgroundColor: theme.brand,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   courseSubject: { fontSize: 10, color: theme.brandPrimary, paddingHorizontal: 8, paddingTop: 6, fontWeight: "600" },
//   courseTitle: { fontSize: 13, fontWeight: "600", color: theme.onSurface, paddingHorizontal: 8 },
//   courseTeacher: { fontSize: 11, color: theme.onSurfaceMuted, paddingHorizontal: 8, paddingBottom: 8 },
//   emptyText: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.md },
//   leaderboardHeader: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
//   leaderboardRank: { fontSize: 13, color: theme.onSurfaceMuted },
//   leaderboardRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: 8,
//     borderBottomWidth: 1,
//     borderBottomColor: theme.divider,
//     gap: 8,
//   },
//   leaderboardMe: { backgroundColor: theme.brandTertiary, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radii.sm },
//   leaderboardRankNum: { width: 24, fontSize: 14, fontWeight: "700", color: theme.onSurfaceMuted, textAlign: "center" },
//   leaderboardTopRank: { color: theme.warning },
//   leaderboardName: { flex: 1, fontSize: 14, color: theme.onSurface },
//   leaderboardYou: { fontSize: 11, color: theme.brandPrimary, fontWeight: "600" },
//   leaderboardLevel: { fontSize: 12, color: theme.onSurfaceMuted },
//   leaderboardXp: { fontSize: 13, fontWeight: "700", color: theme.brand },

//   // ---- Modal styles ----
//   modalOverlay: {
//     flex: 1,
//     backgroundColor: "rgba(0,0,0,0.5)",
//     justifyContent: "flex-end",
//   },
//   modalContainer: {
//     backgroundColor: "#fff",
//     borderTopLeftRadius: 20,
//     borderTopRightRadius: 20,
//     maxHeight: "80%",
//     paddingBottom: spacing.lg,
//   },
//   modalHandle: {
//     alignSelf: "center",
//     width: 40,
//     height: 4,
//     borderRadius: 2,
//     backgroundColor: theme.borderStrong,
//     marginTop: 8,
//     marginBottom: 8,
//     opacity: 0.4,
//   },
//   modalHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     paddingHorizontal: spacing.lg,
//     paddingVertical: spacing.md,
//     borderBottomWidth: 1,
//     borderBottomColor: theme.divider,
//   },
//   modalTitle: {
//     fontSize: 18,
//     fontWeight: "700",
//     color: theme.onSurface,
//   },
//   modalHeaderActions: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 12,
//   },
//   markAllBtn: {
//     paddingVertical: 4,
//     paddingHorizontal: 8,
//   },
//   markAllText: {
//     fontSize: 13,
//     color: theme.brandPrimary,
//     fontWeight: "600",
//   },
//   closeBtn: {
//     padding: 4,
//   },
//   modalLoading: {
//     padding: spacing.xl,
//     alignItems: "center",
//   },
//   modalLoadingText: {
//     color: theme.onSurfaceMuted,
//   },
//   emptyNotifications: {
//     padding: spacing.xl,
//     alignItems: "center",
//     gap: 8,
//   },
//   emptyNotificationsText: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: theme.onSurface,
//   },
//   emptyNotificationsSub: {
//     fontSize: 14,
//     color: theme.onSurfaceMuted,
//   },
//   notificationList: {
//     paddingHorizontal: spacing.lg,
//   },
//   notificationItem: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: 12,
//     borderBottomWidth: 1,
//     borderBottomColor: theme.divider,
//     gap: 12,
//   },
//   notificationRead: {
//     opacity: 0.6,
//   },
//   notificationIcon: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     backgroundColor: theme.surfaceTertiary,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   notificationContent: {
//     flex: 1,
//   },
//   notificationMessage: {
//     fontSize: 14,
//     color: theme.onSurface,
//     lineHeight: 20,
//   },
//   notificationMessageRead: {
//     color: theme.onSurfaceMuted,
//   },
//   notificationTime: {
//     fontSize: 11,
//     color: theme.onSurfaceMuted,
//     marginTop: 2,
//   },
//   unreadDot: {
//     width: 8,
//     height: 8,
//     borderRadius: 4,
//     backgroundColor: theme.brandPrimary,
//     marginLeft: 4,
//   },

//   // ---- Percentage Loader styles ----
//   loaderOverlay: {
//     position: "absolute",
//     top: 0,
//     left: 0,
//     right: 0,
//     bottom: 0,
//     backgroundColor: "rgba(255,255,255,0.9)",
//     justifyContent: "center",
//     alignItems: "center",
//     zIndex: 100,
//   },
//   loaderCard: {
//     backgroundColor: "#fff",
//     borderRadius: radii.md,
//     padding: spacing.xl,
//     alignItems: "center",
//     gap: 8,
//     minWidth: 160,
//     ...shadow1,
//   },
//   loaderPercent: {
//     fontSize: 28,
//     fontWeight: "800",
//     color: theme.brand,
//   },
//   loaderBar: {
//     width: 120,
//     height: 4,
//     backgroundColor: theme.surfaceTertiary,
//     borderRadius: 2,
//     overflow: "hidden",
//   },
//   loaderFill: {
//     height: "100%",
//     backgroundColor: theme.brandPrimary,
//     borderRadius: 2,
//   },
//   loaderText: {
//     fontSize: 13,
//     color: theme.onSurfaceMuted,
//   },
// });













































import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Dimensions,
  FlatList,
  Image,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import Svg, { Circle, Path } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type DashboardStats = {
  study_hours: number;
  study_seconds: number;
  questions_attempted: number;
  accuracy: number;
  streak: number;
  xp: number;
  level: number;
  xp_to_next: number;
  weak_topics: string[];
  strong_topics: string[];
  consistency: { day: string; minutes: number }[];
  total_attempts: number;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  picture?: string;        // profile picture URL
  xp: number;
  level: number;
  is_me?: boolean;
};

type Course = {
  course_id: string;
  title: string;
  subject: string;
  level: string;
  teacher_name: string;
  thumbnail?: string;
  video_url: string;
};

type Notification = {
  _id: string;
  message: string;
  type: string;
  link?: string;
  read: boolean;
  created_at: string;
};

// ---- GraduationCap Icon ----
function GraduationCap({ size = 32, color = theme.brandPrimary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Path
        d="M256 64L16 176l240 112 240-112L256 64zM16 176v176"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M464 288v128"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M256 400c-88.366 0-160-35.817-160-80s71.634-80 160-80 160 35.817 160 80-71.634 80-160 80z"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M256 400v-80"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ----- XP Progress Ring -----
function XPRing({ xp, level, toNext }: { xp: number; level: number; toNext: number }) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, ((500 - toNext) / 500) * 100);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={styles.ringContainer}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.surfaceTertiary}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.brandPrimary}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          origin={`${size / 2}, ${size / 2}`}
          rotation="-90"
        />
      </Svg>
      <View style={styles.ringContent}>
        <Text style={styles.ringLevelLabel}>Level</Text>
        <Text style={styles.ringLevel}>{level}</Text>
        <Text style={styles.ringXp}>{xp} XP</Text>
      </View>
    </View>
  );
}

// ----- Consistency Chart -----
function ConsistencyChart({ data }: { data: { day: string; minutes: number }[] }) {
  if (!data || data.length === 0) {
    return <Text style={styles.emptyChart}>No study data yet</Text>;
  }

  const max = Math.max(1, ...data.map((d) => d.minutes));
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1;

  return (
    <View style={styles.chartWrapper}>
      {data.map((item, index) => {
        const height = Math.max(6, (item.minutes / max) * 80);
        const isToday = index === todayIndex;
        return (
          <View key={item.day} style={styles.barColumn}>
            <Text style={styles.barValue}>{item.minutes}</Text>
            <View
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: isToday ? theme.brandPrimary : theme.brandPrimary,
                  opacity: isToday ? 1 : 0.4,
                },
              ]}
            />
            <Text style={styles.barLabel}>{item.day}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ----- Action Component -----
function Action({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.actionItem} onPress={onPress} testID={testID}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={theme.brandPrimary} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// ----- Percentage Loader -----
function PercentageLoader({ progress }: { progress: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.loaderOverlay, { opacity }]}>
      <View style={styles.loaderCard}>
        <GraduationCap size={40} color={theme.brandPrimary} />
        <Text style={styles.loaderPercent}>{Math.round(progress)}%</Text>
        <View style={styles.loaderBar}>
          <View style={[styles.loaderFill, { width: `${Math.min(100, progress)}%` }]} />
        </View>
        <Text style={styles.loaderText}>Loading dashboard…</Text>
      </View>
    </Animated.View>
  );
}

// ----- Helper to get initials -----
const getInitials = (name: string) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

// ----- MAIN COMPONENT -----
export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ top: LeaderboardEntry[]; my_rank?: LeaderboardEntry } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Load notifications
  const loadNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const res = await api<{ notifications: Notification[] }>("/notifications");
      const notifs = res.notifications || [];
      setNotifications(notifs);
      const unread = notifs.filter((n) => !n.read).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadData = useCallback(async () => {
    setError(null);
    setLoadingProgress(0);
    setLoadingProgress(10);

    try {
      const statsPromise = api<DashboardStats>("/dashboard/stats").then((res) => {
        setStats(res);
        setLoadingProgress((p) => Math.min(p + 20, 50));
        return res;
      });

      const leaderboardPromise = api<{ top: LeaderboardEntry[]; my_rank?: LeaderboardEntry }>("/leaderboard").then((res) => {
        setLeaderboard(res);
        setLoadingProgress((p) => Math.min(p + 20, 70));
        return res;
      });

      const coursesPromise = api<Course[]>("/courses").then((res) => {
        setCourses(res.slice(0, 4));
        setLoadingProgress((p) => Math.min(p + 20, 85));
        return res;
      });

      const notificationsPromise = api<{ notifications: Notification[] }>("/notifications").then((res) => {
        const notifs = res.notifications || [];
        setNotifications(notifs);
        const unread = notifs.filter((n) => !n.read).length;
        setUnreadCount(unread);
        setLoadingProgress((p) => Math.min(p + 10, 95));
        return res;
      });

      await Promise.all([statsPromise, leaderboardPromise, coursesPromise, notificationsPromise]);
      setLoadingProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 300));
      setLoading(false);
    } catch (err: any) {
      console.log("Dashboard load error:", err);
      setError("Could not load some data. Pull to refresh.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    setLoading(true);
    setLoadingProgress(0);
    await loadData();
    setRefreshing(false);
  };

  // Mark a single notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  // Navigate based on notification link
  const handleNotificationPress = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification._id);
    }
    if (notification.link) {
      router.push(notification.link);
      setModalVisible(false);
    }
  };

  const data = stats;

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="home-screen">
      {loading && <PercentageLoader progress={loadingProgress} />}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
      >
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ===== HEADER with profile image or fallback ===== */}
        <View style={styles.header}>
          <View style={styles.avatarRow}>
            <View style={styles.profileRow}>
              {user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileFallback}>
                  <Text style={styles.profileInitials}>{getInitials(user?.full_name || "User")}</Text>
                </View>
              )}
              <View>
                <Text style={styles.greet}>Hello, {user?.full_name?.split(" ")[0] || "Student"}</Text>
                <Text style={styles.brandTop}>GCSHARP</Text>
              </View>
            </View>
          </View>
          <Pressable style={styles.bell} onPress={() => setModalVisible(true)} testID="notifications-btn">
            <Ionicons name="notifications-outline" size={22} color={theme.brand} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Stat Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.stat, { backgroundColor: theme.brand }]}>
            <Ionicons name="flame" size={20} color="#FDBA74" />
            <Text style={styles.statValue}>{data?.streak ?? 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="trophy-outline" size={20} color={theme.warning} />
            <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.xp ?? 0}</Text>
            <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>XP Points</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="checkmark-circle-outline" size={20} color={theme.success} />
            <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.accuracy ?? 0}%</Text>
            <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>Accuracy</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actions}>
          <Action
            icon="document-text-outline"
            label="Past Questions"
            onPress={() => router.push("/past-questions")}
            testID="action-past-questions"
          />
          <Action
            icon="chatbubble-ellipses-outline"
            label="AI Tutor"
            onPress={() => router.push("/(tabs)/ai")}
            testID="action-ai"
          />
          <Action
            icon="stats-chart-outline"
            label="Stats"
            onPress={() => router.push("/stats")}
            testID="action-stats"
          />
          <Action
            icon="book-outline"
            label="Library"
            onPress={() => router.push("/(tabs)/library")}
            testID="action-library"
          />
        </View>

        {/* Start Practice Button */}
        <Pressable
          style={styles.startPractice}
          onPress={() => router.push("/past-questions")}
          testID="start-practice-btn"
        >
          <Text style={styles.startPracticeText}>Start Practice</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        {/* Study Consistency Chart */}
        <Text style={styles.sectionTitle}>Study Consistency</Text>
        <View style={styles.card}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartSubtitle}>Minutes studied · last 7 days</Text>
            <View style={styles.trendBadge}>
              <Ionicons name="trending-up" size={14} color={theme.success} />
              <Text style={styles.trendText}>Keep it up</Text>
            </View>
          </View>
          {data?.consistency ? (
            <ConsistencyChart data={data.consistency} />
          ) : (
            <Text style={styles.emptyChart}>No data yet</Text>
          )}
          <Pressable onPress={() => router.push("/stats")} style={styles.detailsBtn}>
            <Text style={styles.detailsText}>View full analytics</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.brandPrimary} />
          </Pressable>
        </View>

        {/* AI Recommendations */}
        <Text style={styles.sectionTitle}>AI Recommendations</Text>
        <View style={[styles.card, styles.aiCard]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={20} color={theme.brandPrimary} />
            <Text style={styles.aiTitle}>GC AI Suggestions</Text>
          </View>
          {data?.weak_topics && data.weak_topics.length > 0 ? (
            <>
              <Text style={styles.aiSub}>Focus on these weak topics:</Text>
              <View style={styles.topicTags}>
                {data.weak_topics.slice(0, 3).map((t) => (
                  <View key={t} style={styles.weakTag}>
                    <Text style={styles.weakTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.aiSub}>Complete a practice test and GC AI will pinpoint your weak topics.</Text>
          )}
          <View style={styles.aiButtons}>
            <Pressable style={styles.aiBtn} onPress={() => router.push("/(tabs)/ai")}>
              <Ionicons name="chatbubble-ellipses" size={16} color={theme.brandPrimary} />
              <Text style={styles.aiBtnText}>Ask AI Tutor</Text>
            </Pressable>
            <Pressable style={styles.aiBtn} onPress={() => router.push("/past-questions")}>
              <Ionicons name="compass-outline" size={16} color={theme.brandPrimary} />
              <Text style={styles.aiBtnText}>Practice weak topics</Text>
            </Pressable>
          </View>
        </View>

        {/* XP Progress Ring */}
        <View style={styles.ringRow}>
          <View style={[styles.card, styles.ringCard]}>
            <Text style={styles.ringTitle}>Level Progress</Text>
            {data ? (
              <XPRing xp={data.xp} level={data.level} toNext={data.xp_to_next} />
            ) : (
              <Text style={styles.ringSub}>No data</Text>
            )}
            <Text style={styles.ringSub}>{data?.xp_to_next ?? 0} XP to next level</Text>
          </View>
        </View>

        {/* Lesson Videos */}
        <Text style={styles.sectionTitle}>Lesson Videos for You</Text>
        {courses.length > 0 ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={courses}
            keyExtractor={(item) => item.course_id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.courseCard}
                onPress={() => router.push(`/library/${item.course_id}`)}
              >
                <View style={styles.courseThumb}>
                  {item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} style={styles.courseThumbImage} />
                  ) : (
                    <View style={styles.courseThumbPlaceholder}>
                      <Ionicons name="play-circle" size={32} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.courseSubject}>{item.subject}</Text>
                <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.courseTeacher}>{item.teacher_name}</Text>
              </Pressable>
            )}
          />
        ) : (
          <Text style={styles.emptyText}>No lessons yet. Check back soon.</Text>
        )}

        {/* ===== LEADERBOARD with profile pictures ===== */}
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        <View style={styles.card}>
          {leaderboard?.my_rank ? (
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardRank}>Your rank: #{leaderboard.my_rank.rank}</Text>
            </View>
          ) : (
            <Text style={styles.leaderboardRank}>Complete a quiz to see your rank</Text>
          )}
          {leaderboard?.top && leaderboard.top.length > 0 ? (
            leaderboard.top.slice(0, 5).map((entry) => {
              const isMe = entry.is_me;
              return (
                <View key={entry.rank} style={[styles.leaderboardRow, isMe && styles.leaderboardMe]}>
                  <Text style={[styles.leaderboardRankNum, entry.rank <= 3 && styles.leaderboardTopRank]}>
                    {entry.rank}
                  </Text>
                  {/* Profile picture or fallback initials */}
                  {entry.picture ? (
                    <Image source={{ uri: entry.picture }} style={styles.leaderboardAvatar} />
                  ) : (
                    <View style={styles.leaderboardAvatarFallback}>
                      <Text style={styles.leaderboardAvatarText}>
                        {getInitials(entry.name || "U")}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.leaderboardName, isMe && styles.leaderboardNameYou]} numberOfLines={1}>
                    {entry.name}
                    {isMe && <Text style={styles.leaderboardYou}> (You)</Text>}
                  </Text>
                  <Text style={styles.leaderboardLevel}>Lvl {entry.level}</Text>
                  <Text style={styles.leaderboardXp}>{entry.xp} XP</Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>Be the first on the leaderboard — start practicing!</Text>
          )}
        </View>
      </ScrollView>

      {/* ---- NOTIFICATIONS MODAL ---- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <View style={styles.modalHeaderActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
                    <Text style={styles.markAllText}>Mark all as read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color={theme.onSurface} />
                </TouchableOpacity>
              </View>
            </View>

            {loadingNotifications ? (
              <View style={styles.modalLoading}>
                <Text style={styles.modalLoadingText}>Loading notifications...</Text>
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.emptyNotifications}>
                <Ionicons name="notifications-off-outline" size={48} color={theme.onSurfaceMuted} />
                <Text style={styles.emptyNotificationsText}>No notifications yet</Text>
                <Text style={styles.emptyNotificationsSub}>Check back later for updates</Text>
              </View>
            ) : (
              <ScrollView style={styles.notificationList}>
                {notifications.map((notification) => (
                  <Pressable
                    key={notification._id}
                    style={[styles.notificationItem, notification.read && styles.notificationRead]}
                    onPress={() => handleNotificationPress(notification)}
                  >
                    <View style={styles.notificationIcon}>
                      {notification.type === "streak" && (
                        <Ionicons name="flame" size={20} color={theme.warning} />
                      )}
                      {notification.type === "reminder" && (
                        <Ionicons name="time-outline" size={20} color={theme.brandPrimary} />
                      )}
                      {notification.type === "ai_reply" && (
                        <Ionicons name="chatbubble-ellipses" size={20} color={theme.brandPrimary} />
                      )}
                      {(!notification.type || notification.type === "info") && (
                        <Ionicons name="information-circle" size={20} color={theme.brand} />
                      )}
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={[styles.notificationMessage, notification.read && styles.notificationMessageRead]}>
                        {notification.message}
                      </Text>
                      <Text style={styles.notificationTime}>
                        {new Date(notification.created_at).toLocaleDateString()} ·{" "}
                        {new Date(notification.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    {!notification.read && <View style={styles.unreadDot} />}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ===== STYLES =====
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: "#FEE2E2",
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  errorText: { color: "#991B1B", fontSize: 14, textAlign: "center" },

  // ---- Header ----
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: theme.brandPrimary,
  },
  profileFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.brandPrimary,
  },
  profileInitials: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  greet: { color: theme.onSurfaceMuted, fontSize: 12 },
  brandTop: { color: theme.brand, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    ...shadow1,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  // ---- Stats ----
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadow1,
    gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: "#fff", marginTop: 4 },
  statLabel: { fontSize: 11, color: "#DBEAFE" },

  // ---- Sections ----
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.onSurface,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  // ---- Actions ----
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  actionItem: {
    width: "48%",
    backgroundColor: "#fff",
    padding: spacing.lg,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow1,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontWeight: "700", color: theme.onSurface, flex: 1 },

  // ---- Start Practice ----
  startPractice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: theme.brand,
    paddingVertical: 14,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadow1,
  },
  startPracticeText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // ---- Cards ----
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadow1,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  chartSubtitle: { fontSize: 12, color: theme.onSurfaceMuted },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  trendText: { fontSize: 12, color: theme.success, fontWeight: "600" },
  chartWrapper: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 110,
    marginVertical: spacing.sm,
    gap: 4,
  },
  barColumn: { alignItems: "center", flex: 1 },
  bar: { width: 16, borderRadius: 4 },
  barLabel: { fontSize: 10, color: theme.onSurfaceMuted, marginTop: 4 },
  barValue: { fontSize: 10, color: theme.onSurfaceMuted, marginBottom: 2, fontWeight: "600" },
  emptyChart: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.md },
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: 6 },
  detailsText: { color: theme.brandPrimary, fontWeight: "700", fontSize: 13 },

  // ---- AI ----
  aiCard: { gap: spacing.sm },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiTitle: { fontWeight: "700", fontSize: 15, color: theme.onSurface },
  aiSub: { fontSize: 13, color: theme.onSurfaceMuted },
  topicTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  weakTag: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  weakTagText: { color: "#991B1B", fontSize: 12, fontWeight: "600" },
  aiButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
  },
  aiBtnText: { fontSize: 13, color: theme.brandPrimary, fontWeight: "600" },

  // ---- XP Ring ----
  ringRow: { paddingHorizontal: spacing.lg, marginTop: 19 },
  ringCard: { alignItems: "center", paddingVertical: spacing.lg },
  ringTitle: { fontWeight: "700", fontSize: 15, color: theme.onSurface, marginBottom: spacing.sm },
  ringContainer: { position: "relative", alignItems: "center", justifyContent: "center" },
  ringContent: { position: "absolute", alignItems: "center" },
  ringLevelLabel: { fontSize: 10, color: theme.onSurfaceMuted },
  ringLevel: { fontSize: 28, fontWeight: "800", color: theme.brand, marginTop: -2 },
  ringXp: { fontSize: 11, color: theme.onSurfaceMuted },
  ringSub: { fontSize: 13, color: theme.onSurfaceMuted, marginTop: 6 },

  // ---- Courses ----
  courseCard: {
    width: 140,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    overflow: "hidden",
    ...shadow1,
    marginRight: spacing.sm,
  },
  courseThumb: { height: 80, backgroundColor: theme.surfaceTertiary },
  courseThumbImage: { width: "100%", height: "100%", resizeMode: "cover" },
  courseThumbPlaceholder: {
    flex: 1,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  courseSubject: { fontSize: 10, color: theme.brandPrimary, paddingHorizontal: 8, paddingTop: 6, fontWeight: "600" },
  courseTitle: { fontSize: 13, fontWeight: "600", color: theme.onSurface, paddingHorizontal: 8 },
  courseTeacher: { fontSize: 11, color: theme.onSurfaceMuted, paddingHorizontal: 8, paddingBottom: 8 },
  emptyText: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.md },

  // ---- Leaderboard ----
  leaderboardHeader: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  leaderboardRank: { fontSize: 13, color: theme.onSurfaceMuted },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    gap: 8,
  },
  leaderboardMe: {
    backgroundColor: theme.brandTertiary,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  leaderboardRankNum: { width: 24, fontSize: 14, fontWeight: "700", color: theme.onSurfaceMuted, textAlign: "center" },
  leaderboardTopRank: { color: theme.warning },
  leaderboardName: { flex: 1, fontSize: 14, color: theme.onSurface },
  leaderboardNameYou: { fontWeight: "700" },
  leaderboardYou: { fontSize: 11, color: theme.brandPrimary, fontWeight: "600" },
  leaderboardLevel: { fontSize: 12, color: theme.onSurfaceMuted },
  leaderboardXp: { fontSize: 13, fontWeight: "700", color: theme.brand },
  leaderboardAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.border,
  },
  leaderboardAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  leaderboardAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.brand,
  },

  // ---- Modal ----
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: spacing.lg,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderStrong,
    marginTop: 8,
    marginBottom: 8,
    opacity: 0.4,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.onSurface,
  },
  modalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 13,
    color: theme.brandPrimary,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
  },
  modalLoading: {
    padding: spacing.xl,
    alignItems: "center",
  },
  modalLoadingText: {
    color: theme.onSurfaceMuted,
  },
  emptyNotifications: {
    padding: spacing.xl,
    alignItems: "center",
    gap: 8,
  },
  emptyNotificationsText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.onSurface,
  },
  emptyNotificationsSub: {
    fontSize: 14,
    color: theme.onSurfaceMuted,
  },
  notificationList: {
    paddingHorizontal: spacing.lg,
  },
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    gap: 12,
  },
  notificationRead: {
    opacity: 0.6,
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    color: theme.onSurface,
    lineHeight: 20,
  },
  notificationMessageRead: {
    color: theme.onSurfaceMuted,
  },
  notificationTime: {
    fontSize: 11,
    color: theme.onSurfaceMuted,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.brandPrimary,
    marginLeft: 4,
  },

  // ---- Percentage Loader ----
  loaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  loaderCard: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: 8,
    minWidth: 160,
    ...shadow1,
  },
  loaderPercent: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.brand,
  },
  loaderBar: {
    width: 120,
    height: 4,
    backgroundColor: theme.surfaceTertiary,
    borderRadius: 2,
    overflow: "hidden",
  },
  loaderFill: {
    height: "100%",
    backgroundColor: theme.brandPrimary,
    borderRadius: 2,
  },
  loaderText: {
    fontSize: 13,
    color: theme.onSurfaceMuted,
  },
});