





// // components/VideoSolutionPlayer.tsx
// import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// import {
//     View,
//     Text,
//     StyleSheet,
//     Pressable,
//     ActivityIndicator,
//     ScrollView,
//     Animated,
//     Dimensions,
// } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import * as Speech from 'expo-speech';
// import { theme, spacing, radii, shadow1 } from '@/src/theme';

// const RATE_STEPS = [0.75, 1, 1.25, 1.5];
// const { width } = Dimensions.get('window');

// type Scene = {
//     heading: string;
//     board: string[];
//     narration: string;
// };

// type VideoSolutionPlayerProps = {
//     scenes: Scene[];
//     title?: string;
//     question?: string;
//     onClose?: () => void;
// };

// export function VideoSolutionPlayer({ scenes, title, question, onClose }: VideoSolutionPlayerProps) {
//     const [idx, setIdx] = useState(0);
//     const [playing, setPlaying] = useState(true);
//     const [revealed, setRevealed] = useState(0);
//     const [progress, setProgress] = useState(0);
//     const [isLoading, setIsLoading] = useState(true);
//     const [rate, setRate] = useState(1);
//     const [muted, setMuted] = useState(false);
//     const [showCaptions, setShowCaptions] = useState(true);
//     const [speaking, setSpeaking] = useState(false);
//     const [audioError, setAudioError] = useState(false);
//     const [narrationIndex, setNarrationIndex] = useState(0);

//     // Animated values for each board line (slide + opacity)
//     const lineAnims = useRef<Animated.Value[]>([]);

//     const autoAdvanceTimer = useRef<NodeJS.Timeout | null>(null);
//     const progressInterval = useRef<NodeJS.Timeout | null>(null);

//     const scene = scenes?.[idx] || null;
//     const totalScenes = scenes?.length || 0;
//     const hasNarration = !!(scene?.board?.length || (scene?.narration && scene.narration.trim().length > 0));
//     const narrationParts = useMemo(() => {
//         const boardLines = scene?.board?.map((line) => line.trim()).filter(Boolean) || [];
//         if (boardLines.length > 0) return boardLines;
//         return scene?.narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [];
//     }, [scene]);
//     const activeNarration = narrationParts[narrationIndex] || '';

//     const advanceToNext = useCallback(() => {
//         if (idx < totalScenes - 1) {
//             autoAdvanceTimer.current = setTimeout(() => {
//                 setIdx((current) => current + 1);
//                 setProgress(0);
//                 setPlaying(true);
//             }, 600);
//         } else {
//             setProgress(100);
//             setPlaying(false);
//         }
//     }, [idx, totalScenes]);

//     useEffect(() => {
//         setNarrationIndex(0);
//         setAudioError(false);
//     }, [idx]);

//     // ---- Reveal board lines one by one with slide animation ----
//     useEffect(() => {
//         if (!scene) return;
//         setRevealed(0);
//         setIsLoading(true);
//         const board = scene.board || [];
//         // Reset animations for all lines
//         lineAnims.current = board.map(() => new Animated.Value(-10));
//         board.forEach((_, i) => {
//             lineAnims.current[i] = new Animated.Value(-10);
//         });

//         if (hasNarration) {
//             setIsLoading(false);
//             return;
//         }

//         let i = 0;
//         const timer = setInterval(() => {
//             i += 1;
//             setRevealed((r) => Math.min(board.length, r + 1));
//             if (i <= board.length) {
//                 Animated.spring(lineAnims.current[i - 1], {
//                     toValue: 0,
//                     tension: 80,
//                     friction: 12,
//                     useNativeDriver: true,
//                 }).start();
//             }
//             if (i >= board.length) {
//                 clearInterval(timer);
//                 setIsLoading(false);
//             }
//         }, 400);
//         return () => clearInterval(timer);
//     }, [idx, scene, hasNarration]);

//     // Keep the board animation and the in-video caption on the same narration step.
//     useEffect(() => {
//         if (!scene || !hasNarration) return;
//         const lineIndex = Math.min(narrationIndex, (scene.board || []).length - 1);
//         if (lineIndex < 0 || !lineAnims.current[lineIndex]) return;
//         setRevealed((current) => Math.max(current, lineIndex + 1));
//         Animated.spring(lineAnims.current[lineIndex], {
//             toValue: 0,
//             tension: 80,
//             friction: 12,
//             useNativeDriver: true,
//         }).start();
//     }, [scene, hasNarration, narrationIndex]);

//     // ---- Stop speech on unmount ----
//     useEffect(() => {
//         return () => {
//             Speech.stop();
//             if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
//             if (progressInterval.current) clearInterval(progressInterval.current);
//         };
//     }, []);

//     const completeNarrationPart = useCallback(() => {
//         if (narrationIndex < narrationParts.length - 1) {
//             setNarrationIndex((current) => current + 1);
//             setProgress((current) => Math.max(current, ((narrationIndex + 1) / narrationParts.length) * 100));
//         } else {
//             setProgress(100);
//             advanceToNext();
//         }
//     }, [advanceToNext, narrationIndex, narrationParts.length]);

