import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Real-time online/offline flag. Fires immediately on mount with the
 * current state, then updates live as connectivity changes — this is
 * what drives the automatic online -> offline switch.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let mounted = true;

    NetInfo.fetch().then((state) => {
      if (mounted) {
        setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
      }
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return isOnline;
}
