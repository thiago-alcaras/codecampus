import io
from unittest.mock import Mock
import pytest
from sqlalchemy import select
from fastapi import HTTPException
from apps.api.db import (
    Session,
    Progress,
    Lesson,
    Module,
    Assignment,
    Submission,
    Exam,
    Attempt,
    Certificate,
)
from apps.api.security import uid, now
from apps.api import storage


def test_admin_password_recovery(campus):
    clients, ids = campus
    assert (
        clients["teacher"]
        .post(
            f"/api/users/{ids['student']}/reset-password",
            json={"password": "PrivatePassword2026!"},
        )
        .status_code
        == 403
    )
    assert (
        clients["admin"]
        .post(
            f"/api/users/{ids['student']}/reset-password",
            json={"password": "PrivatePassword2026!"},
        )
        .status_code
        == 200
    )
    assert clients["student"].get("/api/auth/me").status_code == 401


def test_exam_edit_preserves_attempts(campus):
    clients, ids = campus
    exam = clients["teacher"].get("/api/exams").json()[0]
    body = {k: exam[k] for k in ["title", "duration_minutes", "published", "questions"]}
    body["title"] = "Título revisado"
    assert (
        clients["teacher"].put(f"/api/exams/{ids['exam']}", json=body).status_code
        == 200
    )
    clients["student"].post(f"/api/exams/{ids['exam']}/start")
    assert (
        clients["teacher"].put(f"/api/exams/{ids['exam']}", json=body).status_code
        == 409
    )


def test_rubric_immutable_after_submission(campus):
    clients, ids = campus
    clients["student"].post(
        f"/api/assignments/{ids['assignment']}/submissions",
        json={"repository_url": "https://example.test/project"},
    )
    a = clients["teacher"].get("/api/assignments").json()
    a = next(a for a in a if a["id"] == ids["assignment"])
    body = {k: a[k] for k in ["title", "description", "due_at", "rubric"]}
    body["rubric"] = [{"label": "Outro critério", "weight": 100}]
    assert (
        clients["teacher"]
        .put(f"/api/assignments/{ids['assignment']}", json=body)
        .status_code
        == 409
    )


def test_asset_deletion_preserves_submission(campus):
    clients, ids = campus
    asset = (
        clients["student"]
        .post(
            f"/api/classrooms/{ids['class']}/assets",
            files={"file": ("project.txt", b"hello")},
        )
        .json()
    )
    clients["student"].post(
        f"/api/assignments/{ids['assignment']}/submissions",
        json={"asset_id": asset["id"]},
    )
    assert clients["student"].delete(f"/api/assets/{asset['id']}").status_code == 409
    other = (
        clients["teacher"]
        .post(
            f"/api/classrooms/{ids['class']}/assets",
            files={"file": ("guide.txt", b"hello")},
        )
        .json()
    )
    assert clients["teacher"].delete(f"/api/assets/{other['id']}").status_code == 200
    assert (
        clients["student"].get(f"/api/assets/{other['id']}/download").status_code == 404
    )


def test_certificate_eligibility_and_private_document(campus):
    clients, ids = campus
    path = f"/api/classrooms/{ids['class']}/certificates/{ids['student']}"
    assert clients["teacher"].post(path).status_code == 409
    with Session() as db:
        existing = set(
            db.scalars(
                select(Progress.lesson_id).where(Progress.student_id == ids["student"])
            )
        )
        for lesson in db.scalars(
            select(Lesson).join(Module).where(Module.classroom_id == ids["class"])
        ):
            if lesson.id not in existing:
                db.add(
                    Progress(
                        id=uid(),
                        lesson_id=lesson.id,
                        student_id=ids["student"],
                        completed_at=now(),
                    )
                )
        db.add(
            Submission(
                id=uid(),
                assignment_id=ids["assignment"],
                student_id=ids["student"],
                version=1,
                submitted_at=now(),
                grade=80,
                notes="Demo",
                repository_url="https://example.test",
            )
        )
        exam = db.get(Exam, ids["exam"])
        db.add(
            Attempt(
                id=uid(),
                exam_id=exam.id,
                student_id=ids["student"],
                started_at=now() - 100,
                deadline=now() + 100,
                finished_at=now(),
                questions=exam.questions,
                answers={},
                grade=90,
            )
        )
        db.commit()
    response = clients["teacher"].post(path)
    assert response.status_code == 201
    certificate = response.json()
    assert certificate["minutes"] == 24 * 60
    assert clients["teacher"].post(path).json()["id"] == certificate["id"]
    assert len(clients["student"].get("/api/certificates").json()) == 1
    assert (
        clients["guardian"]
        .get(f"/api/certificates/{certificate['id']}/document")
        .status_code
        == 200
    )
    from fastapi.testclient import TestClient
    from apps.api.main import app

    assert (
        TestClient(app)
        .get(f"/api/certificates/{certificate['id']}/document")
        .status_code
        == 401
    )


@pytest.mark.parametrize(
    "reply,status",
    [
        (b"stream: OK\0", 200),
        (b"stream: Eicar-Test-Signature FOUND\0", 422),
        (b"stream: scan ERROR\0", 503),
    ],
)
def test_antivirus_fail_closed(monkeypatch, reply, status):
    scanner = Mock()
    scanner.__enter__ = Mock(return_value=scanner)
    scanner.__exit__ = Mock(return_value=False)
    scanner.recv.return_value = reply
    monkeypatch.setattr(storage, "SCANNER_HOST", "test-scanner")
    monkeypatch.setattr(storage.socket, "create_connection", lambda *a, **kw: scanner)
    file = io.BytesIO(b"fake content")
    if status == 200:
        storage.scan_file(file)
    else:
        with pytest.raises(HTTPException) as error:
            storage.scan_file(file)
        assert error.value.status_code == status
    assert file.tell() == 0