//     // ---- Speak one in-video caption at a time ----
//     useEffect(() => {
//         if (!playing || !scene || !hasNarration || muted || audioError || !activeNarration) {
//             if (speaking) {
//                 Speech.stop();
//                 setSpeaking(false);
//             }
//             return;
//         }

//         const speakText = () => {
//             Speech.stop();
//             setSpeaking(true);
//             const text = activeNarration;

//             Speech.speak(text, {
//                 rate: rate,
//                 pitch: 1,
//                 onStart: () => {
//                     if (progressInterval.current) clearInterval(progressInterval.current);
//                     const words = text.trim().split(/\s+/).length;
//                     const estMs = Math.max(2500, (words / (2.3 * rate)) * 1000);
//                     const start = Date.now();
//                     progressInterval.current = setInterval(() => {
//                         const elapsed = Date.now() - start;
//                         const partProgress = Math.min(100, (elapsed / estMs) * 100);
//                         const sceneProgress = narrationParts.length
//                             ? ((narrationIndex + partProgress / 100) / narrationParts.length) * 100
//                             : partProgress;
//                         setProgress(sceneProgress);
//                     }, 100);
//                 },
//                 onDone: () => {
//                     setSpeaking(false);
//                     if (progressInterval.current) clearInterval(progressInterval.current);
//                     completeNarrationPart();
//                 },
//                 onStopped: () => {
//                     setSpeaking(false);
//                     if (progressInterval.current) clearInterval(progressInterval.current);
//                 },
//                 onError: () => {
//                     setAudioError(true);
//                     setSpeaking(false);
//                     if (progressInterval.current) clearInterval(progressInterval.current);
//                     completeNarrationPart();
//                 },
//             });
//         };

//         speakText();

//         return () => {
//             Speech.stop();
//             if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
//             if (progressInterval.current) clearInterval(progressInterval.current);
//         };
//     }, [playing, scene, hasNarration, muted, audioError, activeNarration, rate, narrationIndex, narrationParts.length, completeNarrationPart]);

//     // ---- Silent fallback for mute, missing narration, or speech errors ----
//     useEffect(() => {
//         if (!playing || !scene || (hasNarration && !muted && !audioError)) return;

//         if (progressInterval.current) clearInterval(progressInterval.current);
//         if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);

//         const words = activeNarration.trim().split(/\s+/).filter(Boolean).length;
//         const duration = Math.max(2500, (words / (2.3 * rate)) * 1000);
//         const startedAt = Date.now();

//         progressInterval.current = setInterval(() => {
//             const partProgress = Math.min(100, ((Date.now() - startedAt) / duration) * 100);
//             const sceneProgress = narrationParts.length
//                 ? ((narrationIndex + partProgress / 100) / narrationParts.length) * 100
//                 : partProgress;
//             setProgress(sceneProgress);
//         }, 100);
//         autoAdvanceTimer.current = setTimeout(() => {
//             if (progressInterval.current) clearInterval(progressInterval.current);
//             setProgress(100);
//             completeNarrationPart();
//         }, duration);

//         return () => {
//             if (progressInterval.current) clearInterval(progressInterval.current);
//             if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
//         };
//     }, [playing, scene, hasNarration, muted, audioError, rate, activeNarration, narrationIndex, narrationParts.length, completeNarrationPart]);

//     // ---- Play/Pause toggle ----
//     const togglePlay = () => {
//         if (playing) {
//             Speech.stop();
//             setPlaying(false);
//         } else {
//             setPlaying(true);
//         }
//     };

//     // ---- Navigate to scene ----
//     const goToScene = (index: number) => {
//         if (index < 0 || index >= totalScenes) return;
//         Speech.stop();
//         if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
//         if (progressInterval.current) clearInterval(progressInterval.current);
//         setIdx(index);
//         setProgress(0);
//         setRevealed(0);
//         setPlaying(true);
//     };

//     // ---- Restart ----
//     const restart = () => {
//         Speech.stop();
//         if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
//         if (progressInterval.current) clearInterval(progressInterval.current);
//         setIdx(0);
//         setProgress(0);
//         setPlaying(true);
//         setRevealed(0);
//     };

//     // ---- Speed cycle ----
//     const cycleRate = () => {
//         const i = RATE_STEPS.indexOf(rate);
//         setRate(RATE_STEPS[(i + 1) % RATE_STEPS.length]);
//     };

//     // ---- Mute toggle ----
//     const toggleMute = () => {
//         setMuted((current) => !current);
//         if (!muted) {
//             Speech.stop();
//             setSpeaking(false);
//         }
//     };

//     // ---- Loading state ----
//     if (!scene || totalScenes === 0) {
//         return (
//             <View style={styles.loadingContainer}>
//                 <ActivityIndicator size="large" color={theme.brandPrimary} />
//                 <Text style={styles.loadingText}>Loading video solution...</Text>
//             </View>
//         );
//     }

