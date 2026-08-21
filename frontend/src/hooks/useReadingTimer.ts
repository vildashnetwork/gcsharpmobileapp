// hooks/useReadingTimer.ts
import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { api } from '@/src/api';

const SAVE_INTERVAL = 5000;

export function useReadingTimer(paperId: string | undefined) {
    const [displaySeconds, setDisplaySeconds] = useState(0);
    const unsavedRef = useRef(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isActive = useRef(true);
    const isFocused = useIsFocused();

    // Load initial reading time
    useEffect(() => {
        if (!paperId) return;
        api<{ total_seconds?: number }>(`/papers/${paperId}/reading-time`)
            .then((data) => setDisplaySeconds(data.total_seconds || 0))
            .catch(() => { });
    }, [paperId]);

    // Main timer logic
    useEffect(() => {
        if (!paperId) return;

        // Save function using current refs
        const saveSeconds = async (force = false) => {
            const seconds = unsavedRef.current;
            if (seconds <= 0 && !force) return;
            unsavedRef.current = 0;
            try {
                await api(`/papers/${paperId}/reading-time`, {
                    method: 'POST',
                    body: { seconds },
                });
            } catch {
                // Rollback on failure
                unsavedRef.current += seconds;
            }
        };

        // Tick function – increments every second
        const tick = () => {
            if (isActive.current && isFocused) {
                unsavedRef.current += 1;
                setDisplaySeconds(prev => prev + 1);
            }
        };

        // App state change handler
        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState === 'background') {
                isActive.current = false;
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                saveSeconds(true);
            } else if (nextAppState === 'active') {
                isActive.current = true;
                if (!intervalRef.current && isFocused) {
                    intervalRef.current = setInterval(tick, 1000);
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Start timer if focused and active
        if (isFocused && AppState.currentState === 'active') {
            isActive.current = true;
            intervalRef.current = setInterval(tick, 1000);
        } else {
            isActive.current = false;
        }

        // Periodic save every 5 seconds
        saveIntervalRef.current = setInterval(() => {
            if (isActive.current && isFocused) {
                saveSeconds();
            }
        }, SAVE_INTERVAL);

        // Cleanup
        return () => {
            subscription.remove();
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
            saveSeconds(true);
        };
    }, [paperId, isFocused]); // re-run when paperId or focus changes

    return { displaySeconds };
}