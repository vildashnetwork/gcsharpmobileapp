
# 1. Install EAS CLI globally if not installed

npm install -g eas-cli

# 2. Login to your Expo account (create one if you don't have)

eas login

# 3. Configure EAS (first time only)

eas build:configure

# 4. Build APK for Android

eas build --platform android --profile preview

# 5. Or build for production

eas build --platform android
