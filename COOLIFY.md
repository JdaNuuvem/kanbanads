# Coolify Deploy — Kanban Ads

## Estrutura

```
/
├── Dockerfile          # Coolify detecta automaticamente
├── .env.coolify        # Template de variáveis (copiar pro Coolify UI)
├── .dockerignore       # Exclui frontend e dev files
└── backend/
    ├── src/            # Código do servidor Express
    └── migrations/     # SQL versionado (roda no startup)
```

## Passo a passo

### 1. No Coolify
- New Service → Application
- Source: este repositório Git
- Build Pack: **Dockerfile** (auto-detectado)

### 2. Environment Variables
Copiar o conteúdo de `.env.coolify` para o campo de variáveis do Coolify e preencher os valores reais:
- `DATABASE_URL` — Coolify pode provisionar um Postgres pra você, ou use um externo
- `JWT_SECRET` — gere com `openssl rand -hex 32`
- `CORS_ORIGINS` — domínio do seu frontend

### 3. Domains
- Porta exposta: `3001`
- Domínio: defina o seu (ex: `api.kanban.seudominio.com`)

### 4. Health Check
- Path: `/health`
- Port: `3001`
- Já configurado no Dockerfile (curl a cada 15s)

### 5. Postgres
Se for usar o Postgres do Coolify:
1. New Service → Database → PostgreSQL
2. Coolify vai gerar a `DATABASE_URL` automaticamente
3. Use essa URL no `DATABASE_URL` do backend

### 6. Deploy
- O Dockerfile:
  1. Instala dependências de produção
  2. Copia `src/` e `migrations/`
  3. Na inicialização: **roda migrations** (`node src/config/migrate.js`)
  4. Depois: inicia o servidor (`node src/index.js`)

### 7. Pós-deploy
- Acesse `https://seu-dominio/health` → deve retornar `{"status":"ok"}`
- O frontend (HTML estático) pode ser servido separadamente ou pelo mesmo domínio
