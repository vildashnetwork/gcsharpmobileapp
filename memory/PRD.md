# GCSMART — Product Requirements (MVP v1)

Premium AI-powered e-learning app for Cameroon students preparing for GCE O/A, HND and Concours.

## MVP Scope (delivered)
- **Auth**: JWT email/password (register + login) and Emergent-managed Google OAuth. Bearer-token auth throughout.
- **Onboarding wizard** (5 steps): goal, subjects, daily time, level, learning style.
- **Student Dashboard**: streak / XP / accuracy cards, weekly bar chart, quick actions, continue learning.
- **Academic Analytics screen**: Study Time, Accuracy Rate, Papers Completed (target 20), Weekly Activity chart.
- **Past Questions**: Level chip row (GCE O / GCE A / HND / Concours) → Subject list → Paper list → Paper 1 MCQ viewer with progress bar, A/B/C/D options, submit → green correct-answer explanation, Previous / Discuss with AI / Next footer.
- **AI Assistant (Claude Haiku 4.5 via Emergent LLM key)**: full chat with typing indicator, starter chips, user/AI bubble styling, per-user session history stored in MongoDB.
- **Library**: video course cards with thumbnail, teacher, duration, rating; detail screen with player surface + Methodology / Chapters / Practice tabs.
- **Teacher portal** (basic): students count, courses list, monthly views, earnings estimate (90 FCFA × qualified views).
- **Seeded data**: 17 subjects, 24 past papers, 60 MCQ questions, 3 library courses, demo student + teacher.

## Tech
- **Frontend**: Expo SDK 54, expo-router, TypeScript, expo-secure-store, expo-image, react-native-safe-area-context, @expo/vector-icons (Ionicons).
- **Backend**: FastAPI + motor (MongoDB), bcrypt + PyJWT, emergentintegrations for Claude Haiku 4.5.
- **Design**: navy `#0A192F` brand, bright `#2563EB` primary, white cards on `#F3F4F6`, green success for correct answers.

## Not in this iteration (roadmap)
Paper 2 step-by-step, PDF reader + annotations, offline downloads, push notifications, admin dashboard, gamification (badges/leaderboards), live classes, teacher content upload, French localisation.

## Success signals
Login → onboarding → answer 1 MCQ → chat with AI → open a library video — all in under 90 seconds.
