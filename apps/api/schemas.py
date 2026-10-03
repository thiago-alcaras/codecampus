from pydantic import BaseModel, Field, field_validator
from typing import Literal
from datetime import date


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class UserIn(LoginIn):
    name: str = Field(min_length=2, max_length=120)
    role: Literal["admin", "teacher", "student", "guardian"]

    @field_validator("password")
    @classmethod
    def strong_password(cls, value):
        if len(value) < 12:
            raise ValueError("Use pelo menos 12 caracteres.")
        return value

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        if (
            "@" not in value
            or "." not in value.split("@")[-1]
            or any(c.isspace() for c in value)
        ):
            raise ValueError("E-mail inválido.")
        return value.strip().lower()


class PasswordIn(BaseModel):
    current: str = Field(max_length=128)
    password: str = Field(min_length=12, max_length=128)


class ClassIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=5000)
    teacher_id: str
    age_band: str = Field(default="14–17 anos", max_length=30)
    schedule: str = Field(default="", max_length=120)
    color: Literal["purple", "mint", "orange", "blue"] = "purple"


class EnrollmentIn(BaseModel):
    student_id: str


class GuardianIn(EnrollmentIn):
    guardian_id: str
    consent_confirmed: bool


class ActiveIn(BaseModel):
    active: bool


class ResetPasswordIn(BaseModel):
    password: str = Field(min_length=12, max_length=128)


class ModuleIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=5000)
    position: int = Field(default=1, ge=1, le=1000)


class LessonIn(ModuleIn):
    body: str = Field(default="", max_length=50000)
    video_url: str = Field(default="", max_length=1000)
    minutes: int = Field(default=30, ge=1, le=600)
    published: bool = False


class RubricItem(BaseModel):
    label: str = Field(min_length=2, max_length=100)
    weight: int = Field(ge=1, le=100)


class AssignmentIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10, max_length=10000)
    due_at: int = Field(gt=0)
    rubric: list[RubricItem] = Field(min_length=1, max_length=10)

    @field_validator("rubric")
    @classmethod
    def total(cls, value):
        if sum(r.weight for r in value) != 100:
            raise ValueError("Pesos devem somar 100.")
        return value


class SubmissionIn(BaseModel):
    repository_url: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=10000)
    asset_id: str | None = None


class GradeIn(BaseModel):
    scores: list[int] = Field(min_length=1, max_length=10)
    feedback: str = Field(min_length=3, max_length=10000)

    @field_validator("scores")
    @classmethod
    def score_bounds(cls, value):
        if any(s < 0 or s > 100 for s in value):
            raise ValueError("Notas entre 0 e 100.")
        return value


class Question(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=6)
    correct: int = Field(ge=0, le=5)

    @field_validator("options")
    @classmethod
    def valid_options(cls, value):
        if any(not o.strip() or len(o) > 1000 for o in value):
            raise ValueError("Alternativas inválidas.")
        return value


class ExamIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    duration_minutes: int = Field(ge=1, le=180)
    questions: list[Question] = Field(min_length=1, max_length=100)
    published: bool = False

    @field_validator("questions")
    @classmethod
    def valid_correct(cls, value):
        if any(q.correct >= len(q.options) for q in value):
            raise ValueError("Gabarito inválido.")
        return value


class AnswersIn(BaseModel):
    answers: dict[str, int] = Field(default_factory=dict, max_length=100)


class EventIn(BaseModel):
    kind: Literal[
        "tab_hidden",
        "window_blur",
        "fullscreen_exit",
        "copy_attempt",
        "paste_attempt",
        "print_shortcut",
        "context_menu",
    ]


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=2, max_length=10000)


class AttendanceIn(BaseModel):
    date: date
    present: dict[str, bool] = Field(max_length=500)
