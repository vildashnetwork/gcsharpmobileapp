/**
 * Media for a feed post: single image, swipeable image carousel and videos.
 * Tap any image or video to open a full-screen viewer:
 *  - pinch to zoom (images and videos), drag to pan when zoomed
 *  - double-tap an image to zoom in/out at the tapped point
 *  - swipe left/right to move between a post's photos and videos
 *  - swipe down (when not zoomed) to close
 *
 * Needs: react-native-gesture-handler + react-native-reanimated
 *        (npx expo install react-native-gesture-handler react-native-reanimated)
 * Save as: src/components/FeedMediaBlock.tsx
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, Image, Pressable, ScrollView, FlatList, Modal, StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Gesture, GestureDetector, GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme-context";
import { radii, type Palette } from "@/src/theme";

export type MediaItem = { type: "image" | "video"; url: string; name?: string };

const INNER_RADIUS = 14;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.6;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

// ------------------------------------------------------------
// Pinch / pan / double-tap / swipe-down wrapper
// ------------------------------------------------------------
function ZoomableView({ width, height, active, allowDoubleTap = true, onZoomChange,
  onDismiss, children }: {
    width: number; height: number; active: boolean; allowDoubleTap?: boolean;
    onZoomChange: (zoomed: boolean) => void; onDismiss: () => void;
    children: React.ReactNode;
  }) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const setZoom = useCallback((z: boolean) => {
    setZoomed(z);
    if (activeRef.current) onZoomChange(z);
  }, [onZoomChange]);

  // start fresh whenever the user swipes to another item
  useEffect(() => {
    if (!active) {
      scale.value = 1; tx.value = 0; ty.value = 0; dismissY.value = 0;
      setZoomed(false);
    }
  }, [active, scale, tx, ty, dismissY]);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        startScale.value = scale.value;
        startTx.value = tx.value;
        startTy.value = ty.value;
        focalX.value = e.focalX - width / 2;
        focalY.value = e.focalY - height / 2;
      })
      .onUpdate((e) => {
        const next = clamp(startScale.value * e.scale, 1, MAX_SCALE);
        const ratio = next / startScale.value;
        const maxX = (width * next - width) / 2;
        const maxY = (height * next - height) / 2;
        scale.value = next;
        // keep the point under the fingers where it is
        tx.value = clamp(focalX.value - (focalX.value - startTx.value) * ratio, -maxX, maxX);
        ty.value = clamp(focalY.value - (focalY.value - startTy.value) * ratio, -maxY, maxY);
      })
      .onEnd(() => {
        if (scale.value < 1.02) {
          scale.value = withTiming(1);
          tx.value = withTiming(0);
          ty.value = withTiming(0);
          runOnJS(setZoom)(false);
        } else {
          runOnJS(setZoom)(true);
        }
      });

    // move around while zoomed in
    const pan = Gesture.Pan()
      .enabled(zoomed)
      .onStart(() => {
        startTx.value = tx.value;
        startTy.value = ty.value;
      })
      .onUpdate((e) => {
        const maxX = (width * scale.value - width) / 2;
        const maxY = (height * scale.value - height) / 2;
        tx.value = clamp(startTx.value + e.translationX, -maxX, maxX);
        ty.value = clamp(startTy.value + e.translationY, -maxY, maxY);
      })
      .onEnd((e) => {
        const maxX = (width * scale.value - width) / 2;
        const maxY = (height * scale.value - height) / 2;
        tx.value = withDecay({ velocity: e.velocityX, clamp: [-maxX, maxX] });
        ty.value = withDecay({ velocity: e.velocityY, clamp: [-maxY, maxY] });
      });

    // swipe up/down to close (only when not zoomed; horizontal swipes still page)
    const dismiss = Gesture.Pan()
      .enabled(!zoomed)
      .maxPointers(1)
      .activeOffsetY([-24, 24])
      .failOffsetX([-18, 18])
      .onUpdate((e) => { dismissY.value = e.translationY; })
      .onEnd((e) => {
        if (Math.abs(e.translationY) > 110 || Math.abs(e.velocityY) > 1100) {
          runOnJS(onDismiss)();
        } else {
          dismissY.value = withSpring(0);
        }
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .enabled(allowDoubleTap)
      .onEnd((e, success) => {
        if (!success) return;
        if (scale.value > 1.05) {
          scale.value = withTiming(1);
          tx.value = withTiming(0);
          ty.value = withTiming(0);
          runOnJS(setZoom)(false);
        } else {
          const fx = e.x - width / 2;
          const fy = e.y - height / 2;
          const maxX = (width * DOUBLE_TAP_SCALE - width) / 2;
          const maxY = (height * DOUBLE_TAP_SCALE - height) / 2;
          scale.value = withTiming(DOUBLE_TAP_SCALE);
          tx.value = withTiming(clamp(-fx * (DOUBLE_TAP_SCALE - 1), -maxX, maxX));
          ty.value = withTiming(clamp(-fy * (DOUBLE_TAP_SCALE - 1), -maxY, maxY));
          runOnJS(setZoom)(true);
        }
      });

    return Gesture.Simultaneous(doubleTap, pinch, pan, dismiss);
  }, [zoomed, width, height, allowDoubleTap, onDismiss, setZoom,
    scale, tx, ty, startScale, startTx, startTy, focalX, focalY, dismissY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value + dismissY.value },
      { scale: scale.value * (1 - (Math.min(Math.abs(dismissY.value), 300) / 300) * 0.12) },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

// ------------------------------------------------------------
// Full-screen viewer
// ------------------------------------------------------------
function ViewerVideo({ url, active, width, height }: {
  url: string; active: boolean; width: number; height: number;
}) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  useEffect(() => {
    if (active) player.play(); else player.pause();
  }, [active, player]);
  return (
    <View style={{ width, height, justifyContent: "center", backgroundColor: "#000" }}>
      {/* textureView lets Android scale/move the video with the gestures */}
      <VideoView player={player} style={{ width, height }} nativeControls
        contentFit="contain" surfaceType="textureView"
        fullscreenOptions={{ enable: false }} />
    </View>
  );
}

