# 1. Install EAS CLI globally if not installed

## ⚠️ Google Play photo/video permission policy (Android)

The app MUST NOT request `READ_MEDIA_IMAGES` or `READ_MEDIA_VIDEO` (Google
removed these under its Android 13+/API 33+ policy). Photo picking already
uses the Android system picker via `expo-image-picker`
(`launchImageLibraryAsync` / `launchCameraAsync`), which needs NO media
storage permission.

Verified Android permission surface for the current build (app.json +
Expo plugin merge at SDK 57):

- android.permission.RECORD_AUDIO
- android.permission.MODIFY_AUDIO_SETTINGS
- android.permission.READ_EXTERNAL_STORAGE
- android.permission.WRITE_EXTERNAL_STORAGE
- android.permission.INTERNET
- android.permission.POST_NOTIFICATIONS
- android.permission.FOREGROUND_SERVICE
- android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK
- android.permission.FOREGROUND_SERVICE_MICROPHONE

No `READ_MEDIA_*` entry is ever added by app.json or any installed Expo
plugin — keep it that way. After building, confirm the APK manifest has no
photo/video permissions before submitting to the Play Console, and keep the
"Photo and video permissions" section of every Play track cleared.

expo-file-system

@react-native-community/netinfo

npm install -g eas-cli

# 2. Login to your Expo account (create one if you don't have)

eas login

# 3. Configure EAS (first time only)

eas build:configure

# 4. Build APK for Androidart

# 5. Or build for production

eas build --platform android

eas build --platform android --android-app-bundle --profile production;; --output aab

npx  expo prebuild -p android

npm run android

eas build:list

`adb logcat *:E | Select-String "gcsharp"`

adb logcat -c
adb logcat AndroidRuntime:E *:S > crash_full.txt

Get-Content crash_full.txt
