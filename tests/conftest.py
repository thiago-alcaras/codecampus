import os
import tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="codecampus-tests-")
os.environ["APP_ENV"] = "test"
os.environ["STORAGE_BACKEND"] = "local"
import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.db import (
    Base,
    engine,
    Session,
    User,
    Classroom,
    Assignment,
    Exam,
    Module,
    Lesson,
)
from apps.api.cli import seed, DEMO_PASSWORD
from sqlalchemy import select


@pytest.fixture
def campus():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed()
    clients = {}
    for role in ["admin", "teacher", "student", "guardian"]:
        client = TestClient(app)
        response = client.post(
            "/api/auth/login",
            json={"email": f"{role}@demo.codecampus.test", "password": DEMO_PASSWORD},
        )
        assert response.status_code == 200
        client.headers["x-csrf-token"] = response.json()["csrf"]
        clients[role] = client
    with Session() as db:
        final = db.scalar(select(Classroom).where(Classroom.color == "purple"))
        other = db.scalar(select(Classroom).where(Classroom.color == "mint"))
        assignment = db.scalar(
            select(Assignment).where(Assignment.classroom_id == final.id)
        )
        exam = db.scalar(select(Exam).where(Exam.classroom_id == final.id))
        module = db.scalar(select(Module).where(Module.classroom_id == final.id))
        lesson = db.scalar(select(Lesson).where(Lesson.module_id == module.id))
        ids = {
            "class": final.id,
            "other": other.id,
            "assignment": assignment.id,
            "exam": exam.id,
            "module": module.id,
            "lesson": lesson.id,
            "student": db.scalar(select(User.id).where(User.role == "student")),
        }
    yield clients, ids
    for c in clients.values():
        c.close()
