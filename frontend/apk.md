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

[expo.dev/accounts/gcsharp/projects/GCSHARP/builds/ef7786e3-91e6-4664-ba1c-8f0b40dc488f](https://expo.dev/accounts/gcsharp/projects/GCSHARP/builds/ef7786e3-91e6-4664-ba1c-8f0b40dc488f)

eas build --platform android --android-app-bundle --profile production

eas build --platform android --profile production --output aabnpx  expo prebuild -p android
