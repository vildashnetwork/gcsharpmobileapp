/**
 * CachedImage — an expo-image wrapper that falls back to on-device bytes.
 *
 * While online it renders the remote URL normally (expo-image already caches
 * to disk). When OFFLINE, it swaps in the local file:// uri recorded in the
 * media manifest (populated by the sync worker), so thumbnails/avatars keep
 * rendering with data off.
 */

import React, { useEffect, useState } from "react";
import { Image, type ImageProps } from "expo-image";
import { getLocalMediaUri } from "@/src/lib/mediaStore";
import { useNetworkStatus } from "@/src/lib/useNetworkStatus";

type Props = Omit<ImageProps, "source"> & {
    uri?: string | null;
};

export function CachedImage({ uri, ...rest }: Props) {
    const isOnline = useNetworkStatus();
    const [localUri, setLocalUri] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            if (!uri) {
                if (mounted) setLocalUri(null);
                return;
            }
            // Only consult the manifest when offline — online, the remote
            // URL (with expo-image's own disk cache) is the best source.
            if (!isOnline) {
                const local = await getLocalMediaUri(uri);
                if (mounted) setLocalUri(local);
            } else {
                if (mounted) setLocalUri(null);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [uri, isOnline]);

    const resolved = !isOnline && localUri ? localUri : uri;

    return <Image source={resolved ? { uri: resolved } : undefined} {...rest} />;
}