//     return (
//         <View style={styles.container}>
//             {/* Video surface: the solution text and narration stay inside the video. */}
//             <View style={styles.surface}>
//                 <View style={styles.surfaceInner}>
//                     {/* Top bar */}
//                     <View style={styles.topBar}>
//                         <View style={styles.badge}>
//                             <Ionicons name="radio" size={12} color="#ef4444" />
//                             <Text style={styles.badgeText}>AI SOLUTION</Text>
//                         </View>
//                         <View style={styles.topBarRight}>
//                             <Text style={styles.sceneCounter}>Scene {idx + 1} / {totalScenes}</Text>
//                             {onClose && (
//                                 <Pressable onPress={onClose} style={styles.surfaceCloseBtn}>
//                                     <Ionicons name="close" size={18} color="#cbd5e1" />
//                                 </Pressable>
//                             )}
//                         </View>
//                     </View>

//                     {/* Heading */}
//                     <Text style={styles.heading}>{scene.heading || `Step ${idx + 1}`}</Text>

//                     {/* Board lines – sliding from left, inside the video surface */}
//                     <View style={styles.boardContainer}>
//                         {(scene.board || []).map((line, i) => (
//                             <Animated.View
//                                 key={i}
//                                 style={[
//                                     styles.boardLine,
//                                     {
//                                         opacity: i < revealed ? 1 : 0,
//                                         transform: [{ translateX: i < revealed ? lineAnims.current[i] || 0 : -10 }],
//                                     },
//                                 ]}
//                             >
//                                 <Text style={styles.boardText}>{line}</Text>
//                             </Animated.View>
//                         ))}
//                     </View>

//                     {/* Loading overlay */}
//                     {isLoading && (
//                         <View style={styles.loadingOverlay}>
//                             <ActivityIndicator size="small" color="#fff" />
//                         </View>
//                     )}

//                     {/* Progress bar on video */}
//                     <View style={styles.progressBarContainer}>
//                         <View style={styles.progressBar}>
//                             <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
//                         </View>
//                     </View>

//                     {/* Narration status */}
//                     {playing && speaking && !muted && (
//                         <View style={styles.statusBar}>
//                             <Ionicons name="volume-high" size={14} color={theme.brandPrimary} />
//                             <Text style={styles.statusText}>Narrating step {idx + 1}...</Text>
//                             <Text style={[styles.statusText, styles.progressPercent]}>{Math.round(progress)}%</Text>
//                         </View>
//                     )}
//                     {playing && !speaking && !muted && hasNarration && (
//                         <View style={styles.statusBar}>
//                             <Ionicons name="timer" size={14} color={theme.muted} />
//                             <Text style={styles.statusText}>Waiting to narrate...</Text>
//                         </View>
//                     )}
//                     {muted && (
//                         <View style={styles.statusBar}>
//                             <Ionicons name="volume-off" size={14} color={theme.muted} />
//                             <Text style={styles.statusText}>Narration muted</Text>
//                         </View>
//                     )}

//                     {/* Scene navigation dots on video */}
//                     <View style={styles.dotsOverlay}>
//                         {scenes.map((_, i) => (
//                             <Pressable key={i} onPress={() => goToScene(i)} style={styles.dotWrapper}>
//                                 <View style={[styles.dot, i === idx ? styles.dotActive : i < idx ? styles.dotCompleted : styles.dotInactive]} />
//                             </Pressable>
//                         ))}
//                     </View>
//                 </View>
//             </View>

//             {/* Controls (identical to web layout) */}
//             <View style={styles.controls}>
//                 <View style={styles.controlsRow}>
//                     <Pressable
//                         onPress={() => goToScene(idx - 1)}
//                         disabled={idx === 0}
//                         style={({ pressed }) => [
//                             styles.controlButton,
//                             idx === 0 && styles.controlButtonDisabled,
//                             pressed && styles.controlButtonPressed,
//                         ]}
//                     >
//                         <Ionicons name="play-skip-back" size={20} color={idx === 0 ? theme.muted : theme.onSurface} />
//                     </Pressable>

//                     <Pressable
//                         onPress={togglePlay}
//                         style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
//                     >
//                         <Ionicons name={playing ? 'pause' : 'play'} size={24} color="#fff" />
//                     </Pressable>

//                     <Pressable
//                         onPress={() => goToScene(idx + 1)}
//                         disabled={idx === totalScenes - 1}
//                         style={({ pressed }) => [
//                             styles.controlButton,
//                             idx === totalScenes - 1 && styles.controlButtonDisabled,
//                             pressed && styles.controlButtonPressed,
//                         ]}
//                     >
//                         <Ionicons name="play-skip-forward" size={20} color={idx === totalScenes - 1 ? theme.muted : theme.onSurface} />
//                     </Pressable>

//                     <Pressable
//                         onPress={restart}
//                         style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
//                     >
//                         <Ionicons name="refresh" size={20} color={theme.onSurface} />
//                     </Pressable>

//                     <Pressable
//                         onPress={toggleMute}
//                         style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
//                     >
//                         <Ionicons name={muted ? 'volume-off' : 'volume-high'} size={20} color={theme.onSurface} />
//                     </Pressable>

//                     <Pressable
//                         onPress={cycleRate}
//                         style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
//                     >
//                         <Text style={styles.rateText}>{rate}x</Text>
//                     </Pressable>

//                     <Pressable
//                         onPress={() => setShowCaptions(!showCaptions)}
//                         style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed, showCaptions && styles.activeControl]}
//                     >
//                         <Ionicons name="text" size={20} color={showCaptions ? theme.brandPrimary : theme.onSurface} />
//                     </Pressable>
//                 </View>

