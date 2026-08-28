import { useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useLanguage } from "@/src/i18n";
import { LanguageSwitcher } from "@/src/components/LanguageSwitcher";

type Screen =
  | "loading"
  | "splash"
  | "onboarding"
  | "authChoice"
  | "register"
  | "login"
  | "resetPin"; // changed from "resetPassword"

type RegisterStep = "email" | "name" | "password" | "pin";

type OnboardingItem = {
  title: string;
  description: string;
  button: string;
  artwork: "students" | "papers" | "ai" | "explore";
};

type ResetStep = "email" | "otp";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://gcsharpmobileapp.onrender.com/api";

const FIRST_LAUNCH_KEY = "gcsharp_onboarding_completed";
const SAVED_EMAIL_KEY = "gcsharp_saved_email";
const BIOMETRIC_TOKEN_KEY = "gcsharp_biometric_token";
const AUTH_TOKEN_KEY = "token";

const BLUE = "#1559C8";
const DARK_BLUE = "#0D47A1";
const MUTED = "#64748B";
const LIGHT_BLUE = "#E9F2FF";
const WHITE = "#FFFFFF";
const BORDER = "#D7DEE8";
const ERROR = "#C62828";

// Onboarding copy is resolved from the active language dictionary at render
// time so switching EN/FR (even mid-flow) translates every slide.
function useOnboardingItems(): OnboardingItem[] {
  const { t } = useLanguage();
  return [
    {
      title: t.welcome.onboarding1Title,
      description: t.welcome.onboarding1Desc,
      button: t.common.next,
      artwork: "students",
    },
    {
      title: t.welcome.onboarding2Title,
      description: t.welcome.onboarding2Desc,
      button: t.common.next,
      artwork: "papers",
    },
    {
      title: t.welcome.onboarding3Title,
      description: t.welcome.onboarding3Desc,
      button: t.common.next,
      artwork: "ai",
    },
    {
      title: t.welcome.onboarding4Title,
      description: t.welcome.onboarding4Desc,
      button: t.welcome.startRevising,
      artwork: "explore",
    },
  ];
}

function authHeaders(token?: string) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body.detail || body.message || "Something went wrong";

  } catch (err) {
    console.log(err?.toString() || "Error reading response body");
    return "Unable to connect to the server";

  }
}

// ---------- Artwork Components (unchanged) ----------
function BrandLogo({ compact = false }: { compact?: boolean }) {
  const size = compact ? 76 : 180;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={compact ? 76 : 180} viewBox="0 0 180 180">
        <Path d="M28 72 L91 40 L153 71 L91 103 Z" fill={WHITE} />
        <Path d="M51 86 V114 C51 137 72 149 91 149 C112 149 132 137 132 114 V88 L91 109 Z" fill={WHITE} />
        <Path d="M153 71 V117" stroke="#F5C542" strokeWidth="7" strokeLinecap="round" />
        <Circle cx="153" cy="121" r="7" fill="#F5C542" />
        <Path d="M75 73 C84 62 99 61 111 69 C121 76 125 90 119 101" stroke={BLUE} strokeWidth="14" strokeLinecap="round" fill="none" />
        <Path d="M113 99 L135 94 L128 116" fill={BLUE} />
      </Svg>
      {!compact && (
        <>
          <Text style={styles.logoTitle}>GC Sharp</Text>
          <Text style={styles.logoSubtitle}>EDUCATION</Text>
        </>
      )}
    </View>
  );
}

function StudentsArtwork() {
  return (
    <Svg width="100%" height={330} viewBox="0 0 420 330">
      <Line x1="25" y1="110" x2="395" y2="110" stroke="#94A3B8" />
      <G>
        <Rect x="55" y="34" width="78" height="76" rx="4" fill="#153DA5" />
        <SvgText x="94" y="78" fill="#fff" fontSize="20" textAnchor="middle">GCE</SvgText>
        <Line x1="139" y1="45" x2="168" y2="45" stroke="#173A84" strokeWidth="8" />
        <Line x1="139" y1="60" x2="171" y2="60" stroke="#173A84" strokeWidth="8" />
        <Line x1="139" y1="75" x2="166" y2="75" stroke="#173A84" strokeWidth="8" />
      </G>
      <G>
        <Rect x="171" y="22" width="74" height="88" rx="4" fill="#E87525" />
        <SvgText x="208" y="70" fill="#fff" fontSize="20" textAnchor="middle">HND</SvgText>
        <Line x1="251" y1="34" x2="283" y2="34" stroke="#6B4C39" strokeWidth="7" />
        <Line x1="251" y1="49" x2="287" y2="49" stroke="#6B4C39" strokeWidth="7" />
        <Line x1="251" y1="64" x2="282" y2="64" stroke="#6B4C39" strokeWidth="7" />
        <Line x1="251" y1="79" x2="288" y2="79" stroke="#6B4C39" strokeWidth="7" />
      </G>
      <G>
        <Rect x="302" y="16" width="78" height="94" rx="4" fill="#19934C" />
        <SvgText x="341" y="65" fill="#fff" fontSize="14" textAnchor="middle">CONCOURS</SvgText>
      </G>
      <G>
        <Circle cx="100" cy="176" r="30" fill="#F0B38A" />
        <Path d="M68 176 Q100 125 132 176 V205 H68 Z" fill="#D5E1E9" />
        <Path d="M55 316 V232 Q55 200 92 195 H113 Q143 202 145 236 V316 Z" fill="#1559C8" />
        <Path d="M66 317 L55 230 Q44 232 31 275 L21 317 Z" fill="#134CAD" />
        <Line x1="137" y1="240" x2="144" y2="111" stroke="#F0B38A" strokeWidth="17" strokeLinecap="round" />
      </G>
      <G>
        <Circle cx="215" cy="169" r="31" fill="#935A3B" />
        <Path d="M183 164 Q186 126 218 129 Q251 135 247 170" fill="#102D55" />
        <Path d="M166 316 V226 Q174 196 208 192 H230 Q260 199 270 232 V316 Z" fill="#1559C8" />
        <Path d="M204 317 L205 218 H230 L241 317 Z" fill="#FFFFFF" />
        <Line x1="256" y1="231" x2="276" y2="110" stroke="#935A3B" strokeWidth="18" strokeLinecap="round" />
        <Path d="M166 225 Q144 240 144 302" stroke="#173A84" strokeWidth="15" fill="none" />
      </G>
      <G>
        <Circle cx="333" cy="174" r="30" fill="#F3B58E" />
        <Path d="M302 173 Q304 133 337 136 Q365 139 366 178 Q352 158 338 154 Q321 165 302 173" fill="#17283E" />
        <Path d="M290 316 V228 Q298 200 328 198 H347 Q376 205 388 240 V316 Z" fill="#1559C8" />
        <Line x1="304" y1="233" x2="302" y2="111" stroke="#F3B58E" strokeWidth="18" strokeLinecap="round" />
        <Path d="M335 201 L361 316" stroke="#13814D" strokeWidth="8" />
      </G>
    </Svg>
  );
}

