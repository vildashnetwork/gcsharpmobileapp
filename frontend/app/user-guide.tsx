import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useLanguage } from "@/src/i18n";

type GuideSection = {
  id: string;
  icon: string;
  en: string;
  fr: string;
  roles: ("student" | "teacher")[];
  stepsEn: string[];
  stepsFr: string[];
};

const SECTIONS: GuideSection[] = [
  {
    id: "tabs", icon: "home-outline", en: "Bottom tabs — getting around",
    fr: "Onglets du bas — se repérer",
    roles: ["student", "teacher"],
    stepsEn: [
      "Home: your dashboard — streak, XP, recent papers, lesson videos and GC AI suggestions.",
      "Lessons: watch teacher video lessons. Tap a video, then tap the teacher row to open their profile and follow them.",
      "AI Tutor (center button): chat with GC AI — type, dictate with the mic, or tap Listen on any answer.",
      "Groups (students): study groups with classmates in your exam level — chat, voice notes, papers and @GC AI.",
      "Profile: your photo, stats, drafts, settings, language and this guide.",
      "Upload (teachers): publish video lessons from your device or a link.",
    ],
    stepsFr: [
      "Accueil : tableau de bord — série, PX, épreuves récentes, leçons vidéo et suggestions de GC AI.",
      "Leçons : regardez les leçons vidéo. Touchez la ligne de l'enseignant pour ouvrir son profil et le suivre.",
      "Tuteur IA (bouton central) : discutez avec GC AI — écrivez, dictez au micro ou touchez Écouter sur une réponse.",
      "Groupes (élèves) : groupes d'étude de votre niveau — chat, notes vocales, épreuves et @GC AI.",
      "Profil : photo, statistiques, brouillons, réglages, langue et ce guide.",
      "Publier (enseignants) : publiez des leçons vidéo depuis votre appareil ou un lien.",
    ],
  },
  {
    id: "papers", icon: "document-text-outline", en: "Past questions & PDF papers",
    fr: "Annales et épreuves PDF",
    roles: ["student", "teacher"],
    stepsEn: [
      "Open Past Questions from Home or Profile, pick your exam level and subject, then a paper.",
      "Inside the paper, highlight any question text: a menu offers Ask GC AI, Video solution or Save as draft.",
      "Ask GC AI opens the AI chat with your question pre-filled.",
      "Video solution generates a narrated step-by-step walkthrough you can listen to.",
      "Send to study group posts the highlighted question (with page number) straight into a group chat.",
      "Use the download pill to keep the paper offline; reopen it anytime from PDF Downloads.",
      "Teachers see every exam category and can toggle several at once; students see their own programme.",
    ],
    stepsFr: [
      "Ouvrez Annales depuis l'Accueil ou le Profil, choisissez niveau, matière puis épreuve.",
      "Dans l'épreuve, surlignez une question : un menu propose Demander à GC AI, Solution vidéo ou Brouillon.",
      "Demander à GC AI ouvre le chat IA avec votre question pré-remplie.",
      "Solution vidéo génère une correction narrée étape par étape à écouter.",
      "Envoyer au groupe poste la question surlignée (avec page) dans un chat de groupe.",
      "Téléchargez l'épreuve pour la garder hors ligne ; retrouvez-la dans Téléchargements PDF.",
      "Les enseignants voient toutes les catégories et peuvent en cocher plusieurs ; les élèves voient leur filière.",
    ],
  },
  {
    id: "ai", icon: "sparkles-outline", en: "AI Tutor chat",
    fr: "Chat Tuteur IA",
    roles: ["student", "teacher"],
    stepsEn: [
      "Type a question or tap a starter suggestion. GC AI streams the answer with steps and a Final answer line.",
      "Tap the mic: speak, pause, and your words are sent automatically. GC AI can read replies aloud.",
      "Every assistant message has Copy, Listen and thumbs up/down to rate the answer.",
      "Swipe a message or use the attach button to quote it in a follow-up.",
      "Open the menu (top-left) for chat history: pin, rename-by-first-words, reopen or delete chats.",
      "GC AI learns: once a question is answered with web research it is stored, so next time it answers instantly.",
    ],
    stepsFr: [
      "Écrivez une question ou touchez une suggestion. GC AI répond avec étapes et ligne Réponse finale.",
      "Touchez le micro : parlez, marquez une pause, vos mots sont envoyés. GC AI peut lire les réponses à voix haute.",
      "Chaque réponse a Copier, Écouter et pouces haut/bas pour noter.",
      "Balayez un message ou utilisez joindre pour le citer dans la suite.",
      "Ouvrez le menu (en haut à gauche) : historique, épingler, rouvrir ou supprimer les chats.",
      "GC AI apprend : une question documentée est mémorisée et répondue instantanément la fois suivante.",
    ],
  },

  {
    id: "groups", icon: "people-outline", en: "Study groups (students)",
    fr: "Groupes d'étude (élèves)",
    roles: ["student"],
    stepsEn: [
      "Open the Groups tab: My groups lists yours, Discover shows groups in your exam level.",
      "Create a group with + New — it is tagged with your exam level; you become admin.",
      "Join others via Request, or ask a group admin to invite you from the member list.",
      "Inside a chat: send text, record voice notes with the mic, attach past papers (+ button).",
      "Highlight a question: type or paste it, open + then Highlight Q, and Send to group. From a PDF, highlight and choose Send to study group.",
      "Tag GC AI: type @ and pick GC AI (or @ai) — the whole group sees its answer.",
      "Mention classmates with @Name. The header shows members and who is online; tap it for members, join requests and invites.",
      "If live chat shows reconnecting, tap it to retry — messages still send via backup.",
    ],
    stepsFr: [
      "Ouvrez l'onglet Groupes : Mes groupes liste les vôtres, Découvrir montre ceux de votre niveau.",
      "Créez un groupe avec + Nouveau — étiqueté à votre niveau ; vous êtes admin.",
      "Rejoignez via Demande, ou demandez à un admin de vous inviter depuis la liste des membres.",
      "Dans le chat : texte, notes vocales au micro, annales jointes (bouton +).",
      "Surlignez une question : écrivez/collez-la, ouvrez + puis Question surlignée, Envoyer au groupe. Depuis un PDF, surlignez puis Envoyer au groupe.",
      "Appelez GC AI : tapez @ et choisissez GC AI (ou @ai) — tout le groupe voit sa réponse.",
      "Mentionnez avec @Nom. L'en-tête montre membres et connectés ; touchez-le pour membres, demandes et invitations.",
      "Si le chat affiche reconnexion, touchez pour réessayer — les messages passent quand même.",
    ],
  },
  {
    id: "teachers", icon: "person-outline", en: "Teachers: profile, followers & uploads",
    fr: "Enseignants : profil, abonnés et publications",
    roles: ["teacher"],
    stepsEn: [
      "Open your public profile from the dashboard person icon or Profile > My Teacher Profile.",
      "Set it up with Edit Profile: photo, specialization, institution and bio — followers see this page.",
      "Students follow you from any lesson video or your profile; you get a follower count plus views and earnings.",
      "Publish from the Upload tab: pick a video file (duration and thumbnail are auto-detected) or paste a link.",
      "Find your lessons under My uploads — Edit or Delete any of them anytime.",
      "New lesson? Every follower gets an email and a push notification automatically.",
      "Share your profile with the share icon — the link opens your page inside the app.",
      "Tap your profile photo to zoom: pinch or double-tap to inspect it.",
    ],
    stepsFr: [
      "Ouvrez votre profil public via l'icône du tableau de bord ou Profil > Mon profil enseignant.",
      "Configurez-le dans Modifier le profil : photo, spécialité, établissement et bio — vos abonnés voient cette page.",
      "Les élèves vous suivent depuis vos vidéos ou votre profil ; vous voyez abonnés, vues et gains.",
      "Publiez depuis l'onglet Publier : fichier vidéo (durée et miniature auto-détectées) ou lien.",
      "Retrouvez vos leçons sous Mes publications — modifiez ou supprimez à tout moment.",
      "Nouvelle leçon ? Chaque abonné reçoit automatiquement email et notification.",
      "Partagez votre profil avec l'icône de partage — le lien ouvre votre page dans l'appli.",
      "Touchez votre photo pour zoomer : pincez ou double-touchez pour l'inspecter.",
    ],
  },
  {
    id: "videos", icon: "play-circle-outline", en: "Watching lesson videos",
    fr: "Regarder les leçons vidéo",
    roles: ["student", "teacher"],
    stepsEn: [
      "Lessons and Home show the unified feed: teacher uploads plus library courses.",
      "Under each video, the teacher row shows their live profile photo — tap it to open their profile and follow.",
      "Like, save and watch: views count once per student; saved videos live in your Library.",
      "Voice notes, paper shares and @GC AI all work inside group chats too.",
    ],
    stepsFr: [
      "Leçons et Accueil affichent le fil unifié : publications d'enseignants et cours de la bibliothèque.",
      "Sous chaque vidéo, la ligne enseignant montre sa photo actuelle — touchez-la pour son profil et suivre.",
      "Aimez, enregistrez, regardez : vues comptées une fois par élève ; vidéos enregistrées dans la Bibliothèque.",
      "Notes vocales, partages d'annales et @GC AI fonctionnent aussi dans les chats de groupe.",
    ],
  },
  {
    id: "account", icon: "settings-outline", en: "Account, language & offline",
    fr: "Compte, langue et hors ligne",
    roles: ["student", "teacher"],
    stepsEn: [
      "Profile > Edit Profile: change name, photo, institution, exam level, subjects and (teachers) specialization.",
      "Language switcher in Profile flips the whole app between English and French instantly.",
      "PIN & fingerprint: set a 6-digit PIN; enable biometrics for one-tap sign-in.",
      "Offline: papers, lesson bytes and your profile are cached — the app keeps working without internet and syncs later.",
      "Notifications bell on Home: AI replies, group invites, new lessons from teachers you follow.",
    ],
    stepsFr: [
      "Profil > Modifier : nom, photo, établissement, niveau, matières et (enseignants) spécialité.",
      "Le sélecteur de langue dans Profil bascule toute l'appli entre anglais et français aussitôt.",
      "PIN et biométrie : PIN à 6 chiffres ; activez l'empreinte pour une connexion en un geste.",
      "Hors ligne : épreuves, vidéos et profil en cache — l'appli marche sans internet et se synchronise après.",
      "Cloche de l'Accueil : réponses IA, invitations de groupe, nouvelles leçons de vos enseignants suivis.",
    ],
  },
];

