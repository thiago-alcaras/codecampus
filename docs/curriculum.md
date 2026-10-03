# Aprender programação construindo

Currículo original de referência, para ser revisado pelos professores conforme maturidade, conhecimento prévio, necessidades de acessibilidade e tempo disponível. A plataforma não exige que todos avancem na mesma velocidade. Não é um MBA nem oferece equivalência acadêmica.

## Percursos

| Percurso | Referência de idade | Objetivo | Entrega |
|---|---|---|---|
| Exploradores do código | 8–11 | Lógica, criatividade, eventos e cidadania digital | Jogo/história interativa com apresentação |
| Laboratório de desenvolvimento | 12–14 | HTML/CSS, JavaScript/Python, Git e APIs | Site acessível ou pequeno app em dupla |
| Future Builders · Engenharia e IA | 15–17 | Ciclo de engenharia e produtos com IA, colaboração e segurança | Produto em squad com documentação e demo |

Os primeiros percursos precisam de desafios curtos, visualização do resultado, aprendizagem em pares, liberdade criativa e feedback frequente. Não trazer a carga de processos corporativos para crianças pequenas. Os adolescentes avançados trabalham com simulações de empresa sem dados de clientes reais ou sistemas de produção.

## Como organizar as aulas

Encontro de referência com 10 minutos de revisão, 15 de demonstração, 40 de construção, 15 de revisão em pares e 10 de apresentação. O professor observa a capacidade de explicar decisões e fazer ajustes. Não avaliar apenas velocidade ou aparência final.

Cada módulo tem: objetivo compreensível pelo aluno; aula guiada; tarefa prática; material de apoio privado; entrega versionada; critérios explícitos e oportunidade de melhorar após o feedback. A plataforma suporta essa organização. Os roteiros seed são exemplos introdutórios, não aulas completas de uma escola em operação.

## Turma final: uma equipe de tecnologia simulada

Referência de 96 horas: oito módulos de 12 horas, ajustáveis à turma. O seed contém três roteiros de 60 minutos por módulo para demonstração; sua carga de 24 horas não representa o currículo completo de 96 horas. A escola cria as aulas adicionais e define o calendário real.