function PapersArtwork() {
  return (
    <Svg width="100%" height={330} viewBox="0 0 420 330">
      <Rect x="38" y="42" width="175" height="217" rx="4" fill="#F7FAFC" stroke="#B8C5D6" />
      <Line x1="56" y1="59" x2="56" y2="235" stroke="#D3DBE6" />
      {[0, 1, 2, 3].map((row) => (
        <G key={row}>
          <Rect x={68 + row * 22} y={64} width="10" height={70 + row * 7} fill={row % 2 ? "#FFFFFF" : "#EAF0F7"} stroke="#45629B" />
          <Line x1={78 + row * 22} y1={64} x2={91 + row * 22} y2={135 + row * 5} stroke="#45629B" strokeWidth="2" />
        </G>
      ))}
      <Rect x="250" y="185" width="130" height="90" rx="4" fill="#103D9D" />
      <Rect x="269" y="203" width="82" height="54" fill="#fff" />
      <SvgText x="310" y="235" fontSize="14" fill="#1559C8" textAnchor="middle">EXAM</SvgText>
      <G>
        <Circle cx="211" cy="103" r="25" fill="#FFE0C2" />
        <Path d="M185 100 Q188 67 218 75 Q242 77 237 105" fill="#15335C" />
        <Path d="M150 228 Q153 134 202 127 Q249 125 275 181 L255 214 L229 176 V263 H151 Z" fill="#174FB8" />
        <Line x1="166" y1="169" x2="108" y2="203" stroke="#FFE0C2" strokeWidth="17" strokeLinecap="round" />
        <Rect x="78" y="164" width="70" height="91" fill="#fff" stroke="#8393AD" transform="rotate(-12 113 209)" />
        <SvgText x="110" y="190" fontSize="12" fill="#164BB2" textAnchor="middle">EXAM</SvgText>
        <Line x1="228" y1="173" x2="205" y2="250" stroke="#FFE0C2" strokeWidth="17" strokeLinecap="round" />
        <Rect x="185" y="216" width="68" height="65" fill="#fff" stroke="#8393AD" />
        <SvgText x="219" y="246" fontSize="12" fill="#164BB2" textAnchor="middle">EXAM</SvgText>
      </G>
      {[0, 1, 2, 3].map((i) => (
        <G key={`books-${i}`}>
          <Rect x={55 + i * 65} y={270 - i * 5} width="58" height="15" rx="6" fill={i % 2 ? "#fff" : "#174FB8"} stroke="#27457E" />
          <Rect x={57 + i * 65} y={290 - i * 5} width="62" height="15" rx="6" fill="#fff" stroke="#27457E" />
        </G>
      ))}
    </Svg>
  );
}