//                 {/* Generic progress bar (web uses same for tts/timer) */}
//                 <View style={styles.progressBarBottom}>
//                     <View style={styles.progressBarTrack}>
//                         <View style={[styles.progressFillBottom, { width: `${Math.min(progress, 100)}%` }]} />
//                     </View>
//                 </View>

//                 {/* Scene labels (start / end) */}
//                 <View style={styles.sceneLabels}>
//                     <Text style={styles.labelText}>Start</Text>
//                     <Text style={[styles.labelText, styles.labelCenter]}>{idx + 1} of {totalScenes}</Text>
//                     <Text style={styles.labelText}>End</Text>
//                 </View>

//                 {/* Question */}
//                 {question && (
//                     <View style={styles.questionContainer}>
//                         <Text style={styles.questionLabel}>Q:</Text>
//                         <Text style={styles.questionText} numberOfLines={2}>{question}</Text>
//                     </View>
//                 )}
//             </View>
//         </View>
//     );
// }

// const styles = StyleSheet.create({
//     container: {
//         backgroundColor: '#fff',
//         borderRadius: radii.md,
//         borderWidth: 1,
//         borderColor: theme.border,
//         overflow: 'hidden',
//         ...shadow1,
//         marginHorizontal: spacing.md,
//     },
//     loadingContainer: {
//         padding: spacing.lg,
//         alignItems: 'center',
//         gap: 8,
//     },
//     loadingText: { color: theme.onSurfaceMuted },
//     surface: {
//         backgroundColor: '#0A192F',
//         paddingHorizontal: spacing.md,
//         paddingTop: spacing.md,
//         paddingBottom: spacing.sm,
//         minHeight: 330,
//         position: 'relative',
//     },
//     surfaceInner: {
//         flex: 1,
//         minHeight: 300,
//         position: 'relative',
//     },
//     topBar: {
//         flexDirection: 'row',
//         justifyContent: 'space-between',
//         alignItems: 'center',
//         marginBottom: 8,
//     },
//     topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
//     surfaceCloseBtn: { padding: 2 },
//     badge: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 4,
//         backgroundColor: 'rgba(239,68,68,0.8)',
//         paddingHorizontal: 8,
//         paddingVertical: 2,
//         borderRadius: 12,
//     },
//     badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
//     sceneCounter: { color: '#94a3b8', fontSize: 10 },
//     heading: {
//         color: '#93c5fd',
//         fontSize: 18,
//         fontWeight: '600',
//         marginBottom: 8,
//     },
//     boardContainer: {
//         flex: 1,
//         maxHeight: '72%',
//         marginBottom: 8,
//     },
//     boardLine: {
//         marginBottom: 6,
//     },
//     boardText: {
//         color: '#e2e8f0',
//         fontSize: 14,
//         lineHeight: 20,
//     },
//     loadingOverlay: {
//         position: 'absolute',
//         inset: 0,
//         backgroundColor: 'rgba(0,0,0,0.3)',
//         justifyContent: 'center',
//         alignItems: 'center',
//     },
//     captionsContainer: {
//         position: 'absolute',
//         bottom: 52,
//         left: 12,
//         right: 12,
//         paddingHorizontal: 12,
//         paddingVertical: 6,
//         backgroundColor: 'rgba(0,0,0,0.6)',
//         borderRadius: 8,
//     },
//     captionsText: {
//         color: '#f1f5f9',
//         fontSize: 13,
//         textAlign: 'center',
//     },
//     progressBarContainer: {
//         position: 'absolute',
//         bottom: 24,
//         left: 12,
//         right: 12,
//     },
//     progressBar: {
//         height: 3,
//         backgroundColor: 'rgba(255,255,255,0.2)',
//         borderRadius: 2,
//         overflow: 'hidden',
//     },
//     progressFill: {
//         height: '100%',
//         backgroundColor: theme.brandPrimary,
//     },
//     statusBar: {
//         position: 'absolute',
//         bottom: 32,
//         left: 16,
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 6,
//     },
//     statusText: { color: '#94a3b8', fontSize: 10 },
//     progressPercent: { marginLeft: 'auto', marginRight: 12 },
//     dotsOverlay: {
//         position: 'absolute',
//         bottom: 10,
//         left: 0,
//         right: 0,
//         flexDirection: 'row',
//         justifyContent: 'center',
//         gap: 6,
//     },
//     dotWrapper: { padding: 4 },
//     dot: {
//         width: 6,
//         height: 6,
//         borderRadius: 3,
//     },
//     dotActive: { backgroundColor: theme.brandPrimary, width: 12 },
//     dotCompleted: { backgroundColor: theme.brandPrimary, opacity: 0.4 },
//     dotInactive: { backgroundColor: '#94a3b8' },
//     controls: {
//         paddingHorizontal: spacing.sm,
//         paddingTop: spacing.md,
//         paddingBottom: spacing.sm,
//         gap: 6,
//     },
//     controlsRow: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         justifyContent: 'center',
//         gap: 7,
//         flexWrap: 'nowrap',
//     },
//     controlButton: {
//         width: 38,
//         height: 38,
//         borderRadius: 12,
//         alignItems: 'center',
//         justifyContent: 'center',
//         borderWidth: 1,
//         borderColor: theme.border,
//     },
//     controlButtonDisabled: { opacity: 0.3 },
//     controlButtonPressed: { opacity: 0.7 },
//     playButton: {
//         width: 48,
//         height: 48,
//         borderRadius: 24,
//         backgroundColor: theme.brandPrimary,
//         alignItems: 'center',
//         justifyContent: 'center',
//         ...shadow1,
//     },
//     playButtonPressed: { opacity: 0.8 },
//     rateText: { fontSize: 13, fontWeight: '600', color: theme.onSurface },
//     activeControl: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
//     progressBarBottom: {
//         marginTop: 4,
//         height: 3,
//         backgroundColor: theme.surfaceTertiary,
//         borderRadius: 2,
//         overflow: 'hidden',
//     },
//     progressFillBottom: {
//         height: '100%',
//         backgroundColor: theme.brandPrimary,
//     },
//     sceneLabels: {
//         flexDirection: 'row',
//         justifyContent: 'space-between',
//         marginTop: 2,
//     },
//     labelText: { fontSize: 9, color: theme.onSurfaceMuted, opacity: 0.5 },
//     labelCenter: { color: theme.brandPrimary, opacity: 0.6 },
//     questionContainer: {
//         flexDirection: 'row',
//         gap: 6,
//         backgroundColor: theme.surface,
//         padding: 8,
//         borderRadius: radii.sm,
//         borderWidth: 1,
//         borderColor: theme.border,
//         marginTop: 4,
//     },
//     questionLabel: { fontWeight: '700', color: theme.onSurface, fontSize: 13 },
//     questionText: { flex: 1, color: theme.onSurfaceMuted, fontSize: 12 },
// });



















