export default function UserGuide() {
  useTheme();
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const role: "student" | "teacher" =
    user?.role === "teacher" || user?.role === "admin" ? "teacher" : "student";
  const fr = lang === "fr";
  const [open, setOpen] = useState<string[]>(["tabs"]);
  const visible = SECTIONS.filter((s) => s.roles.includes(role));

  const toggle = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="user-guide">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.title}>{fr ? "Guide d'utilisation" : "User guide"}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.intro}>
          <Ionicons name="compass-outline" size={26} color={theme.brandPrimary} />
          <Text style={styles.introTxt}>
            {fr
              ? `Bienvenue ${user?.full_name || ""} ! Voici comment naviguer dans GC Sharp en tant qu'${role === "teacher" ? "enseignant" : "élève"}. Touchez une carte pour le pas-à-pas.`
              : `Welcome ${user?.full_name || ""}! Here is how to navigate GC Sharp as a ${role}. Tap a card for the step-by-step.`}
          </Text>
        </View>
        {visible.map((s) => {
          const expanded = open.includes(s.id);
          const title = fr ? s.fr : s.en;
          const steps = fr ? s.stepsFr : s.stepsEn;
          return (
            <View key={s.id} style={styles.card}>
              <Pressable style={styles.cardHead} onPress={() => toggle(s.id)}>
                <View style={styles.cardIcon}>
                  <Ionicons name={s.icon as any} size={20} color={theme.brandPrimary} />
                </View>
                <Text style={styles.cardTitle}>{title}</Text>
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.onSurfaceMuted}
                />
              </Pressable>
              {expanded && (
                <View style={styles.steps}>
                  {steps.map((st, i) => (
                    <View key={i} style={styles.step}>
                      <View style={styles.stepNum}>
                        <Text style={styles.stepNumTxt}>{i + 1}</Text>
                      </View>
                      <Text style={styles.stepTxt}>{st}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        <Text style={styles.footer}>
          {fr ? "GC Sharp — Apprenez plus intelligemment." : "GC Sharp — Learn smarter."}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: t.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  title: { fontSize: 17, fontWeight: "800", color: t.brand },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  intro: {
    flexDirection: "row", gap: 10, backgroundColor: t.brandTertiary,
    padding: spacing.md, borderRadius: radii.md, alignItems: "flex-start",
  },
  introTxt: { flex: 1, color: t.onSurface, fontSize: 13.5, lineHeight: 19 },
  card: {
    backgroundColor: t.surfaceSecondary, borderRadius: radii.md,
    borderWidth: 1, borderColor: t.border, overflow: "hidden", ...shadow1,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: t.surface,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { flex: 1, fontWeight: "800", fontSize: 14.5, color: t.onSurface },
  steps: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  step: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  stepNumTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
  stepTxt: { flex: 1, color: t.onSurface, fontSize: 13.5, lineHeight: 19 },
  footer: { textAlign: "center", color: t.onSurfaceMuted, fontSize: 12, marginTop: 4 },
});

let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => { styles = createStyles(getPaletteSnapshot()); });
