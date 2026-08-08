# GCSHARP — Product Requirements

**Global Classroom Sharpening Potentials** — a premium AI-powered e-learning app for Cameroon students preparing for GCE O/A, HND, and Concours exams.

## Delivered features (as of iteration 4)

### Auth & onboarding
- JWT email/password (register, login, /me)
- Emergent-managed Google OAuth (session-token exchange)
- 5-step student onboarding wizard (goal, subjects, daily time, level, learning style)
- Student / Teacher role split on Welcome screen

### Student experience
- **Home dashboard** — streak, XP, accuracy cards; quick actions; weekly bar chart; continue-learning card
- **Academic Analytics** — study time, accuracy rate, papers completed (target 20), weekly chart with daily/weekly toggle
- **Past Questions** — Level → Subject → Paper browser; MCQ Paper 1 viewer with progress bar, A/B/C/D options, submit + explanation footer (Previous / Discuss with AI / Next)
- **Custom PDF viewer** — pdf.js in-app WebView at retina (`devicePixelRatio ≥ 2`), status-bar-safe header:
  - Highlight any text → in-PDF popup with 3 actions
  - **Ask GC AI** → bottom sheet → routes to AI tab with the selection seeded
  - **Video** → bottom sheet → `POST /api/ai/solution` (Claude Haiku 4.5) → numbered step cards + narrated playback via `expo-speech`
  - **Draft** → `POST /api/drafts` saves the highlight; view later in **My Drafts** (Profile)
- **AI Assistant tab (GC AI)** — Claude Haiku 4.5 chat with per-user session history; system prompt forces plain-text output with Unicode math (x², √, π, ∫, ≤, ≥, →); front-end `humanize()` strips any residual Markdown/LaTeX
- **Lesson Videos tab** — teacher-uploaded videos with level chip row (All / GCE O / GCE A / HND / Concours); detail screen plays with `expo-video`
- **Library tab** — video course cards with Methodology / Chapters / Practice tabs
- **Profile** — user, streak/level/XP; entries for Stats, My Drafts, Past Questions, AI Tutor, Lessons, Library, Log out

### Teacher experience
- Basic dashboard: student count, courses, monthly views, earnings estimate (90 FCFA × qualified views)
- **Upload lesson** form (title, description, subject, level, video URL, duration) → `POST /api/lessons`

### AI output quality
- System prompts explicitly ban Markdown/LaTeX/backticks and require Unicode math symbols
- Frontend `src/format.ts::humanize()` normalises leftover `**bold**`, `\frac{a}{b}`, `x^{2}`, `\int`, `\pi`, etc. into readable Unicode
- Applied to AI chat, PDF solution step cards, and `expo-speech` narration

### Backend
- FastAPI + Motor MongoDB; `/api/pdfs/*` static mount for seeded PDF papers
- Endpoints: auth (register/login/session/me), users/onboarding, subjects, past-papers, questions/answer, analytics/student, library/courses, lessons (list/detail/upload with role guard), drafts (CRUD), ai/chat, ai/solution, teacher/overview
- Idempotent seed on startup: 17 subjects, 24 MCQ past papers, 2 real 2025 Pure-Math PDF papers, 60 MCQs, 3 library courses, 4 lesson videos, demo student + teacher

## Test credentials
`/app/memory/test_credentials.md`
- Student — `student@gcsmart.cm` / `Student123!`
- Teacher — `teacher@gcsmart.cm` / `Teacher123!`

## Not yet in scope
Paper 2 step-by-step viewer, PDF annotations (highlight, freehand), offline downloads, push notifications, admin dashboard, gamification badges/certificates/leaderboards, live classes, French localisation, real Sora-2 video generation (currently narrated text-to-speech).
