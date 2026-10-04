"""Role-scoped learning summaries, derived from existing academic records."""

from sqlalchemy import select
from .db import Classroom, Module, Lesson, Progress, Enrollment, GuardianLink, User


def learning_overview(db, user, class_ids):
    staff = user.role in ("teacher", "admin")
    enrollments = list(
        db.execute(
            select(Enrollment.classroom_id, Enrollment.student_id).where(
                Enrollment.classroom_id.in_(class_ids)
            )
        )
    )
    if user.role == "student":
        students = {user.id}
    elif user.role == "guardian":
        students = set(
            db.scalars(
                select(GuardianLink.student_id).where(
                    GuardianLink.guardian_id == user.id
                )
            )
        )
    else:
        students = {s for _, s in enrollments}
    enrolled = {(c, s) for c, s in enrollments if s in students}
    rows = list(
        db.execute(
            select(Lesson, Module)
            .join(Module, Lesson.module_id == Module.id)
            .where(Module.classroom_id.in_(class_ids))
            .order_by(Module.position, Module.id, Lesson.position, Lesson.id)
        )
    )
    public = {l.id: (l, m) for l, m in rows if l.published}
    completed = list(
        db.scalars(
            select(Progress)
            .where(
                Progress.lesson_id.in_(list(public)),
                Progress.student_id.in_(students),
            )
            .order_by(Progress.completed_at.desc(), Progress.id)
        )
    )
    completed = [
        p
        for p in completed
        if (public[p.lesson_id][1].classroom_id, p.student_id) in enrolled
    ]
    done = {(p.lesson_id, p.student_id) for p in completed}
    names = dict(
        db.execute(select(User.id, User.name).where(User.id.in_(students))).all()
    )
    classrooms = list(
        db.scalars(
            select(Classroom)
            .where(Classroom.id.in_(class_ids))
            .order_by(Classroom.title)
        )
    )
    class_names = {c.id: c.title for c in classrooms}
    courses = []
    for c in classrooms:
        lessons = [(l, m) for l, m in rows if m.classroom_id == c.id]
        published = [(l, m) for l, m in lessons if l.published]
        members = {s for cid, s in enrolled if cid == c.id}
        total = len(published) * len(members)
        count = sum((l.id, s) in done for l, _ in published for s in members)
        next_lesson = next(
            (
                {
                    "id": l.id,
                    "title": l.title,
                    "module_title": m.title,
                    "minutes": l.minutes,
                }
                for l, m in published
                if user.role == "student" and (l.id, user.id) not in done
            ),
            None,
        )
        courses.append(
            {
                "id": c.id,
                "title": c.title,
                "lessons": len(published),
                "drafts": sum(not l.published for l, _ in lessons) if staff else 0,
                "minutes": sum(l.minutes for l, _ in published),
                "completed": count,
                "total": total,
                "progress": round(count / total * 100) if total else 0,
                "next_lesson": next_lesson,
                "students": len(members),
                "active_students": len(
                    {s for l, _ in published for s in members if (l.id, s) in done}
                ),
            }
        )
    history = [
        {
            "id": p.id,
            "lesson_id": p.lesson_id,
            "title": public[p.lesson_id][0].title,
            "module_title": public[p.lesson_id][1].title,
            "classroom_id": public[p.lesson_id][1].classroom_id,
            "classroom_title": class_names[public[p.lesson_id][1].classroom_id],
            "student_name": names.get(p.student_id, "Aluno"),
            "completed_at": p.completed_at,
        }
        for p in completed[:30]
    ]
    return {"courses": courses, "history": history}
