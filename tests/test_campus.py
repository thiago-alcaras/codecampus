from fastapi.testclient import TestClient
from sqlalchemy import select
from apps.api.main import app
from apps.api.db import Session, Attempt, User, LoginSession, ExamEvent, Classroom
from apps.api.security import now, verify_password


def test_login_cookie_and_security_headers(campus):
    clients, ids = campus
    response = clients["student"].get("/api/auth/me")
    assert "password" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    response = TestClient(app).post(
        "/api/auth/login",
        json={"email": "student@demo.codecampus.test", "password": "Aprender!2026"},
    )
    assert (
        "HttpOnly" in response.headers["set-cookie"]
        and "SameSite=strict" in response.headers["set-cookie"]
    )


def test_csrf_and_origin_rejected(campus):
    clients, ids = campus
    client = clients["student"]
    assert (
        client.post("/api/auth/logout", headers={"x-csrf-token": ""}).status_code == 403
    )
    assert (
        client.post(
            "/api/auth/logout", headers={"origin": "https://evil.example"}
        ).status_code
        == 403
    )


def test_student_class_isolation(campus):
    clients, ids = campus
    assert len(clients["student"].get("/api/classrooms").json()) == 1
    assert (
        clients["student"].get(f"/api/classrooms/{ids['other']}/modules").status_code
        == 403
    )
    assert clients["student"].get("/api/users").status_code == 403
    assert clients["student"].post("/api/classrooms", json={}).status_code in (403, 422)


def test_teacher_isolation(campus):
    clients, ids = campus
    teacher = (
        clients["admin"]
        .post(
            "/api/users",
            json={
                "name": "Outro professor",
                "email": "other@example.test",
                "password": "SenhaForte!123",
                "role": "teacher",
            },
        )
        .json()
    )
    with Session() as db:
        row = db.get(Classroom, ids["other"])
        row.teacher_id = teacher["id"]
        db.commit()
    assert (
        clients["teacher"].get(f"/api/classrooms/{ids['other']}/modules").status_code
        == 403
    )


def test_account_deactivation_revokes_sessions(campus):
    clients, ids = campus
    assert (
        clients["admin"]
        .patch(f"/api/users/{ids['student']}", json={"active": False})
        .status_code
        == 200
    )
    assert clients["student"].get("/api/auth/me").status_code == 401


def test_password_revokes_all_sessions(campus):
    clients, ids = campus
    assert (
        clients["student"]
        .post(
            "/api/auth/password",
            json={"current": "wrong", "password": "NewPassword!2026"},
        )
        .status_code
        == 400
    )
    assert (
        clients["student"]
        .post(
            "/api/auth/password",
            json={"current": "Aprender!2026", "password": "NewPassword!2026"},
        )
        .status_code
        == 200
    )
    assert clients["student"].get("/api/auth/me").status_code == 401
    with Session() as db:
        assert verify_password(
            "NewPassword!2026", db.get(User, ids["student"]).password
        )


def test_draft_lessons_and_progress(campus):
    clients, ids = campus
    lesson = (
        clients["teacher"]
        .post(
            f"/api/modules/{ids['module']}/lessons",
            json={"title": "Aula secreta", "body": "Em preparação", "published": False},
        )
        .json()
    )
    modules = clients["student"].get(f"/api/classrooms/{ids['class']}/modules").json()
    assert lesson["id"] not in [l["id"] for m in modules for l in m["lessons"]]
    assert (
        clients["student"].post(f"/api/lessons/{lesson['id']}/complete").status_code
        == 404
    )
    assert (
        clients["student"].post(f"/api/lessons/{ids['lesson']}/complete").status_code
        == 200
    )
    assert (
        clients["student"].post(f"/api/lessons/{ids['lesson']}/complete").status_code
        == 200
    )


def test_upload_private_and_download(campus):
    clients, ids = campus
    result = clients["teacher"].post(
        f"/api/classrooms/{ids['class']}/assets",
        files={"file": ("../../guia.pdf", b"%PDF-1.4\nhello", "application/pdf")},
    )
    assert result.status_code == 201
    asset = result.json()
    assert asset["name"] == "guia.pdf"
    assert (
        clients["student"]
        .get(f"/api/assets/{asset['id']}/download")
        .content.startswith(b"%PDF-")
    )
    assert TestClient(app).get(f"/api/assets/{asset['id']}/download").status_code == 401
    assert TestClient(app).get(f"/static/{asset['id']}").status_code == 404


