/**
 * Theme system — light & dark palettes with a reactive singleton.
 *
 * `theme` is a Proxy that always reads from the CURRENT palette, so inline
 * styles (`color: theme.onSurface`) update automatically when the mode
 * changes and the component re-renders.
 *
 * Because StyleSheet.create() freezes values at call time, screens must
 * create their styles through a factory:
 *
 *   const createStyles = (t: Palette) => StyleSheet.create({ ... t.surface ... });
 *
 * and inside the component:
 *
 *   const t = useTheme();
 *   const styles = useMemo(() => createStyles(t), [t]);
 *
 * `useTheme` lives in src/theme-context.tsx (it needs React context for the
 * mode controller). The palette subscription primitives live here.
 */

export type Palette = {
  surface: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  onSurface: string;
  onSurfaceMuted: string;
  brand: string;
  brandPrimary: string;
  brandSecondary: string;
  brandTertiary: string;
  onBrandPrimary: string;
  onBrandTertiary: string;
  success: string;
  successBg: string;
  warning: string;
  error: string;
  border: string;
  borderStrong: string;
  divider: string;
  shadow: string;
};

export const lightPalette: Palette = {
  surface: "#F3F4F6",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#E5E7EB",
  onSurface: "#0F172A",
  onSurfaceMuted: "#64748B",
  brand: "#0A192F",
  brandPrimary: "#2563EB",
  brandSecondary: "#1E3A5F",
  brandTertiary: "#DBEAFE",
  onBrandPrimary: "#FFFFFF",
  onBrandTertiary: "#1E40AF",
  success: "#10B981",
  successBg: "#D1FAE5",
  warning: "#F59E0B",
  error: "#EF4444",
  border: "#E2E8F0",
  borderStrong: "#94A3B8",
  divider: "#E2E8F0",
  shadow: "rgba(15, 23, 42, 0.08)",
};

export const darkPalette: Palette = {
  surface: "#0B1220",
  surfaceSecondary: "#131F33",
  surfaceTertiary: "#1E2B40",
  onSurface: "#F1F5F9",
  onSurfaceMuted: "#94A3B8",
  brand: "#3B82F6",
  brandPrimary: "#2563EB",
  brandSecondary: "#1E3A5F",
  brandTertiary: "#1E3A5F",
  onBrandPrimary: "#FFFFFF",
  onBrandTertiary: "#BFDBFE",
  success: "#34D399",
  successBg: "#064E3B",
  warning: "#FBBF24",
  error: "#F87171",
  border: "#24334D",
  borderStrong: "#475569",
  divider: "#24334D",
  shadow: "rgba(0, 0, 0, 0.45)",
};

// --- Reactive current-palette holder -------------------------------------

let current: Palette = lightPalette;
const listeners = new Set<() => void>();

/** Stable snapshot for useSyncExternalStore — palettes are static objects. */
export function getPaletteSnapshot(): Palette {
  return current;
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Swaps the active palette and notifies every subscriber. */
export function setThemeMode(mode: "light" | "dark"): void {
  const next = mode === "dark" ? darkPalette : lightPalette;
  if (next === current) return;
  current = next;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* listener errors must never break the swap */
    }
  });
}

/**
 * Reactive theme proxy — every property read resolves against the CURRENT
 * palette, so `theme.onSurface` is always up to date at access time.
 */
export const theme: Palette = new Proxy({} as Palette, {
  get: (_target, key: string | symbol) => Reflect.get(current, key),
});

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { sm: 6, md: 12, lg: 20, pill: 999 };

export const shadow1 = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
};