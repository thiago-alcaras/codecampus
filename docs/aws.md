# AWS S3 privado

## Provisionar storage

Pré-requisitos: conta AWS escolhida pela escola, AWS CLI autenticada via SSO ou role autorizada, região definida e revisão dos custos. Não há credenciais fornecidas no repositório. O template cria um bucket novo com nome gerado, policy e uma role para ECS; não altera buckets existentes.

```powershell
aws sso login --profile escola
aws cloudformation deploy --profile escola --region sa-east-1 --stack-name codecampus-storage --template-file infra/aws/storage.yaml --capabilities CAPABILITY_IAM
aws cloudformation describe-stacks --profile escola --region sa-east-1 --stack-name codecampus-storage --query "Stacks[0].Outputs"
```

Use `BucketName` em `S3_BUCKET`. Atribua `TaskRoleArn` à aplicação no ECS, ou associe a managed policy de acesso à role do compute escolhido. Não use a role administrativa do provisionamento no processo da aplicação.

## Configuração no processo

```powershell
$env:STORAGE_BACKEND='s3'
$env:AWS_REGION='sa-east-1'
$env:S3_BUCKET='nome-retornado-pela-stack'
$env:AWS_PROFILE='escola'
.venv/Scripts/python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000
```

O SDK boto3 usa a cadeia padrão de credenciais. Em produção, prefira IAM Role; remova `AWS_PROFILE`. No container local, as credenciais do computador não são disponibilizadas automaticamente. Use um mecanismo de credenciais temporárias adequado ao seu ambiente; não monte diretórios pessoais inteiros nem grave chaves na imagem.

## Segurança do bucket e acesso

- BlockPublicAccess completo, BucketOwnerEnforced e ausência de ACL pública.
- Criptografia SSE-S3 AES256 e TLS obrigatório em bucket policy.
- Versionamento habilitado; multipart incompleto descartado após um dia.
- Retain protege o bucket contra exclusão incidental da stack. A aplicação não recebe permissões para configurar/excluir o bucket.
- IAM permite GetObject/PutObject/DeleteObject/AbortMultipartUpload somente em `private/*`.
- URLs presigned expiram após 60 segundos e a policy limita idade da assinatura. Elas são credenciais temporárias de acesso: quem recebe o link pode usá-lo até expirar. Não publicar ou registrar a URL completa. Revogação de matrícula bloqueia novos links; um link já emitido continua válido por até 60 segundos.

Referências oficiais: [presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) e [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).

## Homologar na conta real

1. Subir API com S3 configurado e uma conta fictícia de professor em uma turma de teste.
2. Enviar TXT/PDF válido pelo navegador. Confirmar objeto em `private/<id>` e metadados privados no banco.
3. Baixar usando aluno matriculado. Confirmar anexo e redirecionamento para URL temporária.
4. Tentar download deslogado e com aluno de outra turma: deve falhar antes de gerar URL.
5. Confirmar que acesso S3 anônimo não funciona e que o link expira.
6. Desativar o scanner e confirmar que upload em produção é recusado (503); testar arquivo de teste EICAR em ambiente isolado.
7. Verificar custo, quotas de tamanho, métricas, alarmes e backups do banco.

Os testes automatizados validam chamadas do SDK e autorização com cliente S3 simulado; não houve acesso a uma conta AWS de produção. O template está disponível para provisionamento, e precisa ser validado pela AWS no ambiente escolhido.

## Operação e dados

S3 versionado não substitui backup do banco. Restore precisa preservar a associação entre metadados e IDs dos objetos. DeleteObject em bucket versionado cria um delete marker: versões antigas continuam privadas e precisam de política de retenção/expurgo apropriada à escola. A policy da aplicação não permite DeleteObjectVersion.

Não mover o banco de demonstração local para S3 sem migrar seus arquivos: trocar o backend muda a origem de todos os downloads. Em migração, copie arquivos mantendo `private/<asset_id>`, valide checksums e preserve os metadados. Não tornar materiais públicos para usar GitHub Pages.

Para escala: S3 + CloudFront com acesso privado e URLs/cookies assinados, sem tornar o bucket público; uploads diretos em quarentena, EventBridge/SQS e scan/transcodificação. Essa arquitetura adicional não foi implementada nesta versão.