def test_invalid_and_oversized_upload(campus, monkeypatch):
    from apps.api import storage

    clients, ids = campus
    path = f"/api/classrooms/{ids['class']}/assets"
    assert (
        clients["teacher"]
        .post(path, files={"file": ("evil.html", b"<script/>")})
        .status_code
        == 422
    )
    assert (
        clients["teacher"]
        .post(path, files={"file": ("fake.pdf", b"not PDF")})
        .status_code
        == 422
    )
    monkeypatch.setattr(storage, "MAX_BYTES", 4)
    assert (
        clients["teacher"]
        .post(path, files={"file": ("data.txt", b"12345")})
        .status_code
        == 413
    )


def test_project_versions_rubric_and_grading(campus):
    clients, ids = campus
    path = f"/api/assignments/{ids['assignment']}/submissions"
    assert (
        clients["student"]
        .post(path, json={"repository_url": "javascript:alert(1)"})
        .status_code
        == 422
    )
    a = (
        clients["student"]
        .post(
            path,
            json={
                "repository_url": "https://github.com/example/demo",
                "notes": "Minha versão",
            },
        )
        .json()
    )
    b = (
        clients["student"]
        .post(path, json={"repository_url": "https://github.com/example/demo"})
        .json()
    )
    assert a["version"] == 1 and b["version"] == 2
    grade_path = f"/api/submissions/{b['id']}/grade"
    assert (
        clients["student"]
        .post(grade_path, json={"scores": [90, 80, 100], "feedback": "Bom trabalho"})
        .status_code
        == 403
    )
    result = clients["teacher"].post(
        grade_path,
        json={"scores": [90, 80, 100], "feedback": "Bom trabalho, revise os testes."},
    )
    assert result.json()["grade"] == 89
    assert len(clients["guardian"].get("/api/submissions").json()) == 2


def test_cross_student_asset_access(campus):
    clients, ids = campus
    asset = (
        clients["student"]
        .post(
            f"/api/classrooms/{ids['class']}/assets",
            files={"file": ("projeto.txt", b"private")},
        )
        .json()
    )
    other = (
        clients["admin"]
        .post(
            "/api/users",
            json={
                "name": "Outro aluno",
                "email": "other@example.test",
                "password": "Password123!",
                "role": "student",
            },
        )
        .json()
    )
    clients["admin"].post(
        f"/api/classrooms/{ids['class']}/enrollments", json={"student_id": other["id"]}
    )
    client = TestClient(app)
    auth = client.post(
        "/api/auth/login", json={"email": other["email"], "password": "Password123!"}
    ).json()
    client.headers["x-csrf-token"] = auth["csrf"]
    assert client.get(f"/api/assets/{asset['id']}/download").status_code == 403
    assert (
        client.post(
            f"/api/assignments/{ids['assignment']}/submissions",
            json={"asset_id": asset["id"]},
        ).status_code
        == 403
    )
    assert (
        clients["guardian"].get(f"/api/assets/{asset['id']}/download").status_code
        == 403
    )
    assert (
        clients["teacher"].get(f"/api/assets/{asset['id']}/download").status_code == 200
    )


def test_exam_key_hidden_and_start_idempotent(campus):
    clients, ids = campus
    student = clients["student"]
    assert "correct" not in student.get("/api/exams").text
    first = student.post(f"/api/exams/{ids['exam']}/start").json()
    second = student.post(f"/api/exams/{ids['exam']}/start").json()
    assert first["id"] == second["id"] and first["deadline"] == second["deadline"]
    assert "correct" not in str(first)
    assert (
        clients["guardian"].post(f"/api/exams/{ids['exam']}/start").status_code == 403
    )