function AiArtwork() {
  return (
    <Svg width="100%" height={330} viewBox="0 0 420 330">
      <Path d="M18 294 L120 202 L178 248 L109 330 H18 Z" fill="#1559C8" />
      <Path d="M116 213 Q139 152 165 83 Q180 43 205 70 L221 161" fill="#FFFFFF" stroke="#223B68" strokeWidth="2" />
      <Path d="M292 279 Q337 250 346 184 Q352 134 324 126 Q308 128 310 160 L304 206" fill="#FFFFFF" stroke="#223B68" strokeWidth="2" />
      <Rect x="159" y="44" width="157" height="236" rx="18" fill="#143FA1" />
      <Rect x="169" y="55" width="137" height="211" rx="12" fill="#DDFEFF" />
      <Line x1="190" y1="55" x2="190" y2="95" stroke="#54D3E5" />
      <Line x1="205" y1="55" x2="205" y2="81" stroke="#54D3E5" />
      <Line x1="225" y1="55" x2="225" y2="101" stroke="#54D3E5" />
      <Line x1="280" y1="55" x2="280" y2="93" stroke="#54D3E5" />
      <G>
        <Rect x="190" y="124" width="79" height="59" rx="24" fill="#F5FAFC" stroke="#123D98" strokeWidth="3" />
        <Rect x="205" y="137" width="49" height="27" rx="13" fill="#183A87" />
        <Circle cx="220" cy="150" r="5" fill="#43EBEF" />
        <Circle cx="241" cy="150" r="5" fill="#43EBEF" />
        <Circle cx="180" cy="147" r="16" fill="#C4F8FB" stroke="#123D98" strokeWidth="3" />
        <Circle cx="277" cy="148" r="16" fill="#C4F8FB" stroke="#123D98" strokeWidth="3" />
        <Path d="M205 183 L200 225 Q228 247 257 225 L253 183 Z" fill="#E7F9FB" stroke="#123D98" strokeWidth="3" />
        <Circle cx="229" cy="207" r="10" fill="#35D8E2" stroke="#123D98" />
        <Line x1="201" y1="191" x2="180" y2="220" stroke="#123D98" strokeWidth="7" strokeLinecap="round" />
        <Line x1="254" y1="191" x2="292" y2="160" stroke="#123D98" strokeWidth="7" strokeLinecap="round" />
      </G>
      <Rect x="263" y="80" width="138" height="115" rx="8" fill="#C8FBFA" stroke="#5ED8DF" />
      <SvgText x="282" y="108" fill="#172554" fontSize="12">H₂N</SvgText>
      <SvgText x="321" y="127" fill="#172554" fontSize="12">O</SvgText>
      <SvgText x="350" y="105" fill="#172554" fontSize="12">OH</SvgText>
      <Line x1="286" y1="115" x2="319" y2="128" stroke="#172554" />
      <Line x1="323" y1="128" x2="348" y2="108" stroke="#172554" />
      <Rect x="284" y="154" width="96" height="25" rx="12" fill="#1559C8" />
      <SvgText x="332" y="171" fill="#fff" fontSize="12" textAnchor="middle">Step-by-Step</SvgText>
    </Svg>
  );
}

function ExploreArtwork() {
  const icons = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 26;
        const radius = index % 2 ? 92 : 68;
        return {
          x: 210 + Math.cos(angle) * radius,
          y: 144 + Math.sin(angle) * radius,
          type: index % 4,
        };
      }),
    [],
  );
  return (
    <Svg width="100%" height={330} viewBox="0 0 420 330">
      <Circle cx="210" cy="145" r="115" fill="#FBFDFF" stroke="#3270C7" strokeWidth="3" />
      <Circle cx="210" cy="145" r="95" fill="none" stroke="#B6D2F3" strokeWidth="2" />
      <Path d="M210 31 Q150 145 210 259" fill="none" stroke="#5F91D2" />
      <Path d="M210 31 Q270 145 210 259" fill="none" stroke="#5F91D2" />
      <Line x1="100" y1="145" x2="320" y2="145" stroke="#5F91D2" />
      <Path d="M112 91 Q210 125 308 91" fill="none" stroke="#9FC0E8" />
      <Path d="M112 199 Q210 165 308 199" fill="none" stroke="#9FC0E8" />
      {icons.map((item, index) => (
        <G key={index}>
          {item.type === 0 && <Rect x={item.x - 8} y={item.y - 10} width="16" height="20" fill="none" stroke="#2465BC" strokeWidth="2" />}
          {item.type === 1 && <Circle cx={item.x} cy={item.y} r="8" fill="none" stroke="#2465BC" strokeWidth="2" />}
          {item.type === 2 && <Path d={`M${item.x - 9} ${item.y + 7} L${item.x} ${item.y - 9} L${item.x + 9} ${item.y + 7} Z`} fill="none" stroke="#2465BC" strokeWidth="2" />}
          {item.type === 3 && <Path d={`M${item.x - 8} ${item.y} H${item.x + 8} M${item.x} ${item.y - 8} V${item.y + 8}`} stroke="#2465BC" strokeWidth="2" />}
        </G>
      ))}
      <Circle cx="210" cy="145" r="23" fill={LIGHT_BLUE} stroke="#1559C8" strokeWidth="3" />
      <Path d="M202 145 H218 M210 137 V153" stroke="#1559C8" strokeWidth="4" strokeLinecap="round" />
      <SvgText x="210" y="290" textAnchor="middle" fill="#174A91" fontSize="19">WORLD OF MUCH TO</SvgText>
      <SvgText x="210" y="318" textAnchor="middle" fill="#1559C8" fontSize="30">EXPLORE</SvgText>
    </Svg>
  );
}

function Artwork({ type }: { type: OnboardingItem["artwork"] }) {
  if (type === "students") return <StudentsArtwork />;
  if (type === "papers") return <PapersArtwork />;
  if (type === "ai") return <AiArtwork />;
  return <ExploreArtwork />;
}

function PinInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const add = (number: string) => {
    if (!disabled && value.length < 6) {
      onChange(value + number);
    }
  };
  const remove = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };
  return (
    <View>
      <View style={styles.pinDots}>
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={[styles.pinDot, index < value.length && styles.pinDotFilled]} />
        ))}
      </View>
      <View style={styles.keypad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((number) => (
          <Pressable
            key={number}
            onPress={() => add(number)}
            disabled={disabled}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: theme.brandTertiary }]}
          >
            <Text style={styles.keyText}>{number}</Text>
          </Pressable>
        ))}
        <View style={styles.key} />
        <Pressable
          onPress={() => add("0")}
          disabled={disabled}
          style={({ pressed }) => [styles.key, pressed && { backgroundColor: theme.brandTertiary }]}
        >
          <Text style={styles.keyText}>0</Text>
        </Pressable>
        <Pressable
          onPress={remove}
          disabled={disabled}
          style={({ pressed }) => [styles.key, pressed && { backgroundColor: theme.brandTertiary }]}
        >
          <Ionicons name="backspace-outline" size={26} color={theme.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

export default function Welcome() {
  useTheme(); // re-render this screen when light/dark changes
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth() as any;
  const { t } = useLanguage();
  const onboarding = useOnboardingItems();

  const [screen, setScreen] = useState<Screen>("loading");
  const [slide, setSlide] = useState(0);
  const [registerStep, setRegisterStep] = useState<RegisterStep>("email");

  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmingPin, setConfirmingPin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loading progress animation
  const [loadProgress, setLoadProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ---------- Reset PIN OTP state ----------
  const [resetStep, setResetStep] = useState<ResetStep>("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetConfirmPin, setResetConfirmPin] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, []);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (screen === "loading") {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      }).start();
      const interval = setInterval(() => {
        setLoadProgress((prev) => {
          const next = prev + Math.random() * 15;
          return next > 100 ? 100 : next;
        });
      }, 200);
      return () => clearInterval(interval);
    }
  }, [screen]);

  useEffect(() => {
    if (screen === "login" && pin.length === 6 && !busy) {
      loginWithPin();
    }
  }, [pin, screen]);

  const bootstrap = async () => {
    try {
      const [completed, storedEmail, hardware, enrolled] = await Promise.all([
        AsyncStorage.getItem(FIRST_LAUNCH_KEY),
        SecureStore.getItemAsync(SAVED_EMAIL_KEY),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setSavedEmail(storedEmail || "");
      setEmail(storedEmail || "");
      setBiometricAvailable(hardware && enrolled);

      setTimeout(() => {
        if (!completed) {
          setScreen("splash");
        } else if (storedEmail) {
          setScreen("login");
        } else {
          setScreen("authChoice");
        }
      }, 1500);
    } catch {
      setScreen("splash");
    }
  };

  const finishSplash = () => setScreen("onboarding");
  const finishOnboarding = async () => {
    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, "true");
    setScreen("authChoice");
  };
  const nextSlide = async () => {
    if (slide < onboarding.length - 1) {
      setSlide((current) => current + 1);
      return;
    }
    await finishOnboarding();
  };
  const skipOnboarding = async () => {
    await finishOnboarding();
  };

  const storeTokenAndUser = async (token: string, user: any) => {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    await SecureStore.setItemAsync("auth_token", token);
    console.log("Token stored in SecureStore");

    if (typeof auth.setSession === "function") {
      await auth.setSession(token, user);
    } else if (typeof auth.restoreSession === "function") {
      await auth.restoreSession(token, user);
    } else if (typeof auth.setToken === "function") {
      await auth.setToken(token);
    } else if (typeof auth.setUser === "function") {
      await auth.setUser(user);
    } else {
      console.warn("No auth context method found – stored token only.");
    }
  };

  const validateRegistrationStep = () => {
    setError(null);
    if (registerStep === "email") {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      if (!valid) {
        setError(t.welcome.errEmail);
        return;
      }
      setRegisterStep("name");
      return;
    }
    if (registerStep === "name") {
      if (name.trim().length < 2) {
        setError(t.welcome.errName);
        return;
      }
      setRegisterStep("password");
      return;
    }
    if (registerStep === "password") {
      if (password.length < 8) {
        setError(t.welcome.errPassword);
        return;
      }
      setRegisterStep("pin");
      return;
    }
  };

  const registerAccount = async () => {
    setError(null);
    if (pin.length !== 6) {
      setError(t.welcome.errPin);
      return;
    }
    if (!confirmingPin) {
      setConfirmPin(pin);
      setPin("");
      setConfirmingPin(true);
      return;
    }
    if (pin !== confirmPin) {
      setError(t.welcome.errPinMatch);
      setPin("");
      setConfirmPin("");
      setConfirmingPin(false);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/auth/register-with-pin`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          password,
          pin,
          role: "student",
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const data = await response.json();

      await SecureStore.setItemAsync(SAVED_EMAIL_KEY, email.trim().toLowerCase());
      await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, data.biometric_token);
      setSavedEmail(email.trim().toLowerCase());

      await storeTokenAndUser(data.token, data.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || t.welcome.errGeneric);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const loginWithPin = async () => {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/pin-login`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: (savedEmail || email).trim().toLowerCase(),
          pin,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const data = await response.json();

      if (data.biometric_token) {
        await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, data.biometric_token);
      }

      await storeTokenAndUser(data.token, data.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || t.welcome.errIncorrectPin);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const biometricLogin = async () => {
    setError(null);
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hardware || !enrolled) {
        setError(t.welcome.errBiometricSetup);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t.welcome.biometricPrompt,
        cancelLabel: t.welcome.biometricCancel,
        fallbackLabel: t.welcome.biometricCancel,
        disableDeviceFallback: false,
      });
      if (!result.success) return;

      const biometricToken = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
      if (!biometricToken) {
        setError(t.welcome.errBiometricToken);
        return;
      }

      setBusy(true);
      const response = await fetch(`${API_URL}/auth/biometric-login`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ biometric_token: biometricToken }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const data = await response.json();

      await storeTokenAndUser(data.token, data.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || t.welcome.errBiometricFailed);
    } finally {
      setBusy(false);
    }
  };

  const clearSavedAccount = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SAVED_EMAIL_KEY),
      SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY),
      SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
    ]);
    setSavedEmail("");
    setEmail("");
    setPin("");
    setScreen("authChoice");
  };

  const registrationProgress = {
    email: 1,
    name: 2,
    password: 3,
    pin: 4,
  }[registerStep];

  // ---------- Reset PIN OTP Handlers ----------
  const requestOtp = async () => {
    setResetError(null);
    setResetSuccess(false);
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim());
    if (!emailValid) {
      setResetError("Please enter a valid email address.");
      return;
    }

    setResetBusy(true);
    try {
      // Use PIN reset OTP endpoint
      const response = await fetch(`${API_URL}/auth/request-pin-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setOtpSent(true);
      setResetStep("otp");
      setResetError(null);
      // Start countdown for resend (60 seconds)
      setCountdown(60);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e: any) {
      setResetError(e.message || "Could not send OTP.");
    } finally {
      setResetBusy(false);
    }
  };

  const resetPinWithOtp = async () => {
    setResetError(null);
    setResetSuccess(false);

    if (resetOtp.length !== 6) {
      setResetError("Please enter the 6-digit OTP.");
      return;
    }
    if (resetNewPin.length !== 6) {
      setResetError("PIN must be exactly 6 digits.");
      return;
    }
    if (resetNewPin !== resetConfirmPin) {
      setResetError("PINs do not match.");
      return;
    }

    setResetBusy(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-pin-with-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          otp: resetOtp,
          new_pin: resetNewPin,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setResetSuccess(true);
      setTimeout(() => {
        setScreen("login");
        // Clear reset fields
        setResetEmail("");
        setResetOtp("");
        setResetNewPin("");
        setResetConfirmPin("");
        setOtpSent(false);
        setResetStep("email");
        if (countdownInterval.current) clearInterval(countdownInterval.current);
        setCountdown(0);
      }, 3000);
    } catch (e: any) {
      setResetError(e.message || "Failed to reset PIN.");
    } finally {
      setResetBusy(false);
    }
  };

  const goBackToLogin = () => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setResetEmail("");
    setResetOtp("");
    setResetNewPin("");
    setResetConfirmPin("");
    setResetError(null);
    setResetSuccess(false);
    setOtpSent(false);
    setResetStep("email");
    setCountdown(0);
    setScreen("login");
  };

  // ---------- Render Screens ----------
  if (screen === "loading") {
    const width = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["0%", "100%"],
    });
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingTitle}>GC Sharp</Text>
        <Text style={styles.loadingSubtitle}>EDUCATION</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(loadProgress)}%</Text>
        </View>
      </View>
    );
  }

  if (screen === "splash") {
    return (
      <View style={[styles.splash, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.languageRow}>
          <LanguageSwitcher variant="light" />
        </View>
        <View style={styles.splashLogo}>
          <BrandLogo />
        </View>
        <Pressable testID="get-started" onPress={finishSplash} style={styles.splashButton}>
          <Text style={styles.splashButtonText}>{t.welcome.getStarted}</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === "onboarding") {
    const item = onboarding[slide];
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.onboardingHeader}>
          <Pressable
            onPress={() => {
              if (slide > 0) setSlide((value) => value - 1);
              else setScreen("splash");
            }}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={28} color={theme.brandPrimary} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LanguageSwitcher />
            <Pressable onPress={skipOnboarding} hitSlop={12}>
              <Text style={styles.skipText}>{t.common.skip}</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.artworkWrap}>
          <Artwork type={item.artwork} />
        </View>
        <View style={styles.onboardingCopy}>
          <Text style={styles.onboardingTitle}>{item.title}</Text>
          <Text style={styles.onboardingDescription}>{item.description}</Text>
          <View style={styles.pagination}>
            {onboarding.map((_, index) => (
              <View key={index} style={[styles.pageDot, index === slide && styles.pageDotActive]} />
            ))}
          </View>
          <Pressable testID="onboarding-next" onPress={nextSlide} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{item.button}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (screen === "authChoice") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 30, paddingBottom: Math.max(insets.bottom, 20) }]}>
        <ScrollView contentContainerStyle={styles.authChoiceContent} showsVerticalScrollIndicator={false}>
          <View style={styles.authChoiceLogo}>
            <View style={styles.compactLogoCard}>
              <BrandLogo compact />
            </View>
            <Text style={styles.authBrand}>GC Sharp</Text>
            <Text style={styles.authTagline}>{t.common.tagline}</Text>
            <View style={{ marginTop: 10 }}>
              <LanguageSwitcher />
            </View>
          </View>
          <View style={styles.choiceCard}>
            <Text style={styles.choiceTitle}>{t.welcome.welcome}</Text>
            <Text style={styles.choiceDescription}>
              {t.welcome.welcomeDesc}
            </Text>
            <Pressable
              testID="create-account"
              onPress={() => {
                setError(null);
                setRegisterStep("email");
                setScreen("register");
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{t.welcome.createAccount}</Text>
            </Pressable>
            <Pressable
              testID="existing-account"
              onPress={() => {
                setError(null);
                setScreen("login");
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>{t.welcome.haveAccount}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (screen === "login") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <ScrollView
          contentContainerStyle={styles.loginContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginHeader}>
            <View style={styles.smallLogoCard}>
              <BrandLogo compact />
            </View>
            <Text style={styles.loginTitle}>{t.welcome.welcomeBack}</Text>
            <Text style={styles.loginDescription}>
              {savedEmail ? `${t.welcome.enterPinFor} ${savedEmail}` : `${t.welcome.enterPin}.`}
            </Text>
          </View>
          {!savedEmail && (
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t.welcome.emailPlaceholder}
              placeholderTextColor={theme.onSurfaceMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          )}
          <PinInput value={pin} onChange={setPin} disabled={busy} />
          {busy && <ActivityIndicator style={{ marginTop: 14 }} color={theme.brandPrimary} />}
          {error && <Text style={styles.error}>{error}</Text>}
          {biometricAvailable && (
            <Pressable
              testID="biometric-login"
              onPress={biometricLogin}
              disabled={busy}
              style={styles.biometricButton}
            >
              <Ionicons name="finger-print-outline" size={32} color={theme.onBrandTertiary} />
              <Text style={styles.biometricText}>{t.welcome.signInFingerprint}</Text>
            </Pressable>
          )}
          <Pressable onPress={clearSavedAccount} style={styles.linkButton}>
            <Text style={styles.linkText}>{t.welcome.useAnotherAccount}</Text>
          </Pressable>
          {/* Forgot PIN link */}
          <Pressable
            onPress={() => {
              setResetEmail("");
              setResetOtp("");
              setResetNewPin("");
              setResetConfirmPin("");
              setResetError(null);
              setResetSuccess(false);
              setOtpSent(false);
              setResetStep("email");
              setCountdown(0);
              if (countdownInterval.current) clearInterval(countdownInterval.current);
              setScreen("resetPin");
            }}
            style={styles.forgotPinLink}
          >
            <Text style={styles.forgotPinText}>{t.welcome.forgotPin}</Text>
          </Pressable>
          <View style={{ alignSelf: "center", marginTop: 14 }}>
            <LanguageSwitcher />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ---------- Reset PIN with OTP ----------
  if (screen === "resetPin") {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.resetContent, { paddingTop: insets.top + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resetHeader}>
            <Pressable onPress={goBackToLogin} hitSlop={12}>
              <Ionicons name="arrow-back" size={28} color={theme.brandPrimary} />
            </Pressable>
            <Text style={styles.resetTitle}>Reset PIN</Text>
            <View style={{ width: 28 }} />
          </View>

          {resetStep === "email" && (
            <>
              <Text style={styles.resetDescription}>
                Enter your email address and we will send you a 6‑digit OTP to reset your PIN.
              </Text>
              <Text style={styles.inputLabel}>Email address</Text>
              <TextInput
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="your@email.com"
                placeholderTextColor={theme.onSurfaceMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
              {resetError && <Text style={styles.error}>{resetError}</Text>}
              <Pressable
                onPress={requestOtp}
                disabled={resetBusy}
                style={[styles.primaryButton, resetBusy && styles.disabledButton]}
              >
                {resetBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send OTP</Text>
                )}
              </Pressable>
            </>
          )}

          {resetStep === "otp" && (
            <>
              <Text style={styles.resetDescription}>
                A 6‑digit OTP has been sent to <Text style={{ fontWeight: "700" }}>{resetEmail}</Text>.
                Enter the code and your new PIN below.
              </Text>

              <Text style={styles.inputLabel}>OTP Code</Text>
              <TextInput
                value={resetOtp}
                onChangeText={setResetOtp}
                placeholder="Enter 6-digit code"
                placeholderTextColor={theme.onSurfaceMuted}
                keyboardType="number-pad"
                maxLength={6}
                style={styles.input}
              />

              <Text style={styles.inputLabel}>New PIN</Text>
              <PinInput
                value={resetNewPin}
                onChange={setResetNewPin}
                disabled={resetBusy}
              />

              <Text style={styles.inputLabel}>Confirm PIN</Text>
              <PinInput
                value={resetConfirmPin}
                onChange={setResetConfirmPin}
                disabled={resetBusy}
              />

              {resetError && <Text style={styles.error}>{resetError}</Text>}
              {resetSuccess && (
                <View style={styles.successContainer}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                  <Text style={styles.successText}>PIN reset successful! Redirecting...</Text>
                </View>
              )}

              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={resetPinWithOtp}
                  disabled={resetBusy || resetSuccess}
                  style={[styles.primaryButton, (resetBusy || resetSuccess) && styles.disabledButton]}
                >
                  {resetBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Reset PIN</Text>
                  )}
                </Pressable>

                {countdown > 0 ? (
                  <Text style={styles.resendText}>
                    Resend OTP in {countdown}s
                  </Text>
                ) : (
                  <Pressable
                    onPress={requestOtp}
                    disabled={resetBusy}
                    style={styles.resendButton}
                  >
                    <Text style={styles.resendButtonText}>Resend OTP</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Registration screen
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.registerContent,
          { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.registerHeader}>
          <Pressable
            onPress={() => {
              setError(null);
              if (registerStep === "email") {
                setScreen("authChoice");
              } else if (registerStep === "name") {
                setRegisterStep("email");
              } else if (registerStep === "password") {
                setRegisterStep("name");
              } else {
                setRegisterStep("password");
                setPin("");
                setConfirmPin("");
                setConfirmingPin(false);
              }
            }}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={28} color={theme.brandPrimary} />
          </Pressable>
          <Text style={styles.stepText}>Step {registrationProgress} of 4</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressValue, { width: `${registrationProgress * 25}%` }]} />
        </View>

        <View style={styles.registerLogo}>
          <View style={styles.miniLogoCard}>
            <Ionicons name="school" size={31} color={theme.brandPrimary} />
          </View>
        </View>

        {registerStep === "email" && (
          <>
            <Text style={styles.formTitle}>What is your email?</Text>
            <Text style={styles.formDescription}>
              We will use it to identify your GC Sharp account.
            </Text>
            <Text style={styles.inputLabel}>Email address</Text>
            <TextInput
              testID="registration-email"
              value={email}
              onChangeText={setEmail}
              placeholder="student@example.com"
              placeholderTextColor={theme.onSurfaceMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </>
        )}

        {registerStep === "name" && (
          <>
            <Text style={styles.formTitle}>What should we call you?</Text>
            <Text style={styles.formDescription}>
              Enter the name that should appear on your profile.
            </Text>
            <Text style={styles.inputLabel}>Full name</Text>
            <TextInput
              testID="registration-name"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={theme.onSurfaceMuted}
              autoCapitalize="words"
              style={styles.input}
            />
          </>
        )}

        {registerStep === "password" && (
          <>
            <Text style={styles.formTitle}>Create a password</Text>
            <Text style={styles.formDescription}>
              This protects account recovery. Future sign-ins on this device will use your PIN or fingerprint.
            </Text>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                testID="registration-password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={theme.onSurfaceMuted}
                secureTextEntry={!showPassword}
                style={[styles.input, { paddingRight: 52 }]}
              />
              <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.passwordEye}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={theme.onSurfaceMuted} />
              </Pressable>
            </View>
          </>
        )}

        {registerStep === "pin" && (
          <>
            <Text style={styles.formTitle}>
              {confirmingPin ? "Confirm your PIN" : "Create a 6-digit PIN"}
            </Text>
            <Text style={styles.formDescription}>
              {confirmingPin
                ? "Enter the same PIN again."
                : "You will use this PIN for quick sign-in. Avoid obvious combinations such as 123456."}
            </Text>
            <PinInput value={pin} onChange={setPin} disabled={busy} />
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {registerStep !== "pin" ? (
          <Pressable testID="registration-next" onPress={validateRegistrationStep} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={19} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            testID="registration-pin-next"
            onPress={registerAccount}
            disabled={busy || pin.length !== 6}
            style={[styles.primaryButton, (busy || pin.length !== 6) && styles.disabledButton]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {confirmingPin ? "Create Account" : "Confirm PIN"}
              </Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },

  // Loading screen with progress
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface,
    paddingHorizontal: 40,
  },
  loadingTitle: {
    fontSize: 42,
    fontWeight: "800",
    color: t.brandPrimary,
    letterSpacing: -0.5,
  },
  loadingSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: t.onSurfaceMuted,
    letterSpacing: 6,
    marginTop: 2,
    marginBottom: 40,
  },
  progressContainer: {
    width: "100%",
    alignItems: "center",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: t.surfaceTertiary,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: BLUE,
    borderRadius: 3,
  },
  progressText: {
    marginTop: 8,
    fontSize: 14,
    color: t.onSurfaceMuted,
    fontWeight: "600",
  },

  // Splash
  splash: { flex: 1, paddingHorizontal: 28, backgroundColor: "#0F54D6" },
  languageRow: { alignItems: "flex-end" },
  languageButton: {
    minWidth: 116,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 26,
    backgroundColor: "rgba(0, 45, 145, 0.22)",
  },
  languageText: { color: t.onBrandPrimary, fontSize: 17, fontWeight: "700" },
  splashLogo: { flex: 1, alignItems: "center", justifyContent: "center", transform: [{ translateY: -15 }] },
  logoTitle: { marginTop: -15, color: t.onBrandPrimary, fontSize: 49, fontWeight: "600", letterSpacing: 0.5 },
  logoSubtitle: { marginTop: 6, color: "#F5C542", fontSize: 18, fontWeight: "800", letterSpacing: 6 },
  splashButton: { minHeight: 61, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: WHITE },
  splashButtonText: { color: BLUE, fontSize: 17, fontWeight: "800" },

  // Onboarding
  onboardingHeader: { height: 65, paddingHorizontal: 23, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  skipText: { color: t.brandPrimary, fontSize: 17, fontWeight: "800" },
  artworkWrap: { flex: 1, minHeight: 330, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  onboardingCopy: { paddingHorizontal: 29, paddingBottom: 16, alignItems: "center" },
  onboardingTitle: { color: t.brandPrimary, fontSize: 34, lineHeight: 42, fontWeight: "800", textAlign: "center" },
  onboardingDescription: { marginTop: 13, minHeight: 76, color: t.onSurfaceMuted, fontSize: 18, lineHeight: 25, textAlign: "center" },
  pagination: { marginTop: 19, marginBottom: 20, flexDirection: "row", gap: 12 },
  pageDot: { width: 29, height: 11, borderRadius: 8, backgroundColor: t.borderStrong },
  pageDotActive: { width: 84, backgroundColor: t.brandPrimary },

  // Buttons
  primaryButton: {
    width: "100%",
    minHeight: 60,
    paddingHorizontal: 18,
    borderRadius: 13,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    ...shadow1,
  },
  primaryButtonText: { color: t.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  secondaryButton: {
    width: "100%",
    minHeight: 58,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: t.brandPrimary,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surfaceSecondary,
  },
  secondaryButtonText: { color: t.brandPrimary, fontSize: 16, fontWeight: "800" },
  disabledButton: { opacity: 0.5 },

  // AuthChoice
  authChoiceContent: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  authChoiceLogo: { alignItems: "center", marginTop: 40 },
  compactLogoCard: {
    width: 106,
    height: 106,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: BLUE,
    overflow: "hidden",
    ...shadow1,
  },
  authBrand: { marginTop: 20, color: t.onSurface, fontSize: 36, fontWeight: "800" },
  authTagline: { marginTop: 7, color: t.onSurfaceMuted, fontSize: 16 },
  choiceCard: { marginTop: 45, marginBottom: 40, padding: 23, borderRadius: 22, backgroundColor: t.surfaceSecondary, ...shadow1 },
  choiceTitle: { color: t.onSurface, fontSize: 27, fontWeight: "800", textAlign: "center" },
  choiceDescription: { marginTop: 10, marginBottom: 25, color: t.onSurfaceMuted, fontSize: 16, lineHeight: 23, textAlign: "center" },

  // Login
  loginContent: { flexGrow: 1, paddingHorizontal: 27, alignItems: "center", justifyContent: "center" },
  loginHeader: { alignItems: "center", marginBottom: 25 },
  smallLogoCard: { width: 84, height: 84, borderRadius: 23, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: BLUE },
  loginTitle: { marginTop: 20, color: t.onSurface, fontSize: 31, fontWeight: "800" },
  loginDescription: { marginTop: 9, maxWidth: 330, color: t.onSurfaceMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  pinDots: { marginTop: 22, marginBottom: 29, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 17 },
  pinDot: { width: 16, height: 16, borderRadius: 9, borderWidth: 2, borderColor: t.brandPrimary, backgroundColor: t.surfaceSecondary },
  pinDotFilled: { backgroundColor: BLUE },
  keypad: { width: 305, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  key: { width: 82, height: 62, marginBottom: 10, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  keyText: { color: t.onSurface, fontSize: 28, fontWeight: "600" },
  biometricButton: { marginTop: 17, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 28, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.brandTertiary },
  biometricText: { color: t.onBrandTertiary, fontSize: 15, fontWeight: "700" },
  linkButton: { marginTop: 12, padding: 12 },
  linkText: { color: t.brandPrimary, fontWeight: "700" },
  forgotPinLink: { marginTop: 8, padding: 8 },
  forgotPinText: { color: t.onSurfaceMuted, fontSize: 14, textDecorationLine: "underline" },

  // Reset PIN with OTP
  resetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  resetTitle: { fontSize: 20, fontWeight: "700", color: t.onSurface },
  resetContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  resetDescription: {
    fontSize: 16,
    color: t.onSurfaceMuted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 23,
  },
  resendButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  resendButtonText: {
    color: t.brandPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  resendText: {
    textAlign: "center",
    fontSize: 14,
    color: t.onSurfaceMuted,
    marginTop: 4,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  successText: { color: t.success, fontSize: 14, fontWeight: "500" },

  // Registration
  registerContent: { flexGrow: 1, paddingHorizontal: 25 },
  registerHeader: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepText: { color: t.onSurfaceMuted, fontSize: 14, fontWeight: "700" },
  progressValue: { height: "100%", borderRadius: 4, backgroundColor: BLUE },
  registerLogo: { marginTop: 32, marginBottom: 25, alignItems: "center" },
  miniLogoCard: { width: 66, height: 66, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: t.brandTertiary },
  formTitle: { color: t.onSurface, fontSize: 29, lineHeight: 36, fontWeight: "800", textAlign: "center" },
  formDescription: { marginTop: 10, marginBottom: 30, color: t.onSurfaceMuted, fontSize: 16, lineHeight: 23, textAlign: "center" },
  inputLabel: { marginBottom: 8, color: t.onSurface, fontSize: 14, fontWeight: "700" },
  input: {
    width: "100%",
    minHeight: 57,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 13,
    color: t.onSurface,
    fontSize: 16,
    backgroundColor: t.surfaceSecondary,
    marginBottom: 20,
  },
  passwordWrap: { position: "relative" },
  passwordEye: { position: "absolute", top: 8, right: 8, padding: 10 },
  error: { marginTop: 14, marginBottom: 8, color: t.error, fontSize: 14, lineHeight: 20, textAlign: "center" },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});