// components/VideoSolutionPlayer.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    ScrollView,
    Animated,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { theme, spacing, radii, shadow1 } from '@/src/theme';

const RATE_STEPS = [0.75, 1, 1.25, 1.5];
const { width } = Dimensions.get('window');

type Scene = {
    heading: string;
    board: string[];
    narration: string;
};

type VideoSolutionPlayerProps = {
    scenes: Scene[];
    title?: string;
    question?: string;
    onClose?: () => void;
};

function cleanSolutionText(value: unknown): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const data = value as Record<string, unknown>;
        for (const key of ['text', 'body', 'explanation', 'answer', 'result', 'solution', 'narration']) {
            const candidate = cleanSolutionText(data[key]);
            if (candidate) return candidate;
        }
        return '';
    }
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text) return '';

    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const preferred = ['narration', 'body', 'explanation', 'text', 'answer', 'result', 'solution'];
        for (const key of preferred) {
            const candidate = cleanSolutionText(parsed[key]);
            if (candidate) return candidate;
        }
        return '';
    } catch {
        return text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .replace(/"(?:title|heading|body|narration|steps|answer|solution|result|explanation)"\s*:\s*/gi, '')
            .replace(/[{}[\]"]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

function normalizeScenes(input: Scene[] | undefined): Scene[] {
    return (input || []).map((item) => {
        const board = (item.board || [])
            .flatMap((line) => cleanSolutionText(line).split(/\r?\n/))
            .filter(Boolean);
        const narration = cleanSolutionText(item.narration);
        return {
            heading: cleanSolutionText(item.heading),
            board,
            narration: narration || board.join('. '),
        };
    });
}

export function VideoSolutionPlayer({ scenes, title, question, onClose }: VideoSolutionPlayerProps) {
    const [idx, setIdx] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [revealed, setRevealed] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [rate, setRate] = useState(1);
    const [muted, setMuted] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [speaking, setSpeaking] = useState(false);
    const [audioError, setAudioError] = useState(false);
    const revealedRef = useRef(0);

    // Animated values for each board line (slide + opacity)
    const lineAnims = useRef<Animated.Value[]>([]);

    const autoAdvanceTimer = useRef<NodeJS.Timeout | null>(null);
    const progressInterval = useRef<NodeJS.Timeout | null>(null);
    const playbackGeneration = useRef(0);

    const clearPlaybackTimers = useCallback(() => {
        if (autoAdvanceTimer.current) {
            clearTimeout(autoAdvanceTimer.current);
            autoAdvanceTimer.current = null;
        }
        if (progressInterval.current) {
            clearInterval(progressInterval.current);
            progressInterval.current = null;
        }
    }, []);

    const cleanScenes = useMemo(() => normalizeScenes(scenes), [scenes]);
    const rawScene = cleanScenes[idx] || null;
    const scene = useMemo(
        () => rawScene,
        [rawScene?.heading, rawScene?.narration, rawScene?.board?.join('\u0001')]
    );
    const totalScenes = cleanScenes.length;
    const hasNarration = !!(scene?.narration && scene.narration.trim().length > 0);

    const advanceToNext = useCallback(() => {
        if (idx < totalScenes - 1) {
            autoAdvanceTimer.current = setTimeout(() => {
                setIdx((current) => current + 1);
                setProgress(0);
                setPlaying(true);
            }, 600);
        } else {
            setProgress(100);
            setPlaying(false);
        }
    }, [idx, totalScenes]);

    useEffect(() => {
        revealedRef.current = 0;
        setRevealed(0);
        setAudioError(false);
    }, [idx]);

    const revealLinesForProgress = useCallback((percentage: number) => {
        const lineCount = scene?.board?.length || 0;
        const target = Math.min(lineCount, Math.max(0, Math.ceil((percentage / 100) * lineCount)));
        if (target <= revealedRef.current) return;

        const firstNewLine = revealedRef.current;
        revealedRef.current = target;
        setRevealed(target);
        for (let lineIndex = firstNewLine; lineIndex < target; lineIndex += 1) {
            const animation = lineAnims.current[lineIndex];
            if (animation) {
                Animated.spring(animation, {
                    toValue: 0,
                    tension: 80,
                    friction: 12,
                    useNativeDriver: true,
                }).start();
            }
        }
    }, [scene?.board?.length]);

    // ---- Reveal board lines one by one with slide animation ----
    useEffect(() => {
        if (!scene) return;
        setRevealed(0);
        setIsLoading(true);
        const board = scene.board || [];
        // Reset animations for all lines
        lineAnims.current = board.map(() => new Animated.Value(-10));
        board.forEach((_, i) => {
            lineAnims.current[i] = new Animated.Value(-10);
        });

        setIsLoading(false);
        if (hasNarration) return;

        let lineIndex = 0;
        const timer = setInterval(() => {
            lineIndex += 1;
            revealLinesForProgress((lineIndex / Math.max(board.length, 1)) * 100);
            if (lineIndex >= board.length) clearInterval(timer);
        }, 400);
        return () => clearInterval(timer);
    }, [idx, scene?.heading, scene?.narration, scene?.board?.join('\u0001'), hasNarration, revealLinesForProgress]);

    // ---- Stop speech on unmount ----
    useEffect(() => {
        return () => {
            playbackGeneration.current += 1;
            Speech.stop();
            clearPlaybackTimers();
        };
    }, [clearPlaybackTimers]);

    // ---- Speak the backend narration for the current scene once ----
    useEffect(() => {
        if (!playing || !scene || !hasNarration || muted || audioError) {
            if (speaking) {
                Speech.stop();
                setSpeaking(false);
            }
            return;
        }

        const speakText = () => {
            const generation = ++playbackGeneration.current;
            clearPlaybackTimers();
            Speech.stop();
            setSpeaking(true);
            const text = scene.narration;

            Speech.speak(text, {
                rate: rate,
                pitch: 1,
                onStart: () => {
                    if (generation !== playbackGeneration.current) return;
                    clearPlaybackTimers();
                    const words = text.trim().split(/\s+/).filter(Boolean).length;
                    const estMs = Math.max(2500, (words / (2.3 * rate)) * 1000);
                    const start = Date.now();
                    progressInterval.current = setInterval(() => {
                        const elapsed = Date.now() - start;
                        const sceneProgress = Math.min(100, (elapsed / estMs) * 100);
                        setProgress(sceneProgress);
                        revealLinesForProgress(sceneProgress);
                    }, 100);
                },
                onDone: () => {
                    if (generation !== playbackGeneration.current) return;
                    setSpeaking(false);
                    clearPlaybackTimers();
                    revealLinesForProgress(100);
                    setProgress(100);
                    advanceToNext();
                },
                onStopped: () => {
                    if (generation !== playbackGeneration.current) return;
                    setSpeaking(false);
                    clearPlaybackTimers();
                },
                onError: () => {
                    if (generation !== playbackGeneration.current) return;
                    setAudioError(true);
                    setSpeaking(false);
                    clearPlaybackTimers();
                    advanceToNext();
                },
            });
        };

        speakText();

        return () => {
            playbackGeneration.current += 1;
            Speech.stop();
            clearPlaybackTimers();
        };
    }, [playing, scene, hasNarration, muted, audioError, rate, advanceToNext, revealLinesForProgress, clearPlaybackTimers]);

    // ---- Silent fallback for mute, missing narration, or speech errors ----
    useEffect(() => {
        if (!playing || !scene || (hasNarration && !muted && !audioError)) return;

        const generation = ++playbackGeneration.current;
        clearPlaybackTimers();

        const words = (scene.narration || scene.board.join(' ')).trim().split(/\s+/).filter(Boolean).length;
        const duration = Math.max(2500, (words / (2.3 * rate)) * 1000);
        const startedAt = Date.now();

        progressInterval.current = setInterval(() => {
            if (generation !== playbackGeneration.current) return;
            const partProgress = Math.min(100, ((Date.now() - startedAt) / duration) * 100);
            setProgress(partProgress);
            revealLinesForProgress(partProgress);
        }, 100);
        autoAdvanceTimer.current = setTimeout(() => {
            if (generation !== playbackGeneration.current) return;
            clearPlaybackTimers();
            setProgress(100);
            revealLinesForProgress(100);
            advanceToNext();
        }, duration);

        return () => {
            playbackGeneration.current += 1;
            clearPlaybackTimers();
        };
    }, [playing, scene, hasNarration, muted, audioError, rate, advanceToNext, revealLinesForProgress, clearPlaybackTimers]);

    // ---- Play/Pause toggle ----
    const togglePlay = () => {
        if (playing) {
            playbackGeneration.current += 1;
            Speech.stop();
            clearPlaybackTimers();
            setPlaying(false);
        } else {
            setPlaying(true);
        }
    };

    // ---- Navigate to scene ----
    const goToScene = (index: number) => {
        if (index < 0 || index >= totalScenes) return;
        Speech.stop();
        playbackGeneration.current += 1;
        clearPlaybackTimers();
        setIdx(index);
        setProgress(0);
        setRevealed(0);
        revealedRef.current = 0;
        setPlaying(true);
    };

    // ---- Restart ----
    const restart = () => {
        Speech.stop();
        playbackGeneration.current += 1;
        clearPlaybackTimers();
        setIdx(0);
        setProgress(0);
        setPlaying(true);
        setRevealed(0);
        revealedRef.current = 0;
    };

    // ---- Speed cycle ----
    const cycleRate = () => {
        const i = RATE_STEPS.indexOf(rate);
        setRate(RATE_STEPS[(i + 1) % RATE_STEPS.length]);
    };

    // ---- Mute toggle ----
    const toggleMute = () => {
        setMuted((current) => !current);
        if (!muted) {
            playbackGeneration.current += 1;
            Speech.stop();
            clearPlaybackTimers();
            setSpeaking(false);
        }
    };

    // ---- Loading state ----
    if (!scene || totalScenes === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.brandPrimary} />
                <Text style={styles.loadingText}>Loading video solution...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Video surface: the solution text and narration stay inside the video. */}
            <View style={styles.surface}>
                <View style={styles.surfaceInner}>
                    {/* Top bar */}
                    <View style={styles.topBar}>
                        <View style={styles.badge}>
                            <Ionicons name="radio" size={12} color="#ef4444" />
                            <Text style={styles.badgeText}>AI SOLUTION</Text>
                        </View>
                        <View style={styles.topBarRight}>
                            <Text style={styles.sceneCounter}>Scene {idx + 1} / {totalScenes}</Text>
                            {onClose && (
                                <Pressable onPress={onClose} style={styles.surfaceCloseBtn}>
                                    <Ionicons name="close" size={18} color="#cbd5e1" />
                                </Pressable>
                            )}
                        </View>
                    </View>

                    {/* Heading */}
                    <Text style={styles.heading}>{scene.heading || `Step ${idx + 1}`}</Text>

                    {/* Board lines – sliding from left, inside the video surface */}
                    <View style={styles.boardContainer}>
                        {(scene.board || []).map((line, i) => (
                            <Animated.View
                                key={i}
                                style={[
                                    styles.boardLine,
                                    {
                                        opacity: i < revealed ? 1 : 0,
                                        transform: [{ translateX: i < revealed ? lineAnims.current[i] || 0 : -10 }],
                                    },
                                ]}
                            >
                                <Text style={styles.boardText}>{line}</Text>
                            </Animated.View>
                        ))}
                    </View>

                    {/* Loading overlay */}
                    {isLoading && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="small" color="#fff" />
                        </View>
                    )}

                    {/* Progress bar on video */}
                    <View style={styles.progressBarContainer}>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
                        </View>
                    </View>

                    {/* Narration status */}
                    {playing && speaking && !muted && (
                        <View style={styles.statusBar}>
                            <Ionicons name="volume-high" size={14} color={theme.brandPrimary} />
                            <Text style={styles.statusText}>Narrating step {idx + 1}...</Text>
                            <Text style={[styles.statusText, styles.progressPercent]}>{Math.round(progress)}%</Text>
                        </View>
                    )}
                    {playing && !speaking && !muted && hasNarration && (
                        <View style={styles.statusBar}>
                            <Ionicons name="timer" size={14} color={theme.muted} />
                            <Text style={styles.statusText}>Waiting to narrate...</Text>
                        </View>
                    )}
                    {muted && (
                        <View style={styles.statusBar}>
                            <Ionicons name="volume-off" size={14} color={theme.muted} />
                            <Text style={styles.statusText}>Narration muted</Text>
                        </View>
                    )}

                    {/* Scene navigation dots on video */}
                    <View style={styles.dotsOverlay}>
                        {cleanScenes.map((_, i) => (
                            <Pressable key={i} onPress={() => goToScene(i)} style={styles.dotWrapper}>
                                <View style={[styles.dot, i === idx ? styles.dotActive : i < idx ? styles.dotCompleted : styles.dotInactive]} />
                            </Pressable>
                        ))}
                    </View>
                </View>
            </View>

            {/* Controls (identical to web layout) */}
            <View style={styles.controls}>
                <View style={styles.controlsRow}>
                    <Pressable
                        onPress={() => goToScene(idx - 1)}
                        disabled={idx === 0}
                        style={({ pressed }) => [
                            styles.controlButton,
                            idx === 0 && styles.controlButtonDisabled,
                            pressed && styles.controlButtonPressed,
                        ]}
                    >
                        <Ionicons name="play-skip-back" size={20} color={idx === 0 ? theme.muted : theme.onSurface} />
                    </Pressable>

                    <Pressable
                        onPress={togglePlay}
                        style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
                    >
                        <Ionicons name={playing ? 'pause' : 'play'} size={24} color="#fff" />
                    </Pressable>

                    <Pressable
                        onPress={() => goToScene(idx + 1)}
                        disabled={idx === totalScenes - 1}
                        style={({ pressed }) => [
                            styles.controlButton,
                            idx === totalScenes - 1 && styles.controlButtonDisabled,
                            pressed && styles.controlButtonPressed,
                        ]}
                    >
                        <Ionicons name="play-skip-forward" size={20} color={idx === totalScenes - 1 ? theme.muted : theme.onSurface} />
                    </Pressable>

                    <Pressable
                        onPress={restart}
                        style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
                    >
                        <Ionicons name="refresh" size={20} color={theme.onSurface} />
                    </Pressable>

                    <Pressable
                        onPress={toggleMute}
                        style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
                    >
                        <Ionicons name={muted ? 'volume-off' : 'volume-high'} size={20} color={theme.onSurface} />
                    </Pressable>

                    <Pressable
                        onPress={cycleRate}
                        style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
                    >
                        <Text style={styles.rateText}>{rate}x</Text>
                    </Pressable>


                </View>

                {/* Generic progress bar (web uses same for tts/timer) */}
                <View style={styles.progressBarBottom}>
                    <View style={styles.progressBarTrack}>
                        <View style={[styles.progressFillBottom, { width: `${Math.min(progress, 100)}%` }]} />
                    </View>
                </View>

                {/* Scene labels (start / end) */}
                <View style={styles.sceneLabels}>
                    <Text style={styles.labelText}>Start</Text>
                    <Text style={[styles.labelText, styles.labelCenter]}>{idx + 1} of {totalScenes}</Text>
                    <Text style={styles.labelText}>End</Text>
                </View>

                {/* Question */}
                {question && (
                    <View style={styles.questionContainer}>
                        <Text style={styles.questionLabel}>Q:</Text>
                        <Text style={styles.questionText} numberOfLines={2}>{question}</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
        ...shadow1,
        marginHorizontal: spacing.md,
    },
    loadingContainer: {
        padding: spacing.lg,
        alignItems: 'center',
        gap: 8,
    },
    loadingText: { color: theme.onSurfaceMuted },
    surface: {
        backgroundColor: '#0A192F',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
        minHeight: 330,
        position: 'relative',
    },
    surfaceInner: {
        flex: 1,
        minHeight: 300,
        position: 'relative',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    surfaceCloseBtn: { padding: 2 },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(239,68,68,0.8)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
    sceneCounter: { color: '#94a3b8', fontSize: 10 },
    heading: {
        color: '#93c5fd',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    boardContainer: {
        flex: 1,
        maxHeight: '72%',
        marginBottom: 8,
    },
    boardLine: {
        marginBottom: 6,
    },
    boardText: {
        color: '#e2e8f0',
        fontSize: 14,
        lineHeight: 20,
    },
    loadingOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captionsContainer: {
        position: 'absolute',
        bottom: 52,
        left: 12,
        right: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 8,
    },
    captionsText: {
        color: '#f1f5f9',
        fontSize: 13,
        textAlign: 'center',
    },
    progressBarContainer: {
        position: 'absolute',
        bottom: 24,
        left: 12,
        right: 12,
    },
    progressBar: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.brandPrimary,
    },
    statusBar: {
        position: 'absolute',
        bottom: 32,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusText: { color: '#94a3b8', fontSize: 10 },
    progressPercent: { marginLeft: 'auto', marginRight: 12 },
    dotsOverlay: {
        position: 'absolute',
        bottom: 10,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    dotWrapper: { padding: 4 },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    dotActive: { backgroundColor: theme.brandPrimary, width: 12 },
    dotCompleted: { backgroundColor: theme.brandPrimary, opacity: 0.4 },
    dotInactive: { backgroundColor: '#94a3b8' },
    controls: {
        paddingHorizontal: spacing.sm,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
        gap: 6,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        flexWrap: 'nowrap',
    },
    controlButton: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.border,
    },
    controlButtonDisabled: { opacity: 0.3 },
    controlButtonPressed: { opacity: 0.7 },
    playButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.brandPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow1,
    },
    playButtonPressed: { opacity: 0.8 },
    rateText: { fontSize: 13, fontWeight: '600', color: theme.onSurface },
    activeControl: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
    progressBarBottom: {
        marginTop: 4,
        height: 3,
        backgroundColor: theme.surfaceTertiary,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFillBottom: {
        height: '100%',
        backgroundColor: theme.brandPrimary,
    },
    sceneLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    labelText: { fontSize: 9, color: theme.onSurfaceMuted, opacity: 0.5 },
    labelCenter: { color: theme.brandPrimary, opacity: 0.6 },
    questionContainer: {
        flexDirection: 'row',
        gap: 6,
        backgroundColor: theme.surface,
        padding: 8,
        borderRadius: radii.sm,
        borderWidth: 1,
        borderColor: theme.border,
        marginTop: 4,
    },
    questionLabel: { fontWeight: '700', color: theme.onSurface, fontSize: 13 },
    questionText: { flex: 1, color: theme.onSurfaceMuted, fontSize: 12 },
});