# Operação e segurança

## Código público, dados privados

O repositório contém código, infraestrutura, screenshots da demonstração e roteiros fictícios. `.env`, bancos, uploads, backups, logs, chaves e ambiente virtual estão ignorados. A imagem Docker também os exclui. Não adicionar arquivos privados com `git add -f`.

A API não oferece listagem pública de usuários, aulas, projetos ou arquivos. Cada acesso verifica sessão e turma no servidor; controles da interface são apenas complementares. O perfil de professor acessa exclusivamente as turmas atribuídas. Administradores têm acesso amplo e devem ser poucas pessoas. O vínculo de responsável é registrado pela administração após conferir consentimento fora da plataforma; isso não substitui documentação, política de privacidade ou a governança de dados da escola.

## Produção

Defina `APP_ENV=production`, `APP_ORIGIN=https://seu-dominio`, `DATABASE_URL`, `STORAGE_BACKEND=s3`, `S3_BUCKET`, `AWS_REGION` e `CLAMAV_HOST`. A inicialização recusa origem HTTP, S3 sem bucket e produção sem scanner. A API não usa chave estática própria: sessões são tokens aleatórios e o banco armazena somente seus hashes. Proteja o banco e as credenciais AWS.

Configure HTTPS no load balancer/reverse proxy, PostgreSQL privado com backups e credenciais individuais do processo, scanner acessível somente pela rede privada, quotas de upload, limites de conexão/request no ingress e alertas. O Docker expõe a aplicação somente em loopback por padrão. Compute e TLS não são criados pela stack de storage.

O `APP_ORIGIN` deve coincidir exatamente com a origem do navegador. O servidor não confia em `X-Forwarded-For` por padrão (`--no-proxy-headers` no container). Se houver ingress, configure os proxies confiáveis explicitamente; não habilite confiança em qualquer origem. Rate limit de login usa IP real observado e e-mail, persistido no banco; atrás do ingress sem configuração, o limite por IP é compartilhado entre usuários.

## Upload e scanner

Para compose:

```powershell
# No .env privado: CLAMAV_HOST=clamav
docker compose --profile scanning up --build -d
```

A imagem ClamAV precisa baixar e atualizar suas assinaturas. Enquanto não estiver pronta, o upload retorna 503. O arquivo é enviado pelo protocolo INSTREAM; malware, limites de scan excedidos e erros não recebem aprovação. `infra/clamd.conf` alinha o limite do stream a 100 MB; se aumentar MAX_UPLOAD_MB, aumente também os limites do scanner e do ingress, observando recursos. Não publique a porta 3310 na internet. Não houve execução de um scanner real neste ambiente; os testes cobrem respostas simuladas OK, FOUND e ERROR.

No modo de desenvolvimento sem `CLAMAV_HOST`, a verificação antivírus é omitida. Extensões e assinatura básica não comprovam ausência de malware; arquivos são baixados como anexos e nunca executados pelo servidor. Nunca tratar ZIP do aluno como código confiável no servidor. Antes de criar um executor educacional, desenhe uma sandbox separada, sem acesso ao banco, storage, credenciais ou rede interna.

## Sessões e recuperação

Cookies HttpOnly, SameSite Strict e Secure em produção; expiração absoluta de oito horas. POST/PUT/PATCH/DELETE autenticados exigem token CSRF retornado por `/auth/me`, além da verificação de origem quando presente. Logout remove a sessão; desativação e troca/reset de senha invalidam todas as sessões da pessoa. Não há autoinscrição ou redefinição pública por e-mail.

A administração deve conferir identidade antes de redefinir senha e usar canal privado para compartilhá-la. O endpoint administrativo nunca retorna a senha. A pessoa deve alterá-la em Minha conta. SSO/MFA e convites por e-mail ainda precisam de integração externa antes de uma operação com maiores exigências de identidade.

## Provas

Full screen, interceptação de copiar/colar, print shortcut e ocultação no CSS de impressão são medidas de interface. Não bloqueiam o sistema operacional, DevTools, câmera ou outro dispositivo. Não coletamos câmera, microfone ou gravação de tela. O aluno é informado sobre os eventos antes de iniciar.

O tempo e a tentativa são impostos pela API. Gabaritos não são enviados ao aluno, answers inválidas são rejeitadas, tentativas expiradas não aceitam respostas e a nota é calculada sobre o snapshot no servidor. Questões objetivas não substituem projetos, demonstração oral e revisão de autoria. Ocorrências não descontam nota automaticamente; professores devem considerar falhas de conexão, acessibilidade e contexto.

## Verificação antes de dados reais

Homologar PostgreSQL e concorrência, S3 e políticas IAM reais, ClamAV real, restore de banco/storage, TLS, observabilidade e o fluxo de recuperação. Os testes locais não equivalem a auditoria de segurança independente. Atualizar dependências e fixar versões/digests de imagens no processo de release. A demo não deve ser exposta publicamente com credenciais conhecidas.
