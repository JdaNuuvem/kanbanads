# Configuração de segredos

**NUNCA** commitar `.env` no repositório.

## Variáveis de ambiente essenciais

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL do Postgres (com credenciais) |
| `JWT_SECRET` | Chave secreta p/ JWT (mín 32 chars aleatórios) |
| `CORS_ORIGINS` | Domínios do front (separados por vírgula) |
| `NODE_ENV` | `production` / `development` / `test` |
| `PORT` | Porta do servidor (default: 3001) |

## Opcionais

| Variável | Descrição |
|----------|-----------|
| `SENTRY_DSN` | DSN do Sentry para captura de erros |
| `S3_BUCKET` | Bucket S3/R2 para upload de criativos |
| `S3_ENDPOINT` | Endpoint S3-compatible |
| `S3_REGION` | Região (default: auto) |
| `S3_ACCESS_KEY` | Access key |
| `S3_SECRET_KEY` | Secret key |
| `UPLOAD_DIR` | Diretório local de upload (fallback sem S3) |

## Como configurar em produção

### Railway
1. `railway login` e `railway link`
2. `railway vars set DATABASE_URL=... JWT_SECRET=...`
3. `railway up`

### Fly.io
1. `fly launch` (selecionar Dockerfile)
2. `fly secrets set DATABASE_URL=... JWT_SECRET=...`
3. `fly deploy`

### Docker + VPS
```bash
docker build -t kanban-ads-api backend/
docker run -d -p 3001:3001 \
  -e DATABASE_URL=... \
  -e JWT_SECRET=... \
  -e CORS_ORIGINS=... \
  kanban-ads-api
```
