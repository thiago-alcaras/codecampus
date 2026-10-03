"""Explicit bootstrap commands; demo data is never created at server startup."""

import argparse
import getpass
from sqlalchemy import select
from .db import *
from .security import uid, now, hash_password, PRODUCTION

DEMO_PASSWORD = "Aprender!2026"
TRACKS = [
    (
        "Exploradores do código",
        "8–11 anos",
        "mint",
        "Terças e quintas · 14h",
        [
            (
                "Pensamento computacional",
                "Sequências, decomposição e padrões através de brincadeiras.",
                [
                    "Algoritmos fora da tela",
                    "Crie uma história interativa",
                    "Meu primeiro jogo com blocos",
                ],
            ),
            (
                "Criadores de jogos",
                "Eventos, variáveis, condições e colaboração com Scratch.",
                ["Pontuação e variáveis", "Colisões e desafios", "Mostra de jogos"],
            ),
            (
                "Internet com cuidado",
                "Privacidade, respeito e uso responsável da tecnologia.",
                [
                    "Dados pessoais e senhas",
                    "Cidadania digital",
                    "Meu projeto e sua apresentação",
                ],
            ),
        ],
    ),
    (
        "Laboratório de desenvolvimento",
        "12–14 anos",
        "blue",
        "Segundas e quartas · 16h",
        [
            (
                "Web criativa",
                "Construção de interfaces acessíveis com HTML e CSS.",
                [
                    "Estrutura de uma página",
                    "Layouts responsivos",
                    "Acessibilidade na prática",
                ],
            ),
            (
                "JavaScript e Python",
                "Lógica, funções, estruturas de dados e depuração.",
                ["Funções e eventos", "Listas e dicionários", "Investigue um bug"],
            ),
            (
                "Projetos colaborativos",
                "Git, revisão de código e APIs com dados fictícios.",
                [
                    "Commits que contam histórias",
                    "Consuma uma API",
                    "Apresente seu produto",
                ],
            ),
        ],
    ),
    (
        "Engenharia & IA · Future Builders",
        "15–17 anos",
        "purple",
        "Sábados · 09h às 12h",
        [
            (
                "01 · Trabalho em equipes de produto",
                "Requisitos, histórias, critérios de aceite, colaboração e comunicação.",
                [
                    "Do problema ao design doc",
                    "Git, pull requests e revisão",
                    "Planejamento e retrospectiva",
                ],
            ),
            (
                "02 · Arquitetura de aplicações",
                "HTTP, APIs, bancos relacionais, transações e escolhas de arquitetura.",
                [
                    "Modele uma API de biblioteca",
                    "SQL e integridade dos dados",
                    "Monólitos, filas e limites dos serviços",
                ],
            ),
            (
                "03 · Qualidade e segurança",
                "Testes, acessibilidade, autenticação e privacidade por padrão.",
                [
                    "Testes que protegem o produto",
                    "Modelagem de ameaças",
                    "Acessibilidade e dados de menores",
                ],
            ),
            (
                "04 · Desenvolvimento assistido por IA",
                "Contexto, planejamento, validação e autoria responsável.",
                [
                    "Prompts com contexto e critérios",
                    "Refatore com testes e revisão",
                    "Identifique uma resposta incorreta da IA",
                ],
            ),
            (
                "05 · Aplicações com IA e RAG",
                "Embeddings, recuperação, fontes, privacidade e avaliação.",
                [
                    "Busca semântica com dados sintéticos",
                    "Respostas com fontes verificáveis",
                    "Avalie alucinações e vazamento de dados",
                ],
            ),
            (
                "06 · Agentes e ferramentas",
                "Ferramentas com permissões, aprovação humana, limites e rastreabilidade.",
                [
                    "Construa um agente de suporte simulado",
                    "Proteja contra prompt injection",
                    "Orçamento, latência e avaliação",
                ],
            ),
            (
                "07 · Cloud, DevOps e confiabilidade",
                "Containers, CI, armazenamento privado, observabilidade e incidentes.",
                [
                    "Pipeline de testes e entrega",
                    "S3 privado e identidade na AWS",
                    "Simule um incidente e escreva o post-mortem",
                ],
            ),
            (
                "08 · Projeto integrador de empresa",
                "Squads constroem um produto com IA usando o ciclo completo de engenharia.",
                [
                    "Discovery e decisões arquiteturais",
                    "Entrega incremental e revisão de segurança",
                    "Demo day, documentação e portfólio",
                ],
            ),
        ],
    ),
]


def create_admin(email, name):
    password = getpass.getpass("Senha do administrador (mínimo 12 caracteres): ")
    if len(password) < 12 or "@" not in email:
        raise SystemExit("E-mail ou senha inválidos.")
    with Session() as db:
        if db.scalar(select(User.id).where(User.email == email.lower())):
            raise SystemExit("Conta já cadastrada.")
        db.add(
            User(
                id=uid(),
                name=name,
                email=email.lower(),
                password=hash_password(password),
                role="admin",
            )
        )
        db.commit()
    print("Administrador criado. Nenhuma senha foi gravada em arquivo.")


