# CodeCampus: tutorial de integração e primeira aula

Atualizado em 04/10/2026. Os passos abaixo correspondem ao código deste projeto. Comandos para PowerShell no Windows. Não é necessário contratar hospedagem para começar.

## 1. Professor e aluno já têm ambientes diferentes

O sistema é para **professores e alunos**. Administração e responsáveis são perfis adicionais.

| Perfil demo | E-mail | Senha fictícia | O que faz |
|---|---|---|---|
| Professor | teacher@demo.codecampus.test | Aprender!2026 | Aulas, materiais, projetos, avaliações, notas e chamada de suas turmas |
| Aluno | student@demo.codecampus.test | Aprender!2026 | Aulas publicadas, materiais, entregas, provas e progresso |
| Administrador | admin@demo.codecampus.test | Aprender!2026 | Contas, turmas, professores, matrículas e vínculos |
| Responsável | guardian@demo.codecampus.test | Aprender!2026 | Acompanhamento do aluno vinculado |

Use duas janelas/perfis de navegador, ou uma janela normal e uma anônima, para testar professor e aluno simultaneamente. Duas abas da mesma janela normalmente compartilham o cookie: entrar como professor altera a sessão compartilhada. Não é uma limitação de perfis da plataforma.

## 2. O que é gratuito e o que é condicionado

| Opção | Front e API | Banco | Arquivos | Condição |
|---|---|---|---|---|
| Começo mais simples | Seu computador | SQLite local | Pasta privada local | Sem mensalidade de hospedagem; seu PC precisa estar ligado |
| Banco PostgreSQL | Seu computador | PostgreSQL local | Pasta privada local | Software sem tarifa de banco; Docker Desktop tem condições de licença |
| Integração AWS | Seu computador | SQLite/PostgreSQL local | S3 privado | Gratuidade depende do plano/créditos/prazo e consumo AWS |
| Link HTTPS temporário | Seu computador + túnel | Banco local | Local ou S3 | Para testes; endereço e disponibilidade não são permanentes |

Energia, equipamento e sua conexão com a internet continuam sendo necessários. **Não há uma promessa de front, API, banco e AWS hospedados gratuitamente para sempre.**

Para novas contas elegíveis, a AWS tem Free account plan com prazo de até seis meses ou até consumir os créditos, o que acontecer primeiro. Não atualize para Paid plan supondo que não haverá cobrança; contas pagas podem cobrar uso além dos créditos. Contas antigas têm outras regras. Verifique sua situação no Billing antes de provisionar. [Planos oficiais AWS](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), [FAQ de elegibilidade](https://aws.amazon.com/free/free-tier-faqs/).

O Docker Desktop inclui uso educacional na gratuidade; usos empresariais maiores podem exigir assinatura. A rota SQLite abaixo não depende de Docker. [Licenciamento Docker](https://docs.docker.com/subscription-billing/desktop-license/).

## 3. Entenda a integração antes de instalar

```text
Navegador (professor / aluno)
             |
             v
http://127.0.0.1:8000
   |-- /          -> HTML, CSS e JavaScript do front
   |-- /static    -> recursos da interface
   |-- /api       -> API FastAPI
                       |-- SQLite ou PostgreSQL: contas e dados acadêmicos
                       |-- armazenamento local ou S3: arquivos privados
                       |-- ClamAV: verificação de upload quando configurado
```

**Não precisa subir o front separadamente.** O FastAPI já entrega a interface. Os pedidos do front usam `/api` na mesma origem; isso conecta cookies, login e CSRF corretamente. Não existe etapa obrigatória de React/Vite/npm build.

GitHub hospeda o código; GitHub Pages hospeda seu portfólio estático. Eles não executam este backend Python nem seu banco. Publicar somente `apps/web` no Pages separaria o front de sua API e não produziria um sistema funcional.

## 4. Rodar tudo localmente, sem AWS e sem Docker

Instale Python 3.11+ e Git pelos distribuidores oficiais. Abra PowerShell.

**Nesta máquina o projeto já está em `C:\Repositorios\codecampus`.** Nesse caso, use `cd C:\Repositorios\codecampus` e pule o clone. Em outro computador:

```powershell
git clone https://github.com/thiago-alcaras/thiago-alcaras.github.io.git
cd thiago-alcaras.github.io/projects/CodeCampus
```

Se `.venv` ainda não existir:

```powershell
python -m venv .venv
```

Instale as dependências e selecione explicitamente a configuração local no terminal atual:

```powershell
.venv/Scripts/python -m pip install -r requirements.txt
$env:APP_ENV='development'
$env:APP_ORIGIN='http://127.0.0.1:8000'
$env:DATA_DIR='data'
$env:STORAGE_BACKEND='local'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

Em um **banco novo e vazio**, crie os exemplos:

```powershell
.venv/Scripts/python -m apps.api.cli seed-demo
```

Se a demo já existe, não execute esse comando novamente. A mensagem “Use um banco vazio” protege seus dados; não apague o banco para resolver isso.

Inicie o sistema:

```powershell
.venv/Scripts/python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Abra **exatamente** `http://127.0.0.1:8000`, e não `http://localhost:8000`, pois a origem configurada deve coincidir com a do navegador. Deixe o terminal aberto. Ctrl+C encerra o servidor; o banco e arquivos permanecem.

Verificação em outro terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Resultado esperado: `status=ok` e `storage=local`. Front, API e banco já estão conectados. O banco é `data/codecampus.db`, e arquivos ficam em `data/uploads/`; ambos privados e ignorados pelo Git.

## 5. Contas reais e a organização da escola

As contas demo são somente para testes. Para começar com contas próprias, use um diretório de dados novo e uma instalação acessível apenas localmente:

```powershell
$env:DATA_DIR='data/escola'
.venv/Scripts/python -m apps.api.cli create-admin --email admin@sua-escola.com --name 'Administração'
```

Digite a senha quando solicitada; ela não aparece no terminal. Não rode `seed-demo` nesse banco. Inicie a API com as mesmas variáveis do terminal. Essa configuração ainda é local/desenvolvimento, não uma implantação pública pronta para dados de menores.

Como administrador:

1. **Pessoas e acessos → Cadastrar pessoa**: crie um professor e os alunos, cada um com sua própria conta.
2. **Minhas turmas → Nova turma**: informe título, faixa, horário e professor responsável.
3. Abra a turma → **Matrículas**: vincule os alunos.
4. Distribua acessos por um canal privado; cada pessoa altera a senha em Minha conta.

Como professor:

1. Veja apenas as turmas atribuídas à sua conta.
2. Crie módulos e aulas; prepare o roteiro e publique quando pronto.
3. Envie materiais e publique projetos/avaliações.
4. Revise entregas, registre notas/feedback e faça a chamada.

Como aluno:

1. Veja apenas turmas nas quais está matriculado.
2. Abra aulas publicadas, leia o roteiro e baixe os materiais.
3. Envie projetos em ZIP/documento ou link HTTPS.
4. Faça provas e acompanhe progresso/feedback.

## 6. PostgreSQL local com Docker

Use esta opção quando quiser começar com o mesmo tipo de banco previsto para produção. Requer Docker Desktop funcionando com containers Linux.

Na raiz do projeto, **crie `.env` somente se ainda não existir**:

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item .env.example .env
}
notepad .env
```

Substitua `POSTGRES_PASSWORD`. Para o compose atual, use uma senha longa formada por letras/números/hífens, evitando caracteres reservados de URL como `@`, `:`, `/` e `$`. Não publique o arquivo.

Mantenha:

```dotenv
APP_ENV=development
APP_ORIGIN=http://127.0.0.1:8000
STORAGE_BACKEND=local
CLAMAV_HOST=
```

Pare a API Python local antes de ocupar a mesma porta. Então:

```powershell
docker compose up --build -d
docker compose logs --tail 50 app
```

Para esse banco PostgreSQL vazio, escolha **um** bootstrap:

```powershell
# Somente demonstração:
docker compose exec app python -m apps.api.cli seed-demo
```

ou

```powershell
# Contas próprias, sem usuários demo:
docker compose exec app python -m apps.api.cli create-admin --email admin@sua-escola.com
```

A conexão app → db já está no compose. O banco não tem porta pública; o app usa o endereço interno `db:5432`. Dados persistem nos volumes `postgres-data` e `private-data`.

`docker compose down` para os serviços sem apagar volumes. **Não use `down -v` para desligar uma escola em uso**, pois apaga os volumes. O SQLite da opção anterior e esse PostgreSQL são bancos diferentes; mudar o backend não migra usuários nem arquivos automaticamente.

## 7. AWS S3: integração com gratuidade condicionada

Esta etapa adiciona somente storage AWS. Front/API/banco continuam no seu computador. Não cria EC2, RDS, load balancer ou NAT Gateway.

### 7.1 Conferir conta e autenticar

No console AWS, verifique plano, validade de créditos e região. Instale AWS CLI v2 pelo [distribuidor oficial](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). O login por navegador requer CLI 2.32.0+.

Use identidade IAM/federada autorizada, sem colocar credenciais root no app. Seu administrador AWS deve habilitar login de desenvolvimento e as permissões apropriadas. Para provisionar a stack, a identidade precisa de acesso CloudFormation, criação/configuração de S3 e criação de role/policy IAM.

```powershell
aws --version
aws login --profile escola-admin
aws sts get-caller-identity --profile escola-admin
```

Se usa IAM Identity Center, configure com `aws configure sso --profile escola-admin` e entre com `aws sso login --profile escola-admin`. Não é necessário copiar chaves para o código. [Autenticação oficial AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html).

### 7.2 Criar bucket privado

Somente após verificar as condições gratuitas da sua conta:

```powershell
aws cloudformation validate-template --template-body file://infra/aws/storage.yaml --profile escola-admin --region sa-east-1
aws cloudformation deploy --stack-name codecampus-storage --template-file infra/aws/storage.yaml --capabilities CAPABILITY_IAM --profile escola-admin --region sa-east-1
aws cloudformation describe-stacks --stack-name codecampus-storage --profile escola-admin --region sa-east-1 --query 'Stacks[0].Outputs'
```

Guarde `BucketName` e `ContentPolicyArn`. O bucket bloqueia acesso público, exige TLS, usa AES256 e versionamento. Sua criação não transforma os arquivos em conteúdo público.

O template também cria uma role **para ECS**. Essa role não pode ser usada diretamente por `AWS_PROFILE` no seu computador: o perfil precisa de uma identidade local com permissão. Associe `ContentAccessPolicy` à identidade IAM usada para executar a aplicação, separada da identidade administrativa do provisionamento, ou configure permission set equivalente no Identity Center. Essa policy permite operações somente em `private/*`.

### 7.3 Rodar API no computador com S3

Para evitar copiar credenciais para containers, o caminho mais simples de desenvolvimento é **Python no host**, usando o perfil da CLI:

```powershell
aws login --profile escola-app
$env:AWS_PROFILE='escola-app'
$env:AWS_REGION='sa-east-1'
$env:S3_BUCKET='SUBSTITUA-PELO-BucketName'
$env:STORAGE_BACKEND='s3'
$env:APP_ENV='development'
$env:APP_ORIGIN='http://127.0.0.1:8000'
$env:DATA_DIR='data/escola-s3'
```

O perfil `escola-app` deve corresponder à identidade que recebeu a policy de conteúdo e suporte ao login de desenvolvimento. Nunca use `escola-admin` como conta cotidiana do app.

Se for um banco SQLite novo, crie a administração com `create-admin` nesse terminal. Não troque um banco com arquivos locais para S3 sem copiar seus objetos: metadados e armazenamento precisam permanecer coerentes.

```powershell
.venv/Scripts/python -m apps.api.cli create-admin --email admin@sua-escola.com
.venv/Scripts/python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Verifique `/api/health`: deve indicar `storage=s3`. Isso confirma a seleção do backend, **não** testa autorização AWS. Faça o teste real: professor envia um PDF, aluno matriculado baixa, outro aluno sem matrícula não consegue acessar. Um aluno nunca precisa de conta AWS.

Se o SDK não reconhecer o login da CLI, use o fallback oficial: crie um perfil `escola-app-process` com `credential_process = aws configure export-credentials --profile escola-app --format process` no arquivo privado `%USERPROFILE%\.aws\config`, mantenha o perfil original e selecione `AWS_PROFILE=escola-app-process`. Não execute esse comando de exportação para copiar credenciais ao repositório. [Compatibilidade de SDKs](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html#cli-configure-sign-in-process).

### 7.4 PostgreSQL local + API no host + S3

O overlay `compose.host.yaml` libera o PostgreSQL **somente em loopback** para a API Python do seu computador:

```powershell
docker compose -f compose.yaml -f compose.host.yaml up -d db
```

Use a senha de PostgreSQL que definiu no `.env`, sem colocá-la no histórico do terminal:

```powershell
$campusDbSecure = Read-Host 'Senha do PostgreSQL' -AsSecureString
$campusDbPlain = [System.Net.NetworkCredential]::new('', $campusDbSecure).Password
$campusDbEncoded = [uri]::EscapeDataString($campusDbPlain)
$env:DATABASE_URL="postgresql+psycopg://codecampus:${campusDbEncoded}@127.0.0.1:5432/codecampus"
```

Mantenha as variáveis S3 da etapa anterior e reinicie a API Python no host. Crie administração apenas se esse banco estiver vazio. Pare o container `app` se ele já estiver ocupando a porta 8000 (`docker compose stop app`).

Agora a integração completa é: front servido pela API Python → PostgreSQL em Docker → S3 privado na AWS. Nenhuma credencial precisa ser embutida na imagem. Em deploy real na AWS, use role do compute, não perfil pessoal.

### 7.5 Custos que continuam existindo

S3 contabiliza armazenamento, requisições, transferências e versões antigas; créditos podem cobrir uso elegível, mas não mudam esses serviços para gratuitos permanentemente. Evite vídeos grandes nessa fase. Use PDFs pequenos para aprender. O template retém o bucket quando a stack é excluída; objetos/versionamento continuam existindo e podem continuar consumindo saldo. Planeje limpeza explícita após guardar uma cópia, sem apagar materiais da escola inadvertidamente.

## 8. Publicar um link de teste sem contratar hospedagem

Opcional, somente com **dados fictícios** e contas de teste próprias. Não exponha as quatro contas demo conhecidas publicamente. Um túnel disponibiliza seu PC na internet; mantenha-o ligado e encerre o túnel ao terminar.

Instale `cloudflared` seguindo a [documentação oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Use Quick Tunnel para homologação, não como infraestrutura permanente da escola. Endereço muda a cada execução, sem garantia de disponibilidade; há limite de 200 requisições em andamento. [Limites e uso oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

1. Inicie o túnel em um terminal e copie o endereço HTTPS emitido:

```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```

2. No terminal da API, pare Uvicorn, ajuste a origem e reinicie usando as mesmas variáveis de banco/storage:

```powershell
$env:APP_ORIGIN='https://SUBDOMINIO-GERADO.trycloudflare.com'
.venv/Scripts/python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

3. Acesse esse endereço com as contas próprias de teste. O banco e arquivos permanecem privados no PC/S3, não no GitHub. Enquanto o túnel existir, a aplicação pode ser alcançada externamente.

O modo development acima é somente demonstração com dados fictícios. Para operação pública com dados reais, use `APP_ENV=production`, origem HTTPS fixa e scanner privado disponível. O código exige `CLAMAV_HOST` em produção. Compose pode subir ClamAV com `CLAMAV_HOST=clamav` e `docker compose --profile scanning up`; se a API roda no host, essa resolução interna não funciona: providencie conectividade local ao scanner sem publicar sua porta na internet. HTTPS temporário, sozinho, não configura backups, scanner nem operação contínua.

Não é necessário abrir as portas do seu roteador para esse teste. Ctrl+C no terminal do túnel encerra o link. Ao voltar ao uso local, ajuste APP_ORIGIN de volta para `http://127.0.0.1:8000` e reinicie a API.

## 9. Primeira aula: arquivo do professor para os alunos

Foram preparados três materiais locais, privados e fora do Git:

- `output/pdf/aula-01-javascript-missoes.pdf`: aula de 80 minutos, objetivos, conceitos, desafio e checklist. **Pode enviar aos alunos.**
- `output/pdf/aula-01-kit-inicial.zip`: HTML/CSS/JavaScript inicial, com TODOs. **Pode enviar aos alunos.**
- `output/pdf/aula-01-guia-professor.md`: condução, intervenções e gabarito da checagem. **Guarde para o professor; não anexe à aula dos alunos.**

A aula é original, para referência de 12-17 anos, introdutória a JavaScript e DOM. Use com adolescentes iniciantes ou como revisão da turma final. Não exige serviço de IA, chave de API ou assinatura. Crianças menores precisam de adaptação pelo professor.

### Publicar na demonstração existente

1. Entre como `teacher@demo.codecampus.test`.
2. **Minhas turmas → Engenharia & IA · Future Builders → Acessar turma**. O aluno demo está matriculado nessa turma; nas outras não verá a aula.
3. Clique **+ Módulo**. Nome: `Oficina de revisão · JavaScript e DOM`; posição: `1` ou a posição desejada.
4. No módulo, clique **+ Aula**. Nome: `Aula 01 · Meu painel de missões`; duração: `80` minutos. Copie o roteiro de `aula-01-roteiro-plataforma.txt`, também entregue na pasta output/pdf, para Conteúdo e roteiro.
5. Marque **Publicar para os alunos** e salve.
6. Abra a aula e clique **Enviar anexo**. Selecione primeiro o PDF; depois repita para enviar o ZIP. **Não use somente “Enviar material” na turma se quiser o arquivo vinculado à aula específica.**
7. Em outra sessão de navegador, entre como `student@demo.codecampus.test`, abra a turma e a aula. Os anexos aparecem para baixar. O aluno pode abrir o PDF no leitor do navegador/computador e extrair o ZIP para trabalhar. Esta versão entrega os arquivos como download, não como um editor de código ou player incorporado.
8. O aluno marca a aula concluída quando terminar. Isso registra conclusão autodeclarada, não tempo assistido.

### Criar o projeto da aula

Professor → **Projetos → Novo projeto**:

```text
Título: Meu painel de missões
Turma: a mesma turma da aula
Descrição: Implemente o cadastro de missões, valide títulos com menos de
3 caracteres, mostre o total e registre 3 testes manuais. Envie o ZIP
do projeto e explique uma decisão em suas próprias palavras.
Rubrica:
Funcionalidade:40
Qualidade e testes:35
Documentação e apresentação:25
```

Defina prazo real. Aluno → **Projetos → Ver projeto → Entregar projeto**: anexe o ZIP ou informe repositório HTTPS e descreva o trabalho. Professor abre a entrega, avalia os critérios e publica feedback. O aluno pode enviar nova versão, preservando o histórico.

## 10. Problemas comuns

| Sintoma | Verifique |
|---|---|
| “Conta inválida” | Banco selecionado e bootstrap correspondente; SQLite e PostgreSQL não compartilham usuários |
| Professor não vê turma | Atribuição do professor na criação da turma pelo administrador |
| Aluno não vê conteúdo | Matrícula na turma e aula marcada como publicada |
| PDF não aparece na aula | Anexo enviado pela aula, com lesson_id; material genérico fica na área de materiais da turma |
| 403 ao salvar | APP_ORIGIN exatamente igual à origem do navegador; sessão/CSRF após login |
| Porta 8000 ocupada | API anterior ou container app já está rodando; pare um deles |
| Upload 503 | Scanner configurado está indisponível/ainda atualizando assinaturas |
| AWS AccessDenied | Identidade do perfil e policy de conteúdo; role ECS não equivale ao perfil local |
| AWS token expirado | Renove login/SSO do perfil da aplicação e tente novamente |
| S3 selecionado, download local antigo falha | Troca de storage sem migração dos arquivos; preserve IDs/objetos e metadados |
| Tudo para ao desligar PC | Na rota gratuita local, o PC é o servidor |

## 11. Próximo passo para uma escola em operação

Comece com o teste local professor → upload → aluno → entrega → feedback. Depois conecte PostgreSQL e, se sua conta for elegível, S3. Homologue scanner, restore, concorrência, HTTPS e permissões antes de usar dados reais. Hospedagem contínua, identidade forte, domínio estável e backups precisam de planejamento próprio; este guia não promete uma escola inteira em AWS sem custo permanente.
