// components/StreakCelebration.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Animated, Dimensions, Pressable, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { theme } from '@/src/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const FLOWER_EMOJIS = ['🌸', '🌼', '🌷', '💐', '🌻', '✨'];
const CONGRATS_LINES = [
    "Streak complete! You're on fire.",
    'Another day, another streak. Amazing work!',
    'Goal smashed! Keep that streak alive.',
    'You showed up today. Nicely done.',
    'Streak secured! See you tomorrow.',
];

type Particle = {
    id: number;
    left: number;
    emoji: string;
    delay: number;
    duration: number;
    driftX: number;
    size: number;
    rotateTo: string;
};

function buildParticles(seed: number): Particle[] {
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    return Array.from({ length: 22 }).map((_, i) => ({
        id: seed * 1000 + i,
        left: rand(0, Math.max(0, SCREEN_W - 28)),
        emoji: FLOWER_EMOJIS[Math.floor(Math.random() * FLOWER_EMOJIS.length)],
        delay: rand(0, 500),
        duration: rand(2200, 3600),
        driftX: rand(-40, 40),
        size: rand(18, 30),
        rotateTo: `${Math.round(rand(-140, 140))}deg`,
    }));
}

type Props = {
    visible: boolean;
    streak?: number;
    onDismiss: () => void;
    autoDismissMs?: number;
};

export function StreakCelebration({ visible, streak, onDismiss, autoDismissMs = 3800 }: Props) {
    const seedRef = useRef(0);
    const particles = useMemo(() => {
        if (!visible) return [];
        seedRef.current += 1;
        return buildParticles(seedRef.current);
    }, [visible]);

    const anims = useRef<Animated.Value[]>([]);
    const bannerScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;

        anims.current = particles.map(() => new Animated.Value(0));
        const fall = particles.map((p, i) =>
            Animated.timing(anims.current[i], {
                toValue: 1,
                duration: p.duration,
                delay: p.delay,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        Animated.parallel(fall).start();

        bannerScale.setValue(0);
        Animated.spring(bannerScale, {
            toValue: 1,
            tension: 120,
            friction: 8,
            useNativeDriver: true,
        }).start();

        // "Sound" here is a spoken congratulations via the TTS engine already
        // used elsewhere in the app (VideoSolutionPlayer, solution playback),
        // so no new audio asset/dependency is required.
        const line = CONGRATS_LINES[Math.floor(Math.random() * CONGRATS_LINES.length)];
        Speech.stop();
        Speech.speak(line, { rate: 1, pitch: 1.1 });

        const timer = setTimeout(onDismiss, autoDismissMs);
        return () => {
            clearTimeout(timer);
            Speech.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
            <Pressable style={styles.backdrop} onPress={onDismiss}>
                {particles.map((p, i) => {
                    const anim = anims.current[i];
                    if (!anim) return null;
                    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-40, SCREEN_H + 40] });
                    const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftX] });
                    const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.rotateTo] });
                    const opacity = anim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
                    return (
                        <Animated.Text
                            key={p.id}
                            style={[
                                styles.particle,
                                {
                                    left: p.left,
                                    fontSize: p.size,
                                    opacity,
                                    transform: [{ translateY }, { translateX }, { rotate }],
                                },
                            ]}
                        >
                            {p.emoji}
                        </Animated.Text>
                    );
                })}

                <Animated.View style={[styles.banner, { transform: [{ scale: bannerScale }] }]}>
                    <Ionicons name="flame" size={28} color={theme.warning} />
                    <Text style={styles.bannerTitle}>Streak complete!</Text>
                    {typeof streak === 'number' && (
                        <Text style={styles.bannerSub}>{streak} day{streak === 1 ? '' : 's'} strong 🔥</Text>
                    )}
                    <Pressable style={styles.dismissBtn} onPress={onDismiss}>
                        <Text style={styles.dismissTxt}>Nice!</Text>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
    particle: { position: 'absolute', top: 0 },
    banner: {
        position: 'absolute',
        top: '38%',
        alignSelf: 'center',
        backgroundColor: '#fff',
        borderRadius: 20,
        paddingHorizontal: 28,
        paddingVertical: 22,
        alignItems: 'center',
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    bannerTitle: { fontSize: 18, fontWeight: '800', color: theme.onSurface, marginTop: 4 },
    bannerSub: { fontSize: 13, color: theme.onSurfaceMuted },
    dismissBtn: {
        marginTop: 10,
        backgroundColor: theme.brandPrimary,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 999,
    },
    dismissTxt: { color: '#fff', fontWeight: '700' },
});