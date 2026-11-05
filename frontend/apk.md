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

Running "npm ci --include=dev" in /home/expo/workingdir/build/frontend directory
npm error code EUSAGE
npm error
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.
npm error
npm error Invalid: lock file's ws@7.5.13 does not satisfy ws@8.22.1
npm error Missing: ws@7.5.13 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error Missing: @react-native/metro-config@0.88.1 from lock file
npm error Missing: @react-native/js-polyfills@0.88.1 from lock file
npm error Missing: @react-native/metro-babel-transformer@0.88.1 from lock file
npm error Missing: @react-native/babel-preset@0.88.1 from lock file
npm error Missing: @babel/plugin-transform-react-jsx-self@7.29.7 from lock file
npm error Missing: @babel/plugin-transform-react-jsx-source@7.29.7 from lock file
npm error Missing: @babel/plugin-transform-regenerator@7.29.8 from lock file
npm error Missing: @react-native/babel-plugin-codegen@0.88.1 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error
npm error Clean install a project
npm error
npm error Usage:
npm error npm ci
npm error
npm error Options:
npm error [--install-strategy <hoisted|nested|shallow|linked>] [--legacy-bundling]
npm error [--global-style] [--omit <dev|optional|peer> [--omit <dev|optional|peer> ...]]
npm error [--include <prod|dev|optional|peer> [--include <prod|dev|optional|peer> ...]]
npm error [--strict-peer-deps] [--foreground-scripts] [--ignore-scripts] [--no-audit]
npm error [--no-bin-links] [--no-fund] [--dry-run]
npm error [-w|--workspace <workspace-name></workspace> [-w|--workspace <workspace-name></workspace> ...]]
npm error [-ws|--workspaces] [--include-workspace-root] [--install-links]
npm error
npm error aliases: clean-install, ic, install-clean, isntall-clean
npm error
npm error Run "npm help ci" for more info
npm error A complete log of this run can be found in: /home/expo/.npm/_logs/2026-11-05T04_15_12_155Z-debug-0.log
npm ci --include=dev exited with non-zero code: 1eas build --platform android --profile productioRunning "npm ci --include=dev" in /home/expo/workingdir/build/frontend directory
npm error code EUSAGE
npm error
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.
npm error
npm error Invalid: lock file's ws@7.5.13 does not satisfy ws@8.22.1
npm error Missing: ws@7.5.13 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error Missing: @react-native/metro-config@0.88.1 from lock file
npm error Missing: @react-native/js-polyfills@0.88.1 from lock file
npm error Missing: @react-native/metro-babel-transformer@0.88.1 from lock file
npm error Missing: @react-native/babel-preset@0.88.1 from lock file
npm error Missing: @babel/plugin-transform-react-jsx-self@7.29.7 from lock file
npm error Missing: @babel/plugin-transform-react-jsx-source@7.29.7 from lock file
npm error Missing: @babel/plugin-transform-regenerator@7.29.8 from lock file
npm error Missing: @react-native/babel-plugin-codegen@0.88.1 from lock file
npm error Missing: ws@7.5.13 from lock file
npm error
npm error Clean install a project
npm error
npm error Usage:
npm error npm ci
npm error
npm error Options:
npm error [--install-strategy <hoisted|nested|shallow|linked>] [--legacy-bundling]
npm error [--global-style] [--omit <dev|optional|peer> [--omit <dev|optional|peer> ...]]
npm error [--include <prod|dev|optional|peer> [--include <prod|dev|optional|peer> ...]]
npm error [--strict-peer-deps] [--foreground-scripts] [--ignore-scripts] [--no-audit]
npm error [--no-bin-links] [--no-fund] [--dry-run]
npm error [-w|--workspace <workspace-name></workspace> [-w|--workspace <workspace-name></workspace> ...]]
npm error [-ws|--workspaces] [--include-workspace-root] [--install-links]
npm error
npm error aliases: clean-install, ic, install-clean, isntall-clean
npm error
npm error Run "npm help ci" for more info
npm error A complete log of this run can be found in: /home/expo/.npm/_logs/2026-11-05T04_15_12_155Z-debug-0.log
npm ci --include=dev exited with non-zero code: 1

eas build:list

`adb logcat *:E | Select-String "gcsharp"`

adb logcat -c
adb logcat AndroidRuntime:E *:S > crash_full.txt

Get-Content crash_full.txt
