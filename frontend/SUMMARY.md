# Issue Summary: "Cannot find native module 'ExpoTopicSubscriptionModule'"

## Root Cause
The Expo app crashes at runtime with error: "Cannot find native module 'ExpoTopicSubscriptionModule'". This occurs when the app tries to require a native module that doesn't exist or isn't properly linked in the Expo Go environment.

## Analysis
- **Project**: GCSHARP mobile app (React Native + Expo with expo-router)
- **Error location**: Runtime, when app attempts to load native module
- **Error persistence**: Occurs "even after clearing Expo cache" 
- **Module name**: `ExpoTopicSubscriptionModule` - doesn't match any configured plugin in `app.json`

### Key Findings
1. **File structure**: App uses `expo-router` for file-based routing (`app/` directory with screen components)
2. **Existing pattern**: `src/hooks/useGcVoice.ts` (lines 31-37) has graceful try-catch handling for missing native modules
3. **app.json configuration**: Includes `expo-speech-recognition` and `expo-router` plugins, but no reference to the failing module
4. **Error timing**: Occurs after Metro bundler starts and QR code displays, meaning core app works but fails when specific feature/screen is accessed

## Recommended Fix
Apply the same graceful import pattern from `useGcVoice.ts` at the point where the module is required:

```typescript
// Graceful import - prevents crash when module unavailable (e.g., in Expo Go)
let ExpoTopicSubscriptionModule: any = null;
try {
  const mod = require('expo-topic-subscription-or-appropriate-package');
  ExpoTopicSubscriptionModule = mod?.ExpoTopicSubscriptionModule;
} catch {
  // Module not available - safely skip, use fallback
}

// Conditional usage
if (ExpoTopicSubscriptionModule) {
  // Use native module functionality
} else {
  // Fall back to alternative: server-side processing, simplified UI, etc.
}
```

## Alternative Solutions
1. **Development build**: Run `expo run:android` or `expo run:ios` for full native module access
2. **Identify dependency**: Find which package requires this module and ensure proper installation/linking
3. **Remove non-essential dependency**: If functionality isn't critical, remove and use alternatives

## Status
The app's core functionality works (Metro server starts, QR code displays). The error occurs when navigating to specific screens/features that require this native module.