function MediaViewer({ media, startIndex, onClose }: {
  media: MediaItem[]; startIndex: number; onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}
      statusBarTranslucent supportedOrientations={["portrait", "landscape"]}>
      {/* gestures inside a Modal need their own root view on Android */}
      <GestureHandlerRootView style={viewer.root}>
        <FlatList
          key={width}
          data={media}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          extraData={`${index}-${zoomed}`}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(m, i) => `${m.url}-${i}`}
          onMomentumScrollEnd={(e) => {
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
            setZoomed(false);
          }}
          renderItem={({ item, index: i }) => (
            <ZoomableView width={width} height={height} active={i === index}
              allowDoubleTap={item.type === "image"}
              onZoomChange={setZoomed} onDismiss={onClose}>
              {item.type === "image" ? (
                <Image source={{ uri: item.url }} style={{ width, height }}
                  resizeMode="contain" accessibilityLabel={item.name || `Image ${i + 1}`} />
              ) : (
                <ViewerVideo url={item.url} active={i === index} width={width} height={height} />
              )}
            </ZoomableView>
          )}
        />

        <View style={[viewer.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable style={viewer.closeBtn} onPress={onClose} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {media.length > 1 && (
            <View style={viewer.counter}>
              <Text style={viewer.counterText}>{index + 1} / {media.length}</Text>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ------------------------------------------------------------
// Video in the card: thumbnail + play button. Tapping it opens the viewer.
// ------------------------------------------------------------
// Cloudinary can render the first frame as a JPG; other hosts fall back to a dark tile.
function videoPosterUrl(url: string): string | null {
  if (!url.includes("/video/upload/")) return null;
  return url
    .replace("/video/upload/", "/video/upload/so_0,w_900,h_540,c_fill,f_jpg/")
    .replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg$1");
}

function VideoThumb({ media, width, height, onPress, styles }: {
  media: MediaItem; width: number; height: number; onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const poster = videoPosterUrl(media.url);
  const [posterFailed, setPosterFailed] = useState(false);
  return (
    <Pressable onPress={onPress} style={[styles.videoThumb, { width, height }]}
      accessibilityRole="button"
      accessibilityLabel={`${media.name || "Video"}, tap to play full screen`}>
      {!!poster && !posterFailed && (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill}
          resizeMode="cover" onError={() => setPosterFailed(true)} />
      )}
      <View style={styles.videoShade} />
      <View style={styles.videoPlay}>
        <Ionicons name="play" size={26} color="#fff" />
      </View>
      <View style={styles.videoBadge}>
        <Ionicons name="videocam" size={12} color="#fff" />
        <Text style={styles.videoBadgeText} numberOfLines={1}>{media.name || "Video"}</Text>
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------
// Post media
// ------------------------------------------------------------
export function MediaBlock({ media, cardWidth }: { media: MediaItem[]; cardWidth: number }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [index, setIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  const h = cardWidth * 0.6;
  const open = (item: MediaItem) => setViewerIndex(Math.max(0, media.indexOf(item)));
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  return (
    <>
      {images.length === 1 && (
        <Pressable onPress={() => open(images[0])} accessibilityRole="imagebutton"
          accessibilityLabel={`${images[0].name || "Attached image"}, tap to view full screen`}>
          <Image source={{ uri: images[0].url }}
            style={[styles.mediaSingle, { width: cardWidth, height: h }]}
            resizeMode="cover" />
        </Pressable>
      )}
      {images.length > 1 && (
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            style={styles.mediaScroll}
            onMomentumScrollEnd={(e) =>
              setIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth))}>
            {images.map((m, i) => (
              <Pressable key={`${m.url}-${i}`} onPress={() => open(m)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${m.name || `Image ${i + 1}`}, tap to view full screen`}>
                <Image source={{ uri: m.url }} style={{ width: cardWidth, height: h }}
                  resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.mediaCounter} pointerEvents="none">
            <Text style={styles.mediaCounterText}>{index + 1}/{images.length}</Text>
          </View>
        </View>
      )}
      {videos.map((m, i) => (
        <VideoThumb key={`${m.url}-${i}`} media={m} width={cardWidth} height={h}
          onPress={() => open(m)} styles={styles} />
      ))}

      {viewerIndex !== null && (
        <MediaViewer media={media} startIndex={viewerIndex} onClose={closeViewer} />
      )}
    </>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  mediaSingle: { borderRadius: INNER_RADIUS, backgroundColor: t.surfaceTertiary },
  mediaScroll: { borderRadius: INNER_RADIUS, overflow: "hidden" },
  mediaCounter: {
    position: "absolute", right: 10, bottom: 10, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: radii.pill, backgroundColor: "rgba(0,0,0,0.6)",
  },
  mediaCounterText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  videoThumb: {
    borderRadius: INNER_RADIUS, overflow: "hidden", backgroundColor: "#1E293B",
    alignItems: "center", justifyContent: "center",
  },
  videoShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.28)" },
  videoPlay: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center", paddingLeft: 3,
  },
  videoBadge: {
    position: "absolute", left: 10, bottom: 10, maxWidth: "70%",
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  videoBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700", flexShrink: 1 },
});

const viewer = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  counter: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  counterText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});