def seed():
    if PRODUCTION:
        raise SystemExit("Dados demo são proibidos em produção.")
    with Session() as db:
        if db.scalar(select(User.id).limit(1)):
            raise SystemExit("Use um banco vazio para a demonstração.")
        people = [
            ("admin", "Alex Administração"),
            ("teacher", "Marina Professor"),
            ("student", "Lucas Aluno"),
            ("guardian", "Renata Responsável"),
        ]
        users = {
            role: User(
                id=uid(),
                name=name,
                email=f"{role}@demo.codecampus.test",
                password=hash_password(DEMO_PASSWORD),
                role=role,
            )
            for role, name in people
        }
        db.add_all(users.values())
        db.flush()
        db.add(
            GuardianLink(
                id=uid(),
                guardian_id=users["guardian"].id,
                student_id=users["student"].id,
                consent_at=now(),
            )
        )
        for idx, (title, age, color, schedule, modules) in enumerate(TRACKS):
            classroom = Classroom(
                id=uid(),
                title=title,
                description=[
                    "Descobrir, criar e aprender brincando.",
                    "Da ideia à primeira aplicação.",
                    "Aprenda a construir produtos como uma equipe de tecnologia.",
                ][idx],
                teacher_id=users["teacher"].id,
                age_band=age,
                color=color,
                schedule=schedule,
            )
            db.add(classroom)
            db.flush()
            # Fictional student enrolled in final track only; age bands are recommendations.
            if idx == 2:
                db.add(
                    Enrollment(
                        id=uid(),
                        classroom_id=classroom.id,
                        student_id=users["student"].id,
                    )
                )
            for position, (mtitle, description, lessons) in enumerate(modules, 1):
                module = Module(
                    id=uid(),
                    classroom_id=classroom.id,
                    title=mtitle,
                    description=description,
                    position=position,
                )
                db.add(module)
                db.flush()
                for lpos, ltitle in enumerate(lessons, 1):
                    body = f"Objetivo da aula\n{description}\n\nDesafio prático\nTrabalhe com seu grupo para explorar “{ltitle}”. Use somente dados fictícios. Registre sua hipótese, a solução e o que aprendeu.\n\nRoteiro\n1. Discuta o problema por 10 minutos.\n2. Construa uma primeira versão por 30 minutos.\n3. Revise com um colega por 15 minutos.\n4. Apresente as decisões e uma melhoria futura.\n\nCritérios de sucesso\nA solução atende ao problema, pode ser explicada por você e foi revisada pelo grupo.\n\nMaterial demonstrativo\nEste roteiro é um exemplo original. O professor deve adicionar os conteúdos reais e atividades adequadas à turma."
                    lesson = Lesson(
                        id=uid(),
                        module_id=module.id,
                        title=ltitle,
                        body=body,
                        minutes=60,
                        position=lpos,
                        published=True,
                    )
                    db.add(lesson)
                    db.flush()
                    if idx == 2 and position == 1 and lpos <= 2:
                        db.add(
                            Progress(
                                id=uid(),
                                lesson_id=lesson.id,
                                student_id=users["student"].id,
                                completed_at=now() - 86400,
                            )
                        )
            assignment = Assignment(
                id=uid(),
                classroom_id=classroom.id,
                title=[
                    "Meu primeiro jogo",
                    "Uma página para uma boa ideia",
                    "Construa uma API de biblioteca",
                ][idx],
                description="Crie uma solução com dados fictícios. Documente como executar, explique suas decisões e apresente os testes. Envie seu repositório HTTPS ou um ZIP com o projeto.",
                due_at=now() + 7 * 86400,
                rubric=[
                    {"label": "Funcionalidade", "weight": 40},
                    {"label": "Qualidade e testes", "weight": 35},
                    {"label": "Documentação e apresentação", "weight": 25},
                ],
            )
            db.add(assignment)
            db.add(
                Announcement(
                    id=uid(),
                    classroom_id=classroom.id,
                    author_id=users["teacher"].id,
                    title="Bem-vindos ao próximo capítulo!",
                    body="Nossa sala é um espaço de colaboração. Traga suas perguntas, compartilhe descobertas e respeite o ritmo dos colegas.",
                    created_at=now(),
                )
            )
            if idx == 2:
                db.add(
                    Exam(
                        id=uid(),
                        classroom_id=classroom.id,
                        title="Checkpoint · Engenharia de software",
                        duration_minutes=20,
                        published=True,
                        questions=[
                            {
                                "prompt": "Qual é a melhor forma de proteger uma mudança em uma API?",
                                "options": [
                                    "Escrever testes relevantes e revisar o código",
                                    "Publicar sem testar",
                                    "Desativar a autenticação",
                                    "Copiar qualquer solução de IA",
                                ],
                                "correct": 0,
                            },
                            {
                                "prompt": "O que deve ser incluído em um repositório público?",
                                "options": [
                                    "Código e dados fictícios",
                                    "Senhas e chaves AWS",
                                    "Dados pessoais dos alunos",
                                    "Materiais privados da escola",
                                ],
                                "correct": 0,
                            },
                            {
                                "prompt": "Como avaliar uma resposta gerada por IA?",
                                "options": [
                                    "Verificar fontes, testar e revisar",
                                    "Aceitar sempre",
                                    "Avaliar apenas o tamanho",
                                    "Ignorar o contexto",
                                ],
                                "correct": 0,
                            },
                        ],
                    )
                )
        db.commit()
    print(
        "Demo criada: admin, teacher, student, guardian @demo.codecampus.test / "
        + DEMO_PASSWORD
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["seed-demo", "create-admin"])
    parser.add_argument("--email")
    parser.add_argument("--name", default="Administração")
    args = parser.parse_args()
    Base.metadata.create_all(engine)
    if args.command == "seed-demo":
        seed()
    else:
        if not args.email:
            parser.error("--email é obrigatório")
        create_admin(args.email, args.name)
