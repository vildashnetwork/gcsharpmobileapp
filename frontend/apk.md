# 1. Install EAS CLI globally if not installed

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

eas build --platform android --android-app-bundle --profile production

eas build --platform android --profile production --output aab

npx  expo prebuild -p android

npm run android

eas build:list

`adb logcat *:E | Select-String "gcsharp"`

adb logcat -c
adb logcat AndroidRuntime:E *:S > crash_full.txt

Get-Content crash_full.txt
