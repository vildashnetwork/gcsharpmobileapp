// // hooks/usePushNotifications.ts
// import { useEffect, useRef } from 'react';
// import Constants from 'expo-constants';
// import { Platform } from 'react-native';

// export function usePushNotifications() {
//     const notificationListener = useRef<any>(null);
//     const responseListener = useRef<any>(null);

//     useEffect(() => {
//         const setup = async () => {
//             // If running in Expo Go, skip all push setup
//             if (Constants.executionEnvironment === 'storeClient') {
//                 console.warn(
//                     'Expo Go does not support remote push notifications (SDK 53+). ' +
//                     'Push notifications will be disabled in this environment.'
//                 );
//                 return;
//             }

//             // Dynamically import expo-notifications and expo-device
//             const Notifications = await import('expo-notifications');
//             const Device = await import('expo-device');

//             // Configure foreground handler
//             Notifications.setNotificationHandler({
//                 handleNotification: async () => ({
//                     shouldShowAlert: true,
//                     shouldPlaySound: true,
//                     shouldSetBadge: true,
//                 }),
//             });

//             // Check if device is physical
//             if (!Device.default.isDevice) {
//                 console.log('Must use physical device for push notifications');
//                 return;
//             }

//             // Request permissions
//             const { status: existingStatus } = await Notifications.getPermissionsAsync();
//             let finalStatus = existingStatus;
//             if (existingStatus !== 'granted') {
//                 const { status } = await Notifications.requestPermissionsAsync();
//                 finalStatus = status;
//             }
//             if (finalStatus !== 'granted') {
//                 console.log('Failed to get push token for push notification!');
//                 return;
//             }

//             // Get Expo push token
//             const tokenData = await Notifications.getExpoPushTokenAsync();
//             const token = tokenData.data;

//             // Register token with backend
//             try {
//                 const { api } = await import('@/src/api');
//                 await api.post('/notifications/register-push-token', { token });
//                 console.log('Push token registered:', token);
//             } catch (error) {
//                 console.error('Failed to register push token:', error);
//             }

//             // Android channel
//             if (Platform.OS === 'android') {
//                 await Notifications.setNotificationChannelAsync('default', {
//                     name: 'default',
//                     importance: Notifications.AndroidImportance.MAX,
//                     vibrationPattern: [0, 250, 250, 250],
//                     lightColor: '#FF231F7C',
//                 });
//             }

//             // Listeners
//             notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
//                 console.log('Notification received in foreground:', notification);
//             });

//             responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
//                 console.log('Notification tapped:', response);
//                 // You can navigate based on response.notification.request.content.data
//             });
//         };

//         setup();

//         return () => {
//             // Clean up listeners
//             if (notificationListener.current) {
//                 notificationListener.current.remove();
//             }
//             if (responseListener.current) {
//                 responseListener.current.remove();
//             }
//         };
//     }, []);
// }
















// hooks/usePushNotifications.ts
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from '@/src/api';

// Configure the handler for notifications received while the app is in the foreground
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

    useEffect(() => {
        const setup = async () => {
            // Detect Expo Go – remote push is not supported
            if (Constants.executionEnvironment === 'storeClient') {
                console.warn(
                    '⚠️ Expo Go does not support remote push notifications (SDK 53+). ' +
                    'Push notifications will be disabled. Use a development build.'
                );
                return;
            }

            // Must be on a physical device
            if (!Device.isDevice) {
                console.log('📱 Push notifications require a physical device.');
                return;
            }

            // Request permissions
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.log('❌ Push permission denied.');
                return;
            }

            // Get Expo push token
            try {
                const tokenData = await Notifications.getExpoPushTokenAsync();
                const token = tokenData.data;
                console.log('✅ Expo push token:', token);

                // Send token to backend
                const response = await api.post('/notifications/register-push-token', { token });
                console.log('✅ Token registered with backend:', response.data);
            } catch (error) {
                console.error('❌ Failed to register push token:', error);
            }

            // Android channel
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF231F7C',
                });
            }

            // Listen for notifications received while app is in foreground
            notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
                console.log('📩 Foreground notification:', notification);
            });

            // Listen for user tapping on a notification
            responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
                console.log('🔔 Notification tapped:', response);
                // Navigate based on response.notification.request.content.data.link
            });
        };

        setup();

        // Clean up listeners on unmount
        return () => {
            if (notificationListener.current) {
                Notifications.removeNotificationSubscription(notificationListener.current);
            }
            if (responseListener.current) {
                Notifications.removeNotificationSubscription(responseListener.current);
            }
        };
    }, []); // Runs once on mount
}