A inspiração vem dos quatro pilares públicos do [MBA da Full Cycle](https://ia.fullcycle.com.br/mba-ia/): arquitetura, workflow de desenvolvimento, aplicações/agentes e DevOps/SRE. Aqui eles são adaptados para projetos acessíveis a adolescentes, com autoria e supervisão, sem copiar conteúdos pagos.

### 1. Trabalho em equipes de produto

Transformar um problema em uma proposta de solução. Identificar usuários, prioridades, histórias e critérios de aceite. Git, branches, commits, pull requests, revisão, colaboração e retrospectiva. Comunicação clara, pedir ajuda e responder a feedback.

Projeto: discovery de uma biblioteca escolar fictícia. Entregar um design doc curto com problema, personas fictícias, critérios e plano. Simular funções de desenvolvimento, design, testes e produto; rotacionar papéis para todos aprenderem.

### 2. Arquitetura de aplicações

HTTP, contrato de API, tratamento de erros, banco relacional, chaves, integridade e transações. Diferenciar problemas de interface, aplicação e dados. Discutir monólitos, filas e microserviços a partir de necessidade, sem premiar complexidade.

Projeto: API de empréstimos com dados sintéticos. Entregar modelo relacional, endpoints, documentação e uma decisão arquitetural com vantagens e custos. Critério central: impedir empréstimo inválido e proteger consistência, mesmo com requisições repetidas.

### 3. Qualidade, segurança e acessibilidade

Testes de unidade e integração, revisão de código, depuração, keyboard navigation, estados de erro e acessibilidade. Autenticação versus autorização, validação de entrada, dados privados, princípios de menor privilégio e gerenciamento de segredos.

Projeto: corrigir falhas em um app simulado. Demonstrar teste antes/depois, impedir acesso a registros de outro usuário e apresentar uma revisão de acessibilidade. Não usar o ambiente escolar para testar ataques em serviços externos.

### 4. Desenvolvimento assistido por IA

Usar contexto, critérios de sucesso e planos pequenos. Pedir alternativas e explicações, conferir código, revisar diffs, escrever testes e documentar o uso de IA. Reconhecer respostas imprecisas e limites da ferramenta. Manter autoria: o aluno explica o que adotou e o que rejeitou.

Projeto: implementar uma funcionalidade com apoio de IA e registrar decisões. Entregar código revisado, testes, relato de um erro da IA e sua correção. Não enviar chaves, dados pessoais ou material privado a um provedor sem autorização da escola.

### 5. Aplicações com IA e RAG

Diferença entre modelo e produto, embeddings e recuperação, uso de fontes, respostas desconhecidas, avaliação, custos e privacidade. Trabalhar primeiro com busca convencional; comparar quando a busca semântica ajuda.

Projeto: assistente para uma base de conhecimento fictícia escrita pelo grupo. Entregar conjunto de perguntas de teste, respostas com fontes e relatório de respostas ruins. Se usar API externa, a escola deve fornecer conta supervisionada e limites; a plataforma CodeCampus não envia prompts para provedores automaticamente.

### 6. Agentes com ferramentas

Ferramentas com contratos, permissões por ação, aprovação humana e rastreabilidade. Prompt injection, tentativas de exfiltração, limitação de passos, orçamento, latência e avaliação. Autonomia progressiva, começando por ferramentas de leitura.

Projeto: agente de suporte com uma base simulada e ferramenta de abertura de ticket fictício. Exigir confirmação antes de alterar dados e produzir trilha explicável. Entregar casos de teste que demonstrem recusa de comandos maliciosos encontrados no conteúdo.

### 7. Cloud, entrega e confiabilidade

Containers, pipeline de testes, ambientes, storage privado, identidade AWS, métricas, logs e incidentes. Investigar latência, falhas e custos com exemplos reduzidos. Diferenciar observabilidade de gravar dados sensíveis. Praticar rollback e restauração em ambiente isolado.

Projeto: subir o app em ambiente de homologação supervisionado, com arquivos privados e pipeline. Simular uma falha e escrever post-mortem sem culpabilizar pessoas. Nunca permitir ao aluno usar credenciais administrativas da AWS; contas de laboratório devem ter orçamento e permissões definidos pela escola.

### 8. Projeto integrador e portfólio

Squad de três ou quatro alunos constrói um produto de utilidade escolar simulada. Acompanhamento quinzenal com decisões, testes, revisão de segurança e demonstração. Responsabilidade compartilhada sem ocultar a aprendizagem individual.

Entregas: design doc, API/interface, banco, testes relevantes, CI, guia de execução, análise de privacidade, avaliação da parte de IA e demo. Publicar somente código e exemplos fictícios após revisão do professor; arquivos reais da escola continuam privados no CodeCampus. Apresentação individual de cinco minutos e uma pequena mudança ao vivo ajudam a avaliar autoria.

## Avaliação recomendada

Para projetos: funcionalidade 40%, qualidade e testes 35%, documentação/apresentação 25% como rubrica inicial. Ajustar antes de receber entregas. A plataforma preserva critérios após a primeira entrega para manter comparabilidade. Cada nova submissão mantém uma versão e permite feedback específico.

Usar avaliações objetivas como checkpoints, junto com entrega prática, conversa e demonstração. O registro de mudança de aba deve servir à conversa com o aluno, sem concluir fraude automaticamente. Não penalizar uma necessidade de acessibilidade ou falha de equipamento sem revisão.

Critério implementado para certificado: todas as aulas publicadas concluídas, última versão de cada projeto com nota mínima 70/100 e todas as provas publicadas aprovadas com 70/100, seguido de emissão por professor/administrador. A conclusão da aula é autodeclarada pelo aluno, não medição de tempo de vídeo. O certificado é de curso livre e permanece privado.
