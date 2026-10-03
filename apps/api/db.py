import os
from pathlib import Path
from sqlalchemy import (
    create_engine,
    event,
    Column,
    String,
    Integer,
    Text,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    JSON,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATA = Path(os.getenv("DATA_DIR", "data")).resolve()
DATA.mkdir(parents=True, exist_ok=True)
URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA / 'codecampus.db'}")
engine = create_engine(
    URL,
    connect_args={"check_same_thread": False, "timeout": 30}
    if URL.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)
if URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def pragmas(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")


Session = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(254), unique=True, nullable=False)
    password = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)
    active = Column(Boolean, default=True, nullable=False)


class LoginSession(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True)
    user_id = Column(ForeignKey("users.id"), nullable=False)
    csrf = Column(String, nullable=False)
    expires = Column(Integer, nullable=False)


class Classroom(Base):
    __tablename__ = "classrooms"
    id = Column(String, primary_key=True)
    title = Column(String(160), nullable=False)
    description = Column(Text, default="")
    teacher_id = Column(ForeignKey("users.id"), nullable=False)
    age_band = Column(String(30), nullable=False)
    schedule = Column(String(120), default="")
    color = Column(String(20), default="purple")


class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    __table_args__ = (UniqueConstraint("classroom_id", "student_id"),)


class GuardianLink(Base):
    __tablename__ = "guardian_links"
    id = Column(String, primary_key=True)
    guardian_id = Column(ForeignKey("users.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    consent_at = Column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint("guardian_id", "student_id"),)


class Module(Base):
    __tablename__ = "modules"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, default="")
    position = Column(Integer, default=1)


class Lesson(Base):
    __tablename__ = "lessons"
    id = Column(String, primary_key=True)
    module_id = Column(ForeignKey("modules.id"), nullable=False)
    title = Column(String(160), nullable=False)
    body = Column(Text, default="")
    video_url = Column(String(1000), default="")
    minutes = Column(Integer, default=30)
    position = Column(Integer, default=1)
    published = Column(Boolean, default=False)


class Progress(Base):
    __tablename__ = "progress"
    id = Column(String, primary_key=True)
    lesson_id = Column(ForeignKey("lessons.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    completed_at = Column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint("lesson_id", "student_id"),)


class Asset(Base):
    __tablename__ = "assets"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    owner_id = Column(ForeignKey("users.id"), nullable=False)
    lesson_id = Column(ForeignKey("lessons.id"))
    name = Column(String(200), nullable=False)
    size = Column(Integer, nullable=False)
    mime = Column(String(100), nullable=False)
    created_at = Column(Integer, nullable=False)
    # Storage keys are random IDs, never client-supplied paths.


class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=False)
    due_at = Column(Integer, nullable=False)
    rubric = Column(JSON, nullable=False)


class Submission(Base):
    __tablename__ = "submissions"
    id = Column(String, primary_key=True)
    assignment_id = Column(ForeignKey("assignments.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    repository_url = Column(String(1000), default="")
    notes = Column(Text, default="")
    asset_id = Column(ForeignKey("assets.id"))
    submitted_at = Column(Integer, nullable=False)
    version = Column(Integer, nullable=False)
    grade = Column(Integer)
    feedback = Column(Text, default="")
    rubric_scores = Column(JSON)
    __table_args__ = (UniqueConstraint("assignment_id", "student_id", "version"),)


class Exam(Base):
    __tablename__ = "exams"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    title = Column(String(160), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    questions = Column(JSON, nullable=False)
    published = Column(Boolean, default=False)


class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(String, primary_key=True)
    exam_id = Column(ForeignKey("exams.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    started_at = Column(Integer, nullable=False)
    deadline = Column(Integer, nullable=False)
    finished_at = Column(Integer)
    questions = Column(JSON, nullable=False)
    answers = Column(JSON, default=dict)
    grade = Column(Integer)
    __table_args__ = (UniqueConstraint("exam_id", "student_id"),)


class ExamEvent(Base):
    __tablename__ = "exam_events"
    id = Column(String, primary_key=True)
    attempt_id = Column(ForeignKey("attempts.id"), nullable=False)
    kind = Column(String(40), nullable=False)
    created_at = Column(Integer, nullable=False)


class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    author_id = Column(ForeignKey("users.id"), nullable=False)
    title = Column(String(160), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(Integer, nullable=False)


class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    date = Column(String(10), nullable=False)
    present = Column(Boolean, nullable=False)
    __table_args__ = (UniqueConstraint("classroom_id", "student_id", "date"),)


class Audit(Base):
    __tablename__ = "audit"
    id = Column(String, primary_key=True)
    actor_id = Column(ForeignKey("users.id"))
    action = Column(String(80), nullable=False)
    target = Column(String(100), nullable=False)
    created_at = Column(Integer, nullable=False)


class RateBucket(Base):
    __tablename__ = "rate_buckets"
    id = Column(String, primary_key=True)
    count = Column(Integer, nullable=False)
    reset_at = Column(Integer, nullable=False)


class Certificate(Base):
    __tablename__ = "certificates"
    id = Column(String, primary_key=True)
    classroom_id = Column(ForeignKey("classrooms.id"), nullable=False)
    student_id = Column(ForeignKey("users.id"), nullable=False)
    issued_by = Column(ForeignKey("users.id"), nullable=False)
    student_name = Column(String(120), nullable=False)
    classroom_title = Column(String(160), nullable=False)
    minutes = Column(Integer, nullable=False)
    issued_at = Column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint("classroom_id", "student_id"),)
