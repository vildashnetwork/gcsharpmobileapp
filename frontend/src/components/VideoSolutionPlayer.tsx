// components/VideoSolutionPlayer.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

    const progressAnim = useRef(new Animated.Value(0)).current;
    const autoAdvanceTimer = useRef<NodeJS.Timeout | null>(null);
    const progressInterval = useRef<NodeJS.Timeout | null>(null);

    const scene = scenes?.[idx] || null;
    const totalScenes = scenes?.length || 0;
    const hasNarration = !!(scene?.narration && scene.narration.trim().length > 0);

    // Reveal board lines one by one
    useEffect(() => {
        if (!scene) return;
        setRevealed(0);
        setIsLoading(true);
        const board = scene.board || [];
        let i = 0;
        const timer = setInterval(() => {
            i += 1;
            setRevealed((r) => Math.min(board.length, r + 1));
            if (i >= board.length) {
                clearInterval(timer);
                setIsLoading(false);
            }
        }, 400);
        return () => clearInterval(timer);
    }, [idx, scene]);

    // Stop speech on unmount
    useEffect(() => {
        return () => {
            Speech.stop();
            if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
            if (progressInterval.current) clearInterval(progressInterval.current);
        };
    }, []);

    // Speak narration when playing and scene changes
    useEffect(() => {
        if (!playing || !scene || !hasNarration || muted) {
            if (speaking) {
                Speech.stop();
                setSpeaking(false);
            }
            return;
        }

        const speakText = () => {
            Speech.stop();
            setSpeaking(true);
            setProgress(0);
            const text = scene.narration;
            Speech.speak(text, {
                rate: rate,
                pitch: 1,
                onStart: () => {
                    // start progress simulation
                    if (progressInterval.current) clearInterval(progressInterval.current);
                    const words = text.trim().split(/\s+/).length;
                    const estMs = Math.max(2500, (words / (2.3 * rate)) * 1000);
                    const start = Date.now();
                    progressInterval.current = setInterval(() => {
                        const elapsed = Date.now() - start;
                        const pct = Math.min(100, (elapsed / estMs) * 100);
                        setProgress(pct);
                    }, 100);
                },
                onDone: () => {
                    setSpeaking(false);
                    setProgress(100);
                    if (progressInterval.current) clearInterval(progressInterval.current);
                    // Auto-advance after a short pause
                    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
                    autoAdvanceTimer.current = setTimeout(() => {
                        if (idx < totalScenes - 1) {
                            setIdx(idx + 1);
                            setProgress(0);
                        } else {
                            setPlaying(false);
                        }
                    }, 600);
                },
                onStopped: () => {
                    setSpeaking(false);
                    if (progressInterval.current) clearInterval(progressInterval.current);
                },
                onError: () => {
                    setAudioError(true);
                    setSpeaking(false);
                    if (progressInterval.current) clearInterval(progressInterval.current);
                },
            });
        };

        speakText();

        return () => {
            Speech.stop();
            if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
            if (progressInterval.current) clearInterval(progressInterval.current);
        };
    }, [playing, idx, scene, hasNarration, muted, rate]);

    // Toggle play/pause
    const togglePlay = () => {
        if (playing) {
            Speech.stop();
            setPlaying(false);
        } else {
            setPlaying(true);
        }
    };

    const goToScene = (index: number) => {
        if (index < 0 || index >= totalScenes) return;
        Speech.stop();
        if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
        if (progressInterval.current) clearInterval(progressInterval.current);
        setIdx(index);
        setProgress(0);
        setRevealed(0);
        setPlaying(true);
    };

    const restart = () => {
        Speech.stop();
        if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
        if (progressInterval.current) clearInterval(progressInterval.current);
        setIdx(0);
        setProgress(0);
        setPlaying(true);
        setRevealed(0);
    };

    const cycleRate = () => {
        const i = RATE_STEPS.indexOf(rate);
        setRate(RATE_STEPS[(i + 1) % RATE_STEPS.length]);
    };

    const toggleMute = () => {
        setMuted(!muted);
        if (!muted) {
            // If muting, stop speech
            Speech.stop();
            setSpeaking(false);
        } else {
            // Unmuting: if playing, resume speech
            if (playing && scene && hasNarration) {
                // will be handled by useEffect
            }
        }
    };

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
            {/* Header with close button */}
            <View style={styles.header}>
                <Text style={styles.title}>{title || 'Video Solution'}</Text>
                {onClose && (
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={24} color={theme.onSurface} />
                    </Pressable>
                )}
            </View>

            {/* Video surface */}
            <View style={styles.surface}>
                <View style={styles.surfaceInner}>
                    {/* Scene indicator */}
                    <View style={styles.topBar}>
                        <View style={styles.badge}>
                            <Ionicons name="radio" size={12} color="#ef4444" />
                            <Text style={styles.badgeText}>AI SOLUTION</Text>
                        </View>
                        <Text style={styles.sceneCounter}>Scene {idx + 1} / {totalScenes}</Text>
                    </View>

                    {/* Heading */}
                    <Text style={styles.heading}>{scene.heading || `Step ${idx + 1}`}</Text>

                    {/* Board lines with reveal */}
                    <ScrollView style={styles.boardContainer} showsVerticalScrollIndicator={false}>
                        {(scene.board || []).map((line, i) => (
                            <Animated.View
                                key={i}
                                style={[
                                    styles.boardLine,
                                    {
                                        opacity: i < revealed ? 1 : 0,
                                        transform: [{ translateX: i < revealed ? 0 : -10 }],
                                    },
                                ]}
                            >
                                <Text style={styles.boardText}>{line}</Text>
                            </Animated.View>
                        ))}
                    </ScrollView>

                    {/* Loading overlay during reveal */}
                    {isLoading && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="small" color="#fff" />
                        </View>
                    )}

                    {/* Captions */}
                    {showCaptions && hasNarration && (
                        <View style={styles.captionsContainer}>
                            <Text style={styles.captionsText}>{scene.narration}</Text>
                        </View>
                    )}

                    {/* Progress bar */}
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
                </View>
            </View>

            {/* Controls */}
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

                    <Pressable
                        onPress={() => setShowCaptions(!showCaptions)}
                        style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed, showCaptions && styles.activeControl]}
                    >
                        <Ionicons name="text" size={20} color={showCaptions ? theme.brandPrimary : theme.onSurface} />
                    </Pressable>
                </View>

                {/* Scene dots */}
                <View style={styles.dotsContainer}>
                    {scenes.map((_, i) => (
                        <Pressable key={i} onPress={() => goToScene(i)} style={styles.dotWrapper}>
                            <View style={[styles.dot, i === idx ? styles.dotActive : i < idx ? styles.dotCompleted : styles.dotInactive]} />
                        </Pressable>
                    ))}
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
    },
    loadingContainer: {
        padding: spacing.lg,
        alignItems: 'center',
        gap: 8,
    },
    loadingText: { color: theme.onSurfaceMuted },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    title: { fontSize: 16, fontWeight: '700', color: theme.onSurface },
    closeBtn: { padding: 4 },
    surface: {
        backgroundColor: '#0A192F',
        padding: spacing.md,
        minHeight: 280,
    },
    surfaceInner: {
        flex: 1,
        position: 'relative',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
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
        maxHeight: 150,
    },
    boardLine: {
        marginBottom: 6,
    },
    boardText: {
        color: '#e2e8f0',
        fontSize: 14,
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
        bottom: 40,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingVertical: 6,
        borderRadius: 8,
        marginHorizontal: 8,
    },
    captionsText: {
        color: '#f1f5f9',
        fontSize: 13,
        textAlign: 'center',
    },
    progressBarContainer: {
        position: 'absolute',
        bottom: 20,
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
        bottom: 28,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusText: { color: '#94a3b8', fontSize: 10 },
    controls: {
        padding: spacing.md,
        gap: 8,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    controlButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
    dotsContainer: {
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
    dotInactive: { backgroundColor: theme.border },
    questionContainer: {
        flexDirection: 'row',
        gap: 6,
        backgroundColor: theme.surface,
        padding: 8,
        borderRadius: radii.sm,
        borderWidth: 1,
        borderColor: theme.border,
    },
    questionLabel: { fontWeight: '700', color: theme.onSurface, fontSize: 13 },
    questionText: { flex: 1, color: theme.onSurfaceMuted, fontSize: 12 },
});