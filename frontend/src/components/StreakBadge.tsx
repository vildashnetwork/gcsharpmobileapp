// // components/StreakBadge.tsx
// import { useEffect, useState } from 'react';
// import { View, Text, StyleSheet } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import { api } from '@/src/api';
// import { theme } from '@/src/theme';

// type StreakData = {
//     streak: number;
//     level: number;
//     progress_percent: number;
//     today_seconds: number;
//     goal_seconds: number;
// };

// export function StreakBadge() {
//     const [data, setData] = useState<StreakData | null>(null);

//     const fetchStreak = async () => {
//         try {
//             const res = await api.get('/user/streak');
//             setData(res.data);
//         } catch {
//             // ignore
//         }
//     };

//     useEffect(() => {
//         fetchStreak();
//         const interval = setInterval(fetchStreak, 60000); // refresh every minute
//         return () => clearInterval(interval);
//     }, []);

//     if (!data) return null;

//     const progressWidth = Math.min(100, data.progress_percent);

//     return (
//         <View style={styles.badge}>
//             <View style={styles.item}>
//                 <Ionicons name="flame" size={16} color={data.streak > 0 ? theme.warning : theme.onSurfaceMuted} />
//                 <Text style={styles.value}>{data.streak}</Text>
//             </View>
//             <View style={styles.divider} />
//             <View style={styles.item}>
//                 <Ionicons name="trophy" size={16} color={theme.warning} />
//                 <Text style={styles.value}>{data.level}</Text>
//             </View>
//             <View style={styles.divider} />
//             <View style={styles.progressWrapper}>
//                 <Ionicons name="target" size={14} color={theme.onSurfaceMuted} />
//                 <View style={styles.progressBar}>
//                     <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
//                 </View>
//                 <Text style={styles.percent}>{Math.round(data.progress_percent)}%</Text>
//             </View>
//         </View>
//     );
// }

// const styles = StyleSheet.create({
//     badge: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         backgroundColor: theme.surfaceSecondary,
//         paddingHorizontal: 10,
//         paddingVertical: 6,
//         borderRadius: 20,
//         borderWidth: 1,
//         borderColor: theme.border,
//         gap: 8,
//     },
//     item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
//     value: { fontWeight: '600', fontSize: 13, color: theme.onSurface },
//     divider: { width: 1, height: 16, backgroundColor: theme.border },
//     progressWrapper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
//     progressBar: { width: 50, height: 4, backgroundColor: theme.surfaceTertiary, borderRadius: 2, overflow: 'hidden' },
//     progressFill: { height: '100%', backgroundColor: theme.brandPrimary },
//     percent: { fontSize: 9, color: theme.onSurfaceMuted },
// });






















// components/StreakBadge.tsx
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api';
import { theme } from '@/src/theme';
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { StreakCelebration } from './StreakCelebration';

type StreakData = {
    streak: number;
    level: number;
    progress_percent: number;
    today_seconds: number;
    goal_seconds: number;
};

type StreakBadgeProps = {
    // Optional hook for screens that want to react to the completion too
    // (e.g. log an analytics event). The celebration itself always fires
    // from here regardless of whether this is provided.
    onStreakComplete?: (streak: number) => void;
};

export function StreakBadge({ onStreakComplete }: StreakBadgeProps = {}) {
    const [data, setData] = useState<StreakData | null>(null);
    const [celebrating, setCelebrating] = useState(false);

    // Tracks the previous progress_percent so we can detect the exact
    // moment the daily goal is crossed, rather than re-celebrating on
    // every poll once the user is already at/above 100%.
    const prevProgress = useRef<number | null>(null);

    const fetchStreak = async () => {
        try {
            const streak = await api<StreakData>('/user/streak');
            setData(streak);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        fetchStreak();
        const interval = setInterval(fetchStreak, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!data) return;
        const prev = prevProgress.current;
        const justCompleted = prev !== null && prev < 100 && data.progress_percent >= 100;
        if (justCompleted) {
            setCelebrating(true);
            onStreakComplete?.(data.streak);
        }
        prevProgress.current = data.progress_percent;
    }, [data, onStreakComplete]);

    if (!data) return null;

    const progressWidth = Math.min(100, data.progress_percent);

    return (
        <>
            <View style={styles.badge}>
                <View style={styles.item}>
                    <Ionicons name="flame" size={16} color={data.streak > 0 ? theme.warning : theme.onSurfaceMuted} />
                    <Text style={styles.value}>{data.streak}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.item}>
                    <Ionicons name="trophy" size={16} color={theme.warning} />
                    <Text style={styles.value}>{data.level}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.progressWrapper}>
                    <Ionicons name="locate-outline" size={14} color={theme.onSurfaceMuted} />
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
                    </View>
                    <Text style={styles.percent}>{Math.round(data.progress_percent)}%</Text>
                </View>
            </View>

            <StreakCelebration
                visible={celebrating}
                streak={data.streak}
                onDismiss={() => setCelebrating(false)}
            />
        </>
    );
}

const createStyles = (t: Palette) => StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.surfaceSecondary,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: t.border,
        gap: 8,
    },
    item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    value: { fontWeight: '600', fontSize: 13, color: t.onSurface },
    divider: { width: 1, height: 16, backgroundColor: t.border },
    progressWrapper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    progressBar: { width: 50, height: 4, backgroundColor: t.surfaceTertiary, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: t.brandPrimary },
    percent: { fontSize: 9, color: t.onSurfaceMuted },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});