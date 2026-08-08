"""GCSMART backend API tests - matches actual backend contract used by frontend."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://elearning-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"email": "student@gcsmart.cm", "password": "Student123!"}
TEACHER = {"email": "teacher@gcsmart.cm", "password": "Teacher123!"}


@pytest.fixture(scope="session")
def student_token():
    r = requests.post(f"{API}/auth/login", json=STUDENT, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def teacher_token():
    r = requests.post(f"{API}/auth/login", json=TEACHER, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- AUTH ----------
class TestAuth:
    def test_register_new_student(self):
        email = f"test_{uuid.uuid4().hex[:8]}@gcsmart.cm"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "full_name": "Test Student", "role": "student"
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"].lower() == email.lower()
        assert data["user"]["role"] == "student"

    def test_login_student(self, student_token):
        assert isinstance(student_token, str) and len(student_token) > 10

    def test_me(self, student_token):
        r = requests.get(f"{API}/auth/me", headers=h(student_token), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Backend wraps user in {user: {...}}
        u = body.get("user", body)
        assert u["email"] == STUDENT["email"]
        assert u["role"] == "student"


# ---------- ONBOARDING ----------
class TestOnboarding:
    def test_onboarding_persists(self):
        email = f"test_ob_{uuid.uuid4().hex[:8]}@gcsmart.cm"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "full_name": "OB", "role": "student"
        }, timeout=30)
        tok = r.json()["token"]
        # Matches frontend payload keys (see /app/frontend/app/onboarding.tsx)
        payload = {
            "goal": "GCE A",
            "exam_level": "GCE A",
            "subjects": ["Pure Mathematics"],
            "daily_time": "1-2 hours",
            "level": "Intermediate",
            "learning_style": "Visual",
        }
        r2 = requests.post(f"{API}/users/onboarding", json=payload, headers=h(tok), timeout=30)
        assert r2.status_code == 200, r2.text
        me_body = requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).json()
        me = me_body.get("user", me_body)
        assert me.get("onboarded") is True
        assert me.get("exam_level") == "GCE A"


# ---------- CONTENT ----------
class TestContent:
    def test_subjects_gce_a(self):
        r = requests.get(f"{API}/subjects", params={"exam_level": "GCE A"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        subjects = body.get("items", body if isinstance(body, list) else [])
        assert len(subjects) >= 1
        assert all("subject_id" in s and "name" in s for s in subjects)

    def test_past_papers_and_detail(self):
        subs = requests.get(f"{API}/subjects", params={"exam_level": "GCE A"}, timeout=30).json().get("items", [])
        paper = None
        for s in subs:
            body = requests.get(f"{API}/past-papers", params={"subject_id": s["subject_id"]}, timeout=30).json()
            papers = body.get("items", [])
            # Skip PDF-only papers which have no MCQ questions
            mcq_papers = [p for p in papers if not p.get("pdf_url")]
            if mcq_papers:
                paper = mcq_papers[0]
                break
        assert paper is not None, "No MCQ past papers seeded for GCE A"
        r2 = requests.get(f"{API}/past-papers/{paper['paper_id']}", timeout=30)
        assert r2.status_code == 200
        detail = r2.json()
        assert "questions" in detail and len(detail["questions"]) >= 1
        q = detail["questions"][0]
        assert "question_text" in q
        assert "options" in q
        # correct_answer may or may not be exposed — check via answer endpoint instead


def _get_first_question(headers=None):
    subs = requests.get(f"{API}/subjects", params={"exam_level": "GCE A"}, timeout=30).json().get("items", [])
    for s in subs:
        papers = requests.get(f"{API}/past-papers", params={"subject_id": s["subject_id"]}, timeout=30).json().get("items", [])
        if papers:
            pd = requests.get(f"{API}/past-papers/{papers[0]['paper_id']}", timeout=30).json()
            if pd.get("questions"):
                return pd["questions"][0]
    return None


# ---------- QUESTIONS ----------
class TestQuestions:
    def test_answer_returns_correctness(self, student_token):
        q = _get_first_question()
        assert q is not None
        qid = q.get("question_id") or q.get("id")
        r = requests.post(f"{API}/questions/answer", json={
            "question_id": qid,
            "selected": "A"
        }, headers=h(student_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "correct" in data
        assert "correct_answer" in data
        assert "explanation" in data

    def test_answer_with_correct_option(self, student_token):
        q = _get_first_question()
        qid = q.get("question_id") or q.get("id")
        r = requests.post(f"{API}/questions/answer", json={"question_id": qid, "selected": "A"},
                          headers=h(student_token), timeout=30)
        correct = r.json()["correct_answer"]
        r2 = requests.post(f"{API}/questions/answer", json={"question_id": qid, "selected": correct},
                           headers=h(student_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["correct"] is True


# ---------- ANALYTICS ----------
class TestAnalytics:
    def test_analytics_shape(self, student_token):
        r = requests.get(f"{API}/analytics/student", headers=h(student_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["study_hours", "accuracy_rate", "papers_completed", "weekly"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["weekly"], list) and len(d["weekly"]) == 7


# ---------- LIBRARY ----------
class TestLibrary:
    def test_library_courses(self):
        r = requests.get(f"{API}/library/courses", timeout=30)
        assert r.status_code == 200
        body = r.json()
        courses = body.get("items", body if isinstance(body, list) else [])
        assert len(courses) >= 1
        cid = courses[0]["course_id"]
        r2 = requests.get(f"{API}/library/courses/{cid}", timeout=30)
        assert r2.status_code == 200
        body2 = r2.json()
        c = body2.get("course", body2)
        assert "methodology" in c and "chapters" in c


# ---------- TEACHER ----------
class TestTeacher:
    def test_teacher_overview(self, teacher_token):
        r = requests.get(f"{API}/teacher/overview", headers=h(teacher_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["students", "courses", "monthly_views", "earnings_fcfa"]:
            assert k in d, f"missing {k}"


# ---------- AI ----------
class TestAI:
    def test_ai_chat(self, student_token):
        sess = f"TEST_sess_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/ai/chat", json={"message": "Hello", "session_id": sess},
                          headers=h(student_token), timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "reply" in d and isinstance(d["reply"], str) and len(d["reply"].strip()) > 0


# ---------- PDF PAPERS ----------
class TestPdfPapers:
    def test_pmm2_pdf_served(self):
        r = requests.get(f"{API}/pdfs/pmm2.pdf", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 1000  # non-zero, actual PDF
        assert r.content[:4] == b"%PDF"

    def test_pmm3_pdf_served(self):
        r = requests.get(f"{API}/pdfs/pmm3.pdf", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 1000
        assert r.content[:4] == b"%PDF"

    def test_pure_maths_has_pdf_papers(self):
        subs = requests.get(f"{API}/subjects", params={"exam_level": "GCE A"}, timeout=30).json().get("items", [])
        pure = next((s for s in subs if "Pure Mathematics" in s.get("name", "")), None)
        assert pure is not None, f"Pure Mathematics subject not found in: {[s.get('name') for s in subs]}"
        body = requests.get(f"{API}/past-papers", params={"subject_id": pure["subject_id"]}, timeout=30).json()
        papers = body.get("items", [])
        pdf_papers = [p for p in papers if p.get("pdf_url", "").startswith("/api/pdfs/")]
        assert len(pdf_papers) >= 2, f"Expected 2+ PDF papers, got {len(pdf_papers)}: {[(p.get('year'), p.get('paper_number'), p.get('pdf_url')) for p in papers]}"

        years = {p.get("year") for p in pdf_papers}
        assert 2025 in years, f"2025 papers missing: years={years}"

        p2025 = [p for p in pdf_papers if p.get("year") == 2025]
        paper_nums = {p.get("paper_number") for p in p2025}
        assert 2 in paper_nums and 3 in paper_nums, f"Papers 2 & 3 missing: {paper_nums}"

        for p in p2025:
            # subject_name should be 'Pure Mathematics with Mechanics'
            assert "Pure Mathematics" in (p.get("subject_name") or ""), p
