import os
import random
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    Response,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import FileResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from .db import *
from .security import *
from .schemas import *
from . import storage

ROOT = Path(__file__).resolve().parents[1]


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(
    title="CodeCampus API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if PRODUCTION else "/api/docs",
    redoc_url=None,
)


@app.middleware("http")
async def security_headers(request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin != ORIGIN:
            return Response("Origem não permitida", status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return Response("Origem não permitida", status_code=403)
        length = request.headers.get("content-length")
        if length:
            try:
                size = int(length)
            except ValueError:
                return Response("Tamanho inválido", status_code=400)
            if size < 0:
                return Response("Tamanho inválido", status_code=400)
            if size > storage.MAX_BYTES + 1024 * 1024:
                return Response("Arquivo excede o limite", status_code=413)
    response = await call_next(request)
    response.headers.update(
        {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        }
    )
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    if PRODUCTION:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


def obj(row, exclude=()):
    return {
        c.name: getattr(row, c.name)
        for c in row.__table__.columns
        if c.name not in exclude
    }


def record(db, user, action, target):
    db.add(
        Audit(
            id=uid(), actor_id=user.id, action=action, target=target, created_at=now()
        )
    )


def get(db, model, id):
    row = db.get(model, id)
    if not row:
        raise HTTPException(404, "Registro não encontrado.")
    return row


def visible_class_ids(db, user):
    if user.role == "admin":
        return list(db.scalars(select(Classroom.id)))
    if user.role == "teacher":
        return list(
            db.scalars(select(Classroom.id).where(Classroom.teacher_id == user.id))
        )
    students = (
        [user.id]
        if user.role == "student"
        else list(
            db.scalars(
                select(GuardianLink.student_id).where(
                    GuardianLink.guardian_id == user.id
                )
            )
        )
    )
    return list(
        db.scalars(
            select(Enrollment.classroom_id).where(Enrollment.student_id.in_(students))
        ).unique()
    )


def access_class(db, user, id, write=False):
    row = get(db, Classroom, id)
    if id not in visible_class_ids(db, user):
        raise HTTPException(403, "Você não tem acesso a esta turma.")
    if write:
        staff(user)
    return row


def access_lesson(db, user, id, write=False):
    lesson = get(db, Lesson, id)
    module = get(db, Module, lesson.module_id)
    access_class(db, user, module.classroom_id, write)
    if not write and user.role not in ("admin", "teacher") and not lesson.published:
        raise HTTPException(404, "Aula não publicada.")
    return lesson, module


@app.get("/api/health")
def health(db=Depends(db_session)):
    db.execute(select(1))
    return {"status": "ok", "storage": storage.STORAGE}


@app.post("/api/auth/login")
def login(data: LoginIn, request: Request, response: Response, db=Depends(db_session)):
    email = data.email.strip().lower()
    rate_limit(db, f"login-ip:{request.client.host}", limit=40)
    rate_limit(db, f"login-email:{email}")
    user = db.scalar(select(User).where(User.email == email))
    # Dummy scrypt avoids revealing whether an email is registered through timing.
    valid = verify_password(
        data.password, user.password if user else "00" * 16 + ":" + "00" * 64
    )
    if not user or not valid or not user.active:
        raise HTTPException(401, "E-mail ou senha incorretos.")
    token = uid() + uid()
    csrf = uid()
    db.execute(delete(LoginSession).where(LoginSession.expires < now()))
    db.add(
        LoginSession(
            id=digest(token), user_id=user.id, csrf=csrf, expires=now() + 8 * 3600
        )
    )
    record(db, user, "auth.login", user.id)
    db.commit()
    response.set_cookie(
        "campus_session",
        token,
        httponly=True,
        secure=PRODUCTION,
        samesite="strict",
        max_age=8 * 3600,
        path="/",
    )
    return {"user": obj(user, ("password",)), "csrf": csrf}


@app.get("/api/auth/me")
def me(request: Request, user=Depends(principal)):
    return {"user": obj(user, ("password",)), "csrf": request.state.session.csrf}


@app.post("/api/auth/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(principal),
    db=Depends(db_session),
):
    db.delete(get(db, LoginSession, request.state.session.id))
    db.commit()
    response.delete_cookie("campus_session", path="/")
    return {"ok": True}


@app.post("/api/auth/password")
def password(
    data: PasswordIn,
    response: Response,
    user=Depends(principal),
    db=Depends(db_session),
):
    if not verify_password(data.current, user.password):
        raise HTTPException(400, "Senha atual incorreta.")
    user.password = hash_password(data.password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    record(db, user, "auth.password", user.id)
    db.commit()
    response.delete_cookie("campus_session", path="/")
    return {"ok": True}


@app.get("/api/users")
def users(user=Depends(principal), db=Depends(db_session)):
    staff(user)
    query = select(User)
    if user.role == "teacher":
        ids = db.scalars(
            select(Enrollment.student_id).where(
                Enrollment.classroom_id.in_(visible_class_ids(db, user))
            )
        )
        query = query.where(User.id.in_(list(ids) + [user.id]))
    return [obj(u, ("password",)) for u in db.scalars(query.order_by(User.name))]


@app.post("/api/users", status_code=201)
def create_user(data: UserIn, user=Depends(principal), db=Depends(db_session)):
    admin(user)
    row = User(
        id=uid(),
        name=data.name,
        email=data.email,
        password=hash_password(data.password),
        role=data.role,
    )
    db.add(row)
    record(db, user, "user.create", row.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "E-mail já cadastrado.")
    return obj(row, ("password",))


@app.patch("/api/users/{id}")
def activate_user(
    id: str, data: ActiveIn, user=Depends(principal), db=Depends(db_session)
):
    admin(user)
    if id == user.id:
        raise HTTPException(400, "Você não pode desativar sua própria conta.")
    row = get(db, User, id)
    row.active = data.active
    if not data.active:
        db.execute(delete(LoginSession).where(LoginSession.user_id == id))
    record(db, user, "user.active", id)
    db.commit()
    return obj(row, ("password",))


@app.post("/api/guardian-links", status_code=201)
def link_guardian(data: GuardianIn, user=Depends(principal), db=Depends(db_session)):
    admin(user)
    if not data.consent_confirmed:
        raise HTTPException(
            422, "Confirme o consentimento fora da plataforma antes de vincular."
        )
    if (
        get(db, User, data.guardian_id).role != "guardian"
        or get(db, User, data.student_id).role != "student"
    ):
        raise HTTPException(422, "Perfis inválidos.")
    row = GuardianLink(
        id=uid(),
        guardian_id=data.guardian_id,
        student_id=data.student_id,
        consent_at=now(),
    )
    db.add(row)
    record(db, user, "guardian.link", data.student_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Vínculo já existe.")
    return obj(row)


@app.post("/api/users/{id}/reset-password")
def admin_reset_password(
    id: str, data: ResetPasswordIn, user=Depends(principal), db=Depends(db_session)
):
    admin(user)
    row = get(db, User, id)
    if id == user.id:
        raise HTTPException(400, "Use Minha conta para alterar sua senha.")
    row.password = hash_password(data.password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == id))
    record(db, user, "user.password_reset", id)
    db.commit()
    return {"ok": True}


@app.get("/api/guardian-links")
def guardian_links(user=Depends(principal), db=Depends(db_session)):
    if user.role not in ("admin", "guardian"):
        raise HTTPException(403, "Acesso restrito.")
    query = select(GuardianLink)
    if user.role == "guardian":
        query = query.where(GuardianLink.guardian_id == user.id)
    return [
        {**obj(r), "student_name": get(db, User, r.student_id).name}
        for r in db.scalars(query)
    ]


@app.get("/api/classrooms")
def classrooms(user=Depends(principal), db=Depends(db_session)):
    rows = db.scalars(
        select(Classroom).where(Classroom.id.in_(visible_class_ids(db, user)))
    )
    return [
        {
            **obj(r),
            "teacher_name": get(db, User, r.teacher_id).name,
            "students": db.scalar(
                select(func.count())
                .select_from(Enrollment)
                .where(Enrollment.classroom_id == r.id)
            ),
            "modules": db.scalar(
                select(func.count())
                .select_from(Module)
                .where(Module.classroom_id == r.id)
            ),
        }
        for r in rows
    ]


@app.post("/api/classrooms", status_code=201)
def create_class(data: ClassIn, user=Depends(principal), db=Depends(db_session)):
    admin(user)
    if get(db, User, data.teacher_id).role != "teacher":
        raise HTTPException(422, "Selecione um professor.")
    row = Classroom(id=uid(), **data.model_dump())
    db.add(row)
    record(db, user, "classroom.create", row.id)
    db.commit()
    return obj(row)


@app.put("/api/classrooms/{id}")
def update_class(
    id: str, data: ClassIn, user=Depends(principal), db=Depends(db_session)
):
    admin(user)
    row = get(db, Classroom, id)
    if get(db, User, data.teacher_id).role != "teacher":
        raise HTTPException(422, "Selecione um professor.")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    record(db, user, "classroom.update", id)
    db.commit()
    return obj(row)


@app.post("/api/classrooms/{id}/enrollments", status_code=201)
def enroll(
    id: str, data: EnrollmentIn, user=Depends(principal), db=Depends(db_session)
):
    admin(user)
    get(db, Classroom, id)
    if get(db, User, data.student_id).role != "student":
        raise HTTPException(422, "Selecione um aluno.")
    row = Enrollment(id=uid(), classroom_id=id, student_id=data.student_id)
    db.add(row)
    record(db, user, "enrollment.create", row.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Aluno já matriculado.")
    return obj(row)


@app.delete("/api/classrooms/{id}/enrollments/{student_id}")
def unenroll(id: str, student_id: str, user=Depends(principal), db=Depends(db_session)):
    admin(user)
    db.execute(
        delete(Enrollment).where(
            Enrollment.classroom_id == id, Enrollment.student_id == student_id
        )
    )
    record(db, user, "enrollment.remove", student_id)
    db.commit()
    return {"ok": True}


@app.get("/api/classrooms/{id}/students")
def class_students(id: str, user=Depends(principal), db=Depends(db_session)):
    access_class(db, user, id, True)
    return [
        obj(u, ("password",))
        for u in db.scalars(
            select(User)
            .join(Enrollment, Enrollment.student_id == User.id)
            .where(Enrollment.classroom_id == id)
            .order_by(User.name)
        )
    ]


@app.get("/api/classrooms/{id}/modules")
def modules(id: str, user=Depends(principal), db=Depends(db_session)):
    access_class(db, user, id)
    result = []
    for row in db.scalars(
        select(Module).where(Module.classroom_id == id).order_by(Module.position)
    ):
        query = (
            select(Lesson).where(Lesson.module_id == row.id).order_by(Lesson.position)
        )
        if user.role not in ("admin", "teacher"):
            query = query.where(Lesson.published == True)
        lessons = []
        for lesson in db.scalars(query):
            completed = bool(
                db.scalar(
                    select(Progress.id).where(
                        Progress.lesson_id == lesson.id, Progress.student_id == user.id
                    )
                )
            )
            lessons.append({**obj(lesson), "completed": completed})
        result.append({**obj(row), "lessons": lessons})
    return result


@app.post("/api/classrooms/{id}/modules", status_code=201)
def create_module(
    id: str, data: ModuleIn, user=Depends(principal), db=Depends(db_session)
):
    access_class(db, user, id, True)
    row = Module(id=uid(), classroom_id=id, **data.model_dump())
    db.add(row)
    record(db, user, "module.create", row.id)
    db.commit()
    return obj(row)


@app.post("/api/modules/{id}/lessons", status_code=201)
def create_lesson(
    id: str, data: LessonIn, user=Depends(principal), db=Depends(db_session)
):
    module = get(db, Module, id)
    access_class(db, user, module.classroom_id, True)
    values = data.model_dump(exclude={"description"})
    values["video_url"] = safe_url(data.video_url)
    row = Lesson(id=uid(), module_id=id, **values)
    db.add(row)
    record(db, user, "lesson.create", row.id)
    db.commit()
    return obj(row)


@app.put("/api/modules/{id}")
def edit_module(
    id: str, data: ModuleIn, user=Depends(principal), db=Depends(db_session)
):
    row = get(db, Module, id)
    access_class(db, user, row.classroom_id, True)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    record(db, user, "module.update", id)
    db.commit()
    return obj(row)


@app.put("/api/lessons/{id}")
def edit_lesson(
    id: str, data: LessonIn, user=Depends(principal), db=Depends(db_session)
):
    row, _ = access_lesson(db, user, id, True)
    values = data.model_dump(exclude={"description"})
    values["video_url"] = safe_url(data.video_url)
    for key, value in values.items():
        setattr(row, key, value)
    record(db, user, "lesson.update", id)
    db.commit()
    return obj(row)


@app.post("/api/lessons/{id}/complete")
def complete_lesson(id: str, user=Depends(principal), db=Depends(db_session)):
    access_lesson(db, user, id)
    if user.role != "student":
        raise HTTPException(403, "Apenas alunos podem concluir aulas.")
    row = db.scalar(
        select(Progress).where(Progress.lesson_id == id, Progress.student_id == user.id)
    )
    if not row:
        db.add(Progress(id=uid(), lesson_id=id, student_id=user.id, completed_at=now()))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return {"ok": True}


def asset_access(db, user, asset):
    access_class(db, user, asset.classroom_id)
    owner = get(db, User, asset.owner_id)
    if (
        owner.role == "student"
        and user.role not in ("admin", "teacher")
        and asset.owner_id != user.id
    ):
        raise HTTPException(403, "Arquivo privado do aluno.")
    if asset.lesson_id:
        access_lesson(db, user, asset.lesson_id)


@app.post("/api/classrooms/{id}/assets", status_code=201)
async def upload(
    id: str,
    file: UploadFile = File(...),
    lesson_id: str | None = Form(None),
    user=Depends(principal),
    db=Depends(db_session),
):
    access_class(db, user, id)
    if user.role == "guardian":
        raise HTTPException(403, "Responsáveis não enviam arquivos.")
    rate_limit(db, f"upload:{user.id}", limit=30, seconds=3600)
    if lesson_id:
        _, module = access_lesson(db, user, lesson_id, True)
        if module.classroom_id != id:
            raise HTTPException(422, "Aula de outra turma.")
    asset_id = uid()
    name, size, mime = await storage.store_upload(file, asset_id)
    row = Asset(
        id=asset_id,
        classroom_id=id,
        owner_id=user.id,
        lesson_id=lesson_id,
        name=name,
        size=size,
        mime=mime,
        created_at=now(),
    )
    try:
        db.add(row)
        record(db, user, "asset.upload", row.id)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_upload(asset_id)
        raise
    return obj(row)


@app.get("/api/classrooms/{id}/assets")
def assets(id: str, user=Depends(principal), db=Depends(db_session)):
    access_class(db, user, id)
    result = []
    for row in db.scalars(
        select(Asset).where(Asset.classroom_id == id).order_by(Asset.created_at.desc())
    ):
        try:
            asset_access(db, user, row)
        except HTTPException:
            continue
        result.append(obj(row))
    return result


@app.get("/api/assets/{id}/download")
def download(id: str, user=Depends(principal), db=Depends(db_session)):
    row = get(db, Asset, id)
    asset_access(db, user, row)
    record(db, user, "asset.download", id)
    db.commit()
    if storage.STORAGE == "s3":
        return RedirectResponse(storage.download_url(row), status_code=307)
    path = storage.UPLOADS / id
    if not path.exists():
        raise HTTPException(404, "Arquivo indisponível.")
    return FileResponse(
        path,
        filename=row.name,
        media_type=row.mime,
        content_disposition_type="attachment",
    )


@app.get("/api/assignments")
def assignments(user=Depends(principal), db=Depends(db_session)):
    return [
        obj(r)
        for r in db.scalars(
            select(Assignment)
            .where(Assignment.classroom_id.in_(visible_class_ids(db, user)))
            .order_by(Assignment.due_at)
        )
    ]


@app.delete("/api/assets/{id}")
def remove_asset(id: str, user=Depends(principal), db=Depends(db_session)):
    row = get(db, Asset, id)
    asset_access(db, user, row)
    if user.role not in ("admin", "teacher") and row.owner_id != user.id:
        raise HTTPException(403, "Acesso restrito.")
    if db.scalar(select(Submission.id).where(Submission.asset_id == id).limit(1)):
        raise HTTPException(
            409, "Arquivo vinculado a uma entrega. Preserve o histórico acadêmico."
        )
    storage.delete_upload(id)
    db.delete(row)
    record(db, user, "asset.remove", id)
    db.commit()
    return {"ok": True}


@app.post("/api/classrooms/{id}/assignments", status_code=201)
def create_assignment(
    id: str, data: AssignmentIn, user=Depends(principal), db=Depends(db_session)
):
    access_class(db, user, id, True)
    row = Assignment(id=uid(), classroom_id=id, **data.model_dump())
    db.add(row)
    record(db, user, "assignment.create", row.id)
    db.commit()
    return obj(row)


@app.post("/api/assignments/{id}/submissions", status_code=201)
def submit(
    id: str, data: SubmissionIn, user=Depends(principal), db=Depends(db_session)
):
    assignment = get(db, Assignment, id)
    access_class(db, user, assignment.classroom_id)
    if user.role != "student":
        raise HTTPException(403, "Apenas alunos podem entregar projetos.")
    safe_url(data.repository_url)
    if not data.repository_url and not data.asset_id:
        raise HTTPException(422, "Envie um repositório ou arquivo.")
    if data.asset_id:
        asset = get(db, Asset, data.asset_id)
        if asset.owner_id != user.id or asset.classroom_id != assignment.classroom_id:
            raise HTTPException(403, "Anexo inválido.")
    version = (
        db.scalar(
            select(func.max(Submission.version)).where(
                Submission.assignment_id == id, Submission.student_id == user.id
            )
        )
        or 0
    ) + 1
    row = Submission(
        id=uid(),
        assignment_id=id,
        student_id=user.id,
        version=version,
        submitted_at=now(),
        **data.model_dump(),
    )
    db.add(row)
    record(db, user, "submission.create", row.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Entrega simultânea. Tente novamente.")
    return obj(row)


@app.put("/api/assignments/{id}")
def edit_assignment(
    id: str, data: AssignmentIn, user=Depends(principal), db=Depends(db_session)
):
    row = get(db, Assignment, id)
    access_class(db, user, row.classroom_id, True)
    if (
        db.scalar(select(Submission.id).where(Submission.assignment_id == id).limit(1))
        and row.rubric != data.model_dump()["rubric"]
    ):
        raise HTTPException(
            409, "Critérios de avaliação não podem mudar após a primeira entrega."
        )
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    record(db, user, "assignment.update", id)
    db.commit()
    return obj(row)


@app.get("/api/submissions")
def submissions(user=Depends(principal), db=Depends(db_session)):
    ids = db.scalars(
        select(Assignment.id).where(
            Assignment.classroom_id.in_(visible_class_ids(db, user))
        )
    )
    query = select(Submission).where(Submission.assignment_id.in_(list(ids)))
    if user.role == "student":
        query = query.where(Submission.student_id == user.id)
    if user.role == "guardian":
        query = query.where(
            Submission.student_id.in_(
                list(
                    db.scalars(
                        select(GuardianLink.student_id).where(
                            GuardianLink.guardian_id == user.id
                        )
                    )
                )
            )
        )
    return [
        {
            **obj(row),
            "student_name": get(db, User, row.student_id).name,
            "late": row.submitted_at > get(db, Assignment, row.assignment_id).due_at,
        }
        for row in db.scalars(query.order_by(Submission.submitted_at.desc()))
    ]


@app.post("/api/submissions/{id}/grade")
def grade_submission(
    id: str, data: GradeIn, user=Depends(principal), db=Depends(db_session)
):
    row = get(db, Submission, id)
    assignment = get(db, Assignment, row.assignment_id)
    access_class(db, user, assignment.classroom_id, True)
    if len(data.scores) != len(assignment.rubric):
        raise HTTPException(422, "Avalie todos os critérios.")
    row.grade = round(
        sum(s * r["weight"] / 100 for s, r in zip(data.scores, assignment.rubric))
    )
    row.feedback = data.feedback
    row.rubric_scores = data.scores
    record(db, user, "submission.grade", id)
    db.commit()
    return obj(row)


@app.get("/api/exams")
def exams(user=Depends(principal), db=Depends(db_session)):
    query = select(Exam).where(Exam.classroom_id.in_(visible_class_ids(db, user)))
    if user.role not in ("admin", "teacher"):
        query = query.where(Exam.published == True)
    result = []
    for row in db.scalars(query):
        data = obj(row, ("questions",))
        data["question_count"] = len(row.questions)
        if user.role in ("admin", "teacher"):
            data["questions"] = row.questions
        attempt = db.scalar(
            select(Attempt).where(
                Attempt.exam_id == row.id, Attempt.student_id == user.id
            )
        )
        data["attempt"] = obj(attempt, ("questions", "answers")) if attempt else None
        result.append(data)
    return result


@app.post("/api/classrooms/{id}/exams", status_code=201)
def create_exam(id: str, data: ExamIn, user=Depends(principal), db=Depends(db_session)):
    access_class(db, user, id, True)
    row = Exam(id=uid(), classroom_id=id, **data.model_dump())
    db.add(row)
    record(db, user, "exam.create", row.id)
    db.commit()
    return obj(row, ("questions",))


@app.put("/api/exams/{id}")
def edit_exam(id: str, data: ExamIn, user=Depends(principal), db=Depends(db_session)):
    row = get(db, Exam, id)
    access_class(db, user, row.classroom_id, True)
    if db.scalar(select(Attempt.id).where(Attempt.exam_id == id).limit(1)):
        raise HTTPException(
            409,
            "Avaliação já iniciada. Crie outra para preservar a igualdade entre alunos.",
        )
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    record(db, user, "exam.update", id)
    db.commit()
    return obj(row, ("questions",))


def finish(db, attempt):
    if attempt.finished_at:
        return
    correct = sum(
        attempt.answers.get(str(i)) == q["correct"]
        for i, q in enumerate(attempt.questions)
    )
    attempt.grade = round(correct / len(attempt.questions) * 100)
    attempt.finished_at = min(now(), attempt.deadline)


def attempt_data(attempt):
    return {
        **obj(attempt, ("questions",)),
        "questions": [
            {"prompt": q["prompt"], "options": q["options"]} for q in attempt.questions
        ],
        "server_time": now(),
    }


@app.post("/api/exams/{id}/start")
def start_exam(id: str, user=Depends(principal), db=Depends(db_session)):
    row = get(db, Exam, id)
    access_class(db, user, row.classroom_id)
    if user.role != "student" or not row.published:
        raise HTTPException(403, "Prova indisponível.")
    attempt = db.scalar(
        select(Attempt).where(Attempt.exam_id == id, Attempt.student_id == user.id)
    )
    if not attempt:
        questions = []
        for question in row.questions:
            indices = list(range(len(question["options"])))
            random.SystemRandom().shuffle(indices)
            questions.append(
                {
                    "prompt": question["prompt"],
                    "options": [question["options"][i] for i in indices],
                    "correct": indices.index(question["correct"]),
                }
            )
        random.SystemRandom().shuffle(questions)
        attempt = Attempt(
            id=uid(),
            exam_id=id,
            student_id=user.id,
            started_at=now(),
            deadline=now() + row.duration_minutes * 60,
            questions=questions,
            answers={},
        )
        db.add(attempt)
        record(db, user, "exam.start", attempt.id)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            attempt = db.scalar(
                select(Attempt).where(
                    Attempt.exam_id == id, Attempt.student_id == user.id
                )
            )
    if now() >= attempt.deadline:
        finish(db, attempt)
        db.commit()
    return attempt_data(attempt)


def own_attempt(db, user, id):
    attempt = db.scalar(select(Attempt).where(Attempt.id == id).with_for_update())
    if not attempt:
        raise HTTPException(404, "Tentativa não encontrada.")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Tentativa de outro aluno.")
    access_class(db, user, get(db, Exam, attempt.exam_id).classroom_id)
    return attempt


@app.put("/api/attempts/{id}/answers")
def save_answers(
    id: str, data: AnswersIn, user=Depends(principal), db=Depends(db_session)
):
    attempt = own_attempt(db, user, id)
    if attempt.finished_at:
        raise HTTPException(409, "Prova já encerrada.")
    if now() >= attempt.deadline:
        finish(db, attempt)
        db.commit()
        raise HTTPException(409, "O tempo da prova terminou.")
    for key, value in data.answers.items():
        if (
            not key.isdigit()
            or str(int(key)) != key
            or int(key) >= len(attempt.questions)
            or value < 0
            or value >= len(attempt.questions[int(key)]["options"])
        ):
            raise HTTPException(422, "Resposta inválida.")
    attempt.answers = {**attempt.answers, **data.answers}
    db.commit()
    return {"saved_at": now()}


@app.post("/api/attempts/{id}/finish")
def finish_attempt(id: str, user=Depends(principal), db=Depends(db_session)):
    attempt = own_attempt(db, user, id)
    finish(db, attempt)
    record(db, user, "exam.finish", id)
    db.commit()
    return attempt_data(attempt)


@app.post("/api/attempts/{id}/events")
def exam_event(id: str, data: EventIn, user=Depends(principal), db=Depends(db_session)):
    attempt = own_attempt(db, user, id)
    if attempt.finished_at or now() >= attempt.deadline:
        raise HTTPException(409, "Prova encerrada.")
    rate_limit(db, f"event:{id}", limit=120, seconds=60)
    db.add(ExamEvent(id=uid(), attempt_id=id, kind=data.kind, created_at=now()))
    db.commit()
    return {"ok": True}


@app.get("/api/exams/{id}/results")
def exam_results(id: str, user=Depends(principal), db=Depends(db_session)):
    row = get(db, Exam, id)
    access_class(db, user, row.classroom_id, True)
    result = []
    for attempt in db.scalars(select(Attempt).where(Attempt.exam_id == id)):
        if now() >= attempt.deadline:
            finish(db, attempt)
        result.append(
            {
                **obj(attempt, ("questions",)),
                "student_name": get(db, User, attempt.student_id).name,
                "events": [
                    obj(e)
                    for e in db.scalars(
                        select(ExamEvent).where(ExamEvent.attempt_id == attempt.id)
                    )
                ],
            }
        )
    db.commit()
    return result


@app.get("/api/announcements")
def announcements(user=Depends(principal), db=Depends(db_session)):
    return [
        {**obj(row), "author_name": get(db, User, row.author_id).name}
        for row in db.scalars(
            select(Announcement)
            .where(Announcement.classroom_id.in_(visible_class_ids(db, user)))
            .order_by(Announcement.created_at.desc())
        )
    ]


@app.post("/api/classrooms/{id}/announcements", status_code=201)
def announce(
    id: str, data: AnnouncementIn, user=Depends(principal), db=Depends(db_session)
):
    access_class(db, user, id, True)
    row = Announcement(
        id=uid(),
        classroom_id=id,
        author_id=user.id,
        created_at=now(),
        **data.model_dump(),
    )
    db.add(row)
    record(db, user, "announcement.create", row.id)
    db.commit()
    return obj(row)


@app.get("/api/classrooms/{id}/attendance")
def attendance(id: str, user=Depends(principal), db=Depends(db_session)):
    access_class(db, user, id)
    query = select(Attendance).where(Attendance.classroom_id == id)
    if user.role == "student":
        query = query.where(Attendance.student_id == user.id)
    if user.role == "guardian":
        query = query.where(
            Attendance.student_id.in_(
                list(
                    db.scalars(
                        select(GuardianLink.student_id).where(
                            GuardianLink.guardian_id == user.id
                        )
                    )
                )
            )
        )
    return [obj(row) for row in db.scalars(query)]


@app.put("/api/classrooms/{id}/attendance")
def set_attendance(
    id: str, data: AttendanceIn, user=Depends(principal), db=Depends(db_session)
):
    access_class(db, user, id, True)
    enrolled = set(
        db.scalars(select(Enrollment.student_id).where(Enrollment.classroom_id == id))
    )
    if any(s not in enrolled for s in data.present):
        raise HTTPException(422, "Aluno não matriculado.")
    for student, present in data.present.items():
        row = db.scalar(
            select(Attendance).where(
                Attendance.classroom_id == id,
                Attendance.student_id == student,
                Attendance.date == data.date.isoformat(),
            )
        )
        if row:
            row.present = present
        else:
            db.add(
                Attendance(
                    id=uid(),
                    classroom_id=id,
                    student_id=student,
                    date=data.date.isoformat(),
                    present=present,
                )
            )
    record(db, user, "attendance.update", id)
    db.commit()
    return {"ok": True}


@app.get("/api/dashboard")
def dashboard(user=Depends(principal), db=Depends(db_session)):
    ids = visible_class_ids(db, user)
    lesson_ids = list(
        db.scalars(
            select(Lesson.id)
            .join(Module)
            .where(Module.classroom_id.in_(ids), Lesson.published == True)
        )
    )
    student_ids = list(
        db.scalars(
            select(Enrollment.student_id).where(Enrollment.classroom_id.in_(ids))
        ).unique()
    )
    if user.role == "student":
        student_ids = [user.id]
    if user.role == "guardian":
        student_ids = list(
            db.scalars(
                select(GuardianLink.student_id).where(
                    GuardianLink.guardian_id == user.id
                )
            )
        )
    completed = (
        db.scalar(
            select(func.count())
            .select_from(Progress)
            .where(
                Progress.lesson_id.in_(lesson_ids), Progress.student_id.in_(student_ids)
            )
        )
        or 0
    )
    total = 0
    # Each student only contributes lessons from their actual enrollments.
    for student in student_ids:
        enrolled = list(
            db.scalars(
                select(Enrollment.classroom_id).where(
                    Enrollment.student_id == student, Enrollment.classroom_id.in_(ids)
                )
            )
        )
        total += (
            db.scalar(
                select(func.count())
                .select_from(Lesson)
                .join(Module)
                .where(Module.classroom_id.in_(enrolled), Lesson.published == True)
            )
            or 0
        )
    return {
        "classrooms": len(ids),
        "students": len(student_ids),
        "lessons": len(lesson_ids),
        "completed": completed,
        "progress": round(completed / total * 100) if total else 0,
        "assignments": db.scalar(
            select(func.count())
            .select_from(Assignment)
            .where(Assignment.classroom_id.in_(ids))
        ),
        "storage": storage.STORAGE,
    }


@app.get("/api/reports/{id}")
def report(id: str, user=Depends(principal), db=Depends(db_session)):
    access_class(db, user, id, True)
    lessons = list(
        db.scalars(
            select(Lesson.id)
            .join(Module)
            .where(Module.classroom_id == id, Lesson.published == True)
        )
    )
    assignment_ids = list(
        db.scalars(select(Assignment.id).where(Assignment.classroom_id == id))
    )
    result = []
    for student in db.scalars(
        select(User)
        .join(Enrollment, User.id == Enrollment.student_id)
        .where(Enrollment.classroom_id == id)
    ):
        completed = db.scalar(
            select(func.count())
            .select_from(Progress)
            .where(Progress.student_id == student.id, Progress.lesson_id.in_(lessons))
        )
        latest = {}
        for s in db.scalars(
            select(Submission)
            .where(
                Submission.student_id == student.id,
                Submission.assignment_id.in_(assignment_ids),
            )
            .order_by(Submission.version)
        ):
            latest[s.assignment_id] = s
        grades = [s.grade for s in latest.values() if s.grade is not None]
        attendance = list(
            db.scalars(
                select(Attendance).where(
                    Attendance.classroom_id == id, Attendance.student_id == student.id
                )
            )
        )
        result.append(
            {
                "id": student.id,
                "name": student.name,
                "progress": round(completed / len(lessons) * 100) if lessons else 0,
                "submitted": len(latest),
                "average": round(sum(grades) / len(grades)) if grades else None,
                "attendance": round(
                    sum(a.present for a in attendance) / len(attendance) * 100
                )
                if attendance
                else None,
            }
        )
    return result


@app.get("/api/audit")
def audit(user=Depends(principal), db=Depends(db_session)):
    admin(user)
    return [
        obj(r)
        for r in db.scalars(select(Audit).order_by(Audit.created_at.desc()).limit(200))
    ]


@app.post("/api/classrooms/{id}/certificates/{student_id}", status_code=201)
def issue_certificate(
    id: str, student_id: str, user=Depends(principal), db=Depends(db_session)
):
    classroom = access_class(db, user, id, True)
    student = get(db, User, student_id)
    if not db.scalar(
        select(Enrollment.id).where(
            Enrollment.classroom_id == id, Enrollment.student_id == student_id
        )
    ):
        raise HTTPException(422, "Aluno não matriculado.")
    existing = db.scalar(
        select(Certificate).where(
            Certificate.classroom_id == id, Certificate.student_id == student_id
        )
    )
    if existing:
        return obj(existing)
    lessons = list(
        db.scalars(
            select(Lesson)
            .join(Module)
            .where(Module.classroom_id == id, Lesson.published == True)
        )
    )
    if not lessons:
        raise HTTPException(409, "A turma precisa de aulas publicadas.")
    completed = set(
        db.scalars(select(Progress.lesson_id).where(Progress.student_id == student_id))
    )
    if any(l.id not in completed for l in lessons):
        raise HTTPException(409, "O aluno precisa concluir todas as aulas publicadas.")
    for assignment in db.scalars(
        select(Assignment).where(Assignment.classroom_id == id)
    ):
        submission = db.scalar(
            select(Submission)
            .where(
                Submission.assignment_id == assignment.id,
                Submission.student_id == student_id,
            )
            .order_by(Submission.version.desc())
            .limit(1)
        )
        if not submission or submission.grade is None or submission.grade < 70:
            raise HTTPException(
                409,
                "Todos os projetos precisam de avaliação mínima de 70/100 na última versão.",
            )
    for exam in db.scalars(
        select(Exam).where(Exam.classroom_id == id, Exam.published == True)
    ):
        attempt = db.scalar(
            select(Attempt).where(
                Attempt.exam_id == exam.id, Attempt.student_id == student_id
            )
        )
        if attempt and now() >= attempt.deadline:
            finish(db, attempt)
        if not attempt or not attempt.finished_at or attempt.grade < 70:
            raise HTTPException(
                409,
                "Todas as provas publicadas precisam de resultado mínimo de 70/100.",
            )
    row = Certificate(
        id=uid(),
        classroom_id=id,
        student_id=student_id,
        issued_by=user.id,
        student_name=student.name,
        classroom_title=classroom.title,
        minutes=sum(l.minutes for l in lessons),
        issued_at=now(),
    )
    db.add(row)
    record(db, user, "certificate.issue", row.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        row = db.scalar(
            select(Certificate).where(
                Certificate.classroom_id == id, Certificate.student_id == student_id
            )
        )
    return obj(row)


@app.get("/api/certificates")
def certificates(user=Depends(principal), db=Depends(db_session)):
    query = select(Certificate).where(
        Certificate.classroom_id.in_(visible_class_ids(db, user))
    )
    if user.role == "student":
        query = query.where(Certificate.student_id == user.id)
    if user.role == "guardian":
        query = query.where(
            Certificate.student_id.in_(
                list(
                    db.scalars(
                        select(GuardianLink.student_id).where(
                            GuardianLink.guardian_id == user.id
                        )
                    )
                )
            )
        )
    return [obj(row) for row in db.scalars(query)]


@app.get("/api/certificates/{id}/document", response_class=HTMLResponse)
def certificate_document(id: str, user=Depends(principal), db=Depends(db_session)):
    from html import escape
    from datetime import datetime, timezone

    row = get(db, Certificate, id)
    access_class(db, user, row.classroom_id)
    if user.role == "student" and row.student_id != user.id:
        raise HTTPException(403, "Certificado de outro aluno.")
    if user.role == "guardian" and not db.scalar(
        select(GuardianLink.id).where(
            GuardianLink.guardian_id == user.id,
            GuardianLink.student_id == row.student_id,
        )
    ):
        raise HTTPException(403, "Aluno não vinculado.")
    issued = datetime.fromtimestamp(row.issued_at, timezone.utc).strftime("%d/%m/%Y")
    return f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificado · CodeCampus</title><link rel="stylesheet" href="/static/certificate.css"></head><body><main><div class="brand">&lt;/&gt; CodeCampus</div><p class="eyebrow">APRENDER CONSTRUINDO</p><h1>Certificado de conclusão</h1><p>Reconhecemos a jornada de</p><h2>{escape(row.student_name)}</h2><p>na turma <strong>{escape(row.classroom_title)}</strong>, com conclusão das aulas e aproveitamento mínimo de 70% nas avaliações e projetos publicados.</p><p>Carga horária dos roteiros: {row.minutes / 60:g} horas · Emissão: {issued}</p><footer>Identificador privado: {row.id}<br>Certificado de curso livre emitido pela escola. Sem equivalência a graduação ou MBA.</footer></main></body></html>'


app.mount("/static", StaticFiles(directory=ROOT / "web"), name="static")


@app.get("/", include_in_schema=False)
def landing():
    return FileResponse(ROOT / "web" / "landing.html")


@app.get("/campus", include_in_schema=False)
def index():
    return FileResponse(ROOT / "web" / "index.html")