def test_exam_autosave_finish_and_no_retake(campus):
    clients, ids = campus
    student = clients["student"]
    attempt = student.post(f"/api/exams/{ids['exam']}/start").json()
    with Session() as db:
        keys = {
            str(i): q["correct"]
            for i, q in enumerate(db.get(Attempt, attempt["id"]).questions)
        }
    assert (
        student.put(
            f"/api/attempts/{attempt['id']}/answers", json={"answers": keys}
        ).status_code
        == 200
    )
    result = student.post(f"/api/attempts/{attempt['id']}/finish").json()
    assert result["grade"] == 100
    assert (
        student.put(
            f"/api/attempts/{attempt['id']}/answers", json={"answers": {"0": 0}}
        ).status_code
        == 409
    )
    assert student.post(f"/api/exams/{ids['exam']}/start").json()["finished_at"]
    assert student.post(f"/api/attempts/{attempt['id']}/finish").json()["grade"] == 100


def test_exam_deadline_server_side(campus):
    clients, ids = campus
    student = clients["student"]
    attempt = student.post(f"/api/exams/{ids['exam']}/start").json()
    with Session() as db:
        row = db.get(Attempt, attempt["id"])
        row.deadline = now() - 1
        db.commit()
    assert (
        student.put(
            f"/api/attempts/{attempt['id']}/answers", json={"answers": {"0": 0}}
        ).status_code
        == 409
    )
    assert student.post(f"/api/attempts/{attempt['id']}/finish").json()["grade"] == 0


def test_exam_answers_validation_and_events(campus):
    clients, ids = campus
    student = clients["student"]
    attempt = student.post(f"/api/exams/{ids['exam']}/start").json()
    for answers in [{"999": 0}, {"0": 99}, {"-1": 0}, {"00": 0}]:
        assert (
            student.put(
                f"/api/attempts/{attempt['id']}/answers", json={"answers": answers}
            ).status_code
            == 422
        )
    assert (
        student.post(
            f"/api/attempts/{attempt['id']}/events", json={"kind": "tab_hidden"}
        ).status_code
        == 200
    )
    assert (
        student.post(
            f"/api/attempts/{attempt['id']}/events", json={"kind": "arbitrary"}
        ).status_code
        == 422
    )
    assert (
        clients["teacher"]
        .get(f"/api/exams/{ids['exam']}/results")
        .json()[0]["events"][0]["kind"]
        == "tab_hidden"
    )


def test_attendance_and_report(campus):
    clients, ids = campus
    path = f"/api/classrooms/{ids['class']}/attendance"
    assert (
        clients["teacher"]
        .put(path, json={"date": "2026-10-03", "present": {ids["student"]: True}})
        .status_code
        == 200
    )
    assert clients["student"].get(path).json()[0]["present"] is True
    assert (
        clients["student"]
        .put(path, json={"date": "2026-10-03", "present": {}})
        .status_code
        == 403
    )
    report = clients["teacher"].get(f"/api/reports/{ids['class']}").json()
    assert report[0]["attendance"] == 100


def test_audit_no_secrets(campus):
    clients, ids = campus
    response = clients["admin"].get("/api/audit")
    assert response.status_code == 200 and "auth.login" in response.text
    assert "Aprender!" not in response.text
    assert clients["teacher"].get("/api/audit").status_code == 403


def test_login_rate_limit(campus):
    client = TestClient(app)
    for _ in range(8):
        response = client.post(
            "/api/auth/login",
            json={"email": "missing@example.test", "password": "wrong"},
        )
    assert response.status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "missing@example.test", "password": "wrong"},
        ).status_code
        == 429
    )


def test_enrollment_removal_blocks_access(campus):
    clients, ids = campus
    clients["admin"].delete(
        f"/api/classrooms/{ids['class']}/enrollments/{ids['student']}"
    )
    assert clients["student"].get("/api/classrooms").json() == []
    assert (
        clients["student"].get(f"/api/classrooms/{ids['class']}/modules").status_code
        == 403
    )


def test_invalid_rubric(campus):
    clients, ids = campus
    result = clients["teacher"].post(
        f"/api/classrooms/{ids['class']}/assignments",
        json={
            "title": "Projeto",
            "description": "Um desafio de programação",
            "due_at": now() + 1000,
            "rubric": [{"label": "Código", "weight": 50}],
        },
    )
    assert result.status_code == 422
