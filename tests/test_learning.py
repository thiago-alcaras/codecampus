from sqlalchemy import select
from apps.api.db import Session, User, Enrollment, Progress
from fastapi.testclient import TestClient
from apps.api.main import app


def test_learning_overview_uses_only_visible_courses_and_students(campus):
    clients, ids = campus
    student = clients["student"].get("/api/learning-overview").json()
    assert [c["id"] for c in student["courses"]] == [ids["class"]]
    course = student["courses"][0]
    assert course["lessons"] == 24
    assert course["completed"] == 2
    assert course["progress"] == 8
    assert course["next_lesson"]["title"] == "Planejamento e retrospectiva"
    assert len(student["history"]) == 2
    assert all(h["classroom_id"] == ids["class"] for h in student["history"])
    guardian = clients["guardian"].get("/api/learning-overview").json()
    assert guardian["courses"][0]["progress"] == 8
    assert guardian["courses"][0]["next_lesson"] is None
    teacher = clients["teacher"].get("/api/learning-overview").json()
    assert len(teacher["courses"]) == 3
    assert all(c["next_lesson"] is None for c in teacher["courses"])


def test_completion_updates_next_lesson_and_history(campus):
    clients, ids = campus
    overview = clients["student"].get("/api/learning-overview").json()
    next_id = overview["courses"][0]["next_lesson"]["id"]
    assert (
        clients["student"].post(f"/api/lessons/{next_id}/complete").status_code == 200
    )
    updated = clients["student"].get("/api/learning-overview").json()
    assert updated["courses"][0]["completed"] == 3
    assert updated["courses"][0]["next_lesson"]["id"] != next_id
    assert updated["history"][0]["lesson_id"] == next_id


def test_drafts_and_removed_enrollments_do_not_count_as_completion(campus):
    clients, ids = campus
    draft = clients["teacher"].post(
        f"/api/modules/{ids['module']}/lessons",
        json={"title": "Rascunho privado", "published": False, "position": 1},
    )
    assert draft.status_code == 201
    student_view = clients["student"].get("/api/learning-overview").json()
    assert student_view["courses"][0]["lessons"] == 24
    assert student_view["courses"][0]["drafts"] == 0
    assert student_view["courses"][0]["next_lesson"]["id"] != draft.json()["id"]
    with Session() as db:
        student = db.scalar(select(User).where(User.role == "student"))
        enrollment = db.scalar(
            select(Enrollment).where(Enrollment.student_id == student.id)
        )
        db.delete(enrollment)
        db.commit()
        assert db.scalar(select(Progress.id))
    overview = clients["teacher"].get("/api/learning-overview").json()
    course = next(c for c in overview["courses"] if c["id"] == ids["class"])
    assert course["completed"] == 0
    assert course["total"] == 0
    assert course["drafts"] == 1
    assert not overview["history"]
    dashboard = clients["teacher"].get("/api/dashboard").json()
    assert dashboard["completed"] == 0
    assert dashboard["progress"] == 0
    assert clients["student"].get("/api/learning-overview").json() == {
        "courses": [],
        "history": [],
    }


def test_instructor_course_management_and_student_report_are_scoped(campus):
    clients, ids = campus
    with Session() as db:
        teacher = db.scalar(select(User).where(User.role == "teacher"))
        student = db.scalar(select(User).where(User.role == "student"))
        tid, sid = teacher.id, student.id
    body = {"title": "Nova oficina", "teacher_id": tid}
    assert clients["teacher"].post("/api/classrooms", json=body).status_code == 201
    assert clients["student"].post("/api/classrooms", json=body).status_code == 403
    body["teacher_id"] = sid
    assert clients["teacher"].post("/api/classrooms", json=body).status_code == 403
    url = f"/api/reports/{ids['class']}/students/{sid}"
    report = clients["teacher"].get(url)
    assert report.status_code == 200
    assert report.json()["summary"]["progress"] == 8
    assert len(report.json()["lessons"]) == 24
    assert sum(bool(l["completed_at"]) for l in report.json()["lessons"]) == 2
    assert clients["student"].get(url).status_code == 403
    assert clients["guardian"].get(url).status_code == 403
    assert (
        clients["teacher"]
        .get(f"/api/reports/{ids['other']}/students/{sid}")
        .status_code
        == 404
    )

    other = (
        clients["admin"]
        .post(
            "/api/users",
            json={
                "name": "Outro professor",
                "email": "outro@demo.codecampus.test",
                "password": "PrivateDemo!2026",
                "role": "teacher",
            },
        )
        .json()
    )
    with TestClient(app) as outsider:
        identity = outsider.post(
            "/api/auth/login",
            json={"email": other["email"], "password": "PrivateDemo!2026"},
        ).json()
        outsider.headers["x-csrf-token"] = identity["csrf"]
        assert outsider.get(url).status_code == 403
        assert outsider.get("/api/learning-overview").json()["courses"] == []
        assert (
            outsider.put(
                f"/api/classrooms/{ids['class']}",
                json={"title": "Mudança proibida", "teacher_id": other["id"]},
            ).status_code
            == 403
        )
    assert (
        clients["teacher"]
        .put(
            f"/api/classrooms/{ids['class']}",
            json={"title": "Mudança permitida", "teacher_id": tid},
        )
        .status_code
        == 200
    )
    assert (
        clients["teacher"]
        .put(
            f"/api/classrooms/{ids['class']}",
            json={"title": "Troca proibida", "teacher_id": other["id"]},
        )
        .status_code
        == 403
    )
