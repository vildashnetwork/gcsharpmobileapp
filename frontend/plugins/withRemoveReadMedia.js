/**
 * Custom Expo config plugin — strips broad media-storage permissions from the
 * FINAL merged Android manifest.
 *
 * IMPORTANT: Expo config plugins run BEFORE Gradle. Simply filtering
 * <uses-permission> entries here only edits the app manifest — permissions
 * declared inside LIBRARY manifests (e.g. expo-image-picker's
 * READ_MEDIA_IMAGES) are merged later by Gradle's manifest merger and would
 * survive the filter. That is exactly why versions 10/11/12 kept getting
 * flagged by Google Play.
 *
 * The reliable fix is a manifest-merger directive in the app manifest:
 *   <uses-permission android:name="..." tools:node="remove" />
 * During the Gradle merge, any <uses-permission> with a matching name coming
 * from ANY library manifest is dropped, and the directive itself is consumed
 * (it never appears in the final binary).
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const FORBIDDEN = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
  "android.permission.READ_EXTERNAL_STORAGE",
];

const TAGS = ["uses-permission", "uses-permission-sdk-23"];

module.exports = function withRemoveReadMedia(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest) return config;

    // Ensure xmlns:tools is declared so the merger understands tools:node.
    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    // Drop any broad media permission already present in the app manifest.
    for (const tag of TAGS) {
      if (Array.isArray(manifest[tag])) {
        manifest[tag] = manifest[tag].filter((p) => {
          const name = (p && p.$ && p.$["android:name"]) || "";
          return !FORBIDDEN.includes(name);
        });
      }
    }

    // Add merge directives so Gradle removes these from ALL library
    // manifests during the merge (the step config plugins can't touch).
    if (!Array.isArray(manifest["uses-permission"])) {
      manifest["uses-permission"] = [];
    }
    for (const name of FORBIDDEN) {
      manifest["uses-permission"].push({
        $: { "android:name": name, "tools:node": "remove" },
      });
    }

    return config;
  });
};

