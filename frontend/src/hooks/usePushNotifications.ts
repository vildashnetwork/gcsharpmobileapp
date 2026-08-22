// hooks/usePushNotifications.ts
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/src/api';

// Configure notification handler (foreground)
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export function usePushNotifications() {
    const notificationListener = useRef<Notifications.Subscription>();
    const responseListener = useRef<Notifications.Subscription>();

    const registerForPushNotifications = async () => {
        if (!Device.isDevice) {
            console.log('Must use physical device for push notifications');
            return;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return;
        }

        // Get the Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;

        // Send token to backend
        try {
            await api.post('/notifications/register-push-token', { token });
            console.log('Push token registered:', token);
        } catch (error) {
            console.error('Failed to register push token:', error);
        }

        // Android requires a channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }
    };

    useEffect(() => {
        registerForPushNotifications();

        // Listener for notifications received while app is foreground
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('Notification received in foreground:', notification);
        });

        // Listener for when user taps on notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('Notification tapped:', response);
            // Navigate to relevant screen if needed
        });

        return () => {
            if (notificationListener.current) {
                Notifications.removeNotificationSubscription(notificationListener.current);
            }
            if (responseListener.current) {
                Notifications.removeNotificationSubscription(responseListener.current);
            }
        };
    }, []);
}