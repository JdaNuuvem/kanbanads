# Backend / API — Lista completa pra implementar

Organizado por camada, do mais essencial pro mais avançado.

---

## 1. Infraestrutura base

- [ ] **Stack** — escolher: Node + Express/Fastify + pg, Node + NestJS + Prisma, Bun + Hono + Drizzle, Python + FastAPI + SQLAlchemy, ou Supabase/Hasura (zero-código)
- [ ] **Conexão Postgres** — pool de conexões (pgbouncer em prod)
- [ ] **Variáveis de ambiente** — `.env`: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `NODE_ENV`
- [ ] **Migrations** — Prisma/Drizzle/Knex/Flyway (substitui `schema.sql` monolítico)
- [ ] **Logger** — pino ou winston, com request ID
- [ ] **CORS + Helmet** — só permitir o domínio do front
- [ ] **Rate limiting** — por IP e por usuário
- [ ] **Validação de payload** — Zod / Joi / class-validator
- [ ] **Tratamento global de erros** — formato JSON consistente `{error, code, details}`
- [ ] **Healthcheck** — `GET /health` (DB + uptime)

---

## 2. Autenticação & Autorização

- [ ] **Signup / Login** — bcrypt + JWT (access + refresh) ou sessions
- [ ] **Logout** — invalidar refresh token
- [ ] **Middleware `requireAuth`** — valida JWT, popula `req.user`
- [ ] **Middleware `requireRole(roles[])`** — checa `admin/gestor/editor/viewer`
- [ ] **Reset de senha** (opcional)
- [ ] **`SET app.current_user_id`** por request — pra RLS funcionar
- [ ] **Permissões por cargo** — matriz:
  - **Viewer**: só GET
  - **Editor**: CRUD em produtos atribuídos a ele
  - **Gestor**: CRUD em qualquer produto + reatribuir
  - **Admin**: tudo + gerenciar usuários

---

## 3. Endpoints — Users / Equipe

```
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
GET    /me                          # usuário atual
PATCH  /me                          # nome, cor, senha
GET    /users                       # lista equipe
POST   /users                       # admin cria membro
PATCH  /users/:id                   # admin edita (cargo, cor, ativo)
DELETE /users/:id                   # admin remove (soft delete: active=false)
```

---

## 4. Endpoints — Products (CORE)

```
GET    /products                    # ?stage=&assignee=&label=&favorite=&q=
GET    /products/:id                # full: labels, assignees, checklist, metrics agg
POST   /products                    # cria
PATCH  /products/:id                # nome, cor, fornecedor, favorite, etc
PATCH  /products/:id/stage          # MOVER de coluna (gera activity)
DELETE /products/:id                # soft delete (archived_at)
POST   /products/:id/duplicate

# M2M
PUT    /products/:id/assignees      # body: {userIds: [...]}
PUT    /products/:id/labels         # body: {labelIds: [...]}

# Checklist
PATCH  /products/:id/checklist/:itemId  # {done: true/false}
```

---

## 5. Endpoints — Métricas

```
GET    /products/:id/metrics              # ?from=&to=
POST   /products/:id/metrics              # nova entrada diária
PATCH  /metrics/:id                       # editar
DELETE /metrics/:id
GET    /products/:id/metrics/aggregate    # usa view v_product_metrics
```

---

## 6. Endpoints — Criativos

```
GET    /products/:id/creatives            # ?folder=CA1
POST   /products/:id/creatives
PATCH  /creatives/:id                     # status, ctr, cpm, spent, body_text
DELETE /creatives/:id
PATCH  /creatives/:id/folder              # mover entre CA1/CA2/UPSELLS/...
POST   /creatives/:id/duplicate
```

---

## 7. Endpoints — Comentários & @mentions

```
GET    /products/:id/comments
POST   /products/:id/comments      # body: {text}
                                   # parse @menções → cria comment_mentions
                                   # cria activity(type=mention) + targets
PATCH  /comments/:id               # só autor pode editar
DELETE /comments/:id               # autor ou admin
```

**Lógica do parser** (importante!):
- Regex `@(nome)` no texto → resolver pra `user_id`
- Inserir `comment_mentions` em batch
- Criar 1 activity `comment` + N activity `mention` (uma por mencionado)

---

## 8. Endpoints — Activity Feed

```
GET    /activity                   # ?type=&user=&product=&from=&to=&limit=50&cursor=
GET    /activity/me                # eventos onde EU sou target
GET    /products/:id/history       # histórico do produto
```

Paginação por **cursor** (timestamp + id), não offset (feed cresce muito).

---

## 9. Endpoints — Notificações

```
GET    /notifications              # do usuário logado, ?unreadOnly=true
GET    /notifications/count        # badge do sino — usa v_unread_counts
PATCH  /notifications/:id/read
POST   /notifications/read-all
DELETE /notifications/:id
```

---

## 10. Endpoints — Dashboard

```
GET    /dashboard/funnel           # usa v_funnel
GET    /dashboard/workload         # usa v_user_workload + v_user_stage_distribution
GET    /dashboard/kpis             # totais do mês: cost, revenue, profit, ROAS
GET    /dashboard/timeline         # série temporal de cost/revenue (gráfico)
```

---

## 11. Endpoints — Catálogos

```
GET    /stages                     # colunas (read-only do front)
GET    /labels
POST   /labels                     # admin
PATCH  /labels/:id                 # admin
DELETE /labels/:id                 # admin
```

---

## 12. Realtime (notificações ao vivo)

Escolher 1 das 3 abordagens:

- [ ] **WebSocket** (socket.io / ws) — server emite eventos pros usuários conectados
- [ ] **Server-Sent Events (SSE)** — `GET /events` com `text/event-stream` (mais simples)
- [ ] **Postgres LISTEN/NOTIFY** — backend escuta canal, repassa via WS/SSE

Eventos a emitir:
- `notification.new` — pro usuário-alvo
- `activity.new` — pra todos online (atualiza feed)
- `product.updated` — pra quem tá com o card aberto
- `presence` — quem tá online (bolinha verde)

---

## 13. Upload de arquivos (criativos)

- [ ] **Storage** — S3/R2/Supabase Storage
- [ ] `POST /uploads/sign` — devolve presigned URL
- [ ] Cliente faz `PUT` direto no storage
- [ ] `PATCH /creatives/:id` salva a URL
- [ ] Validação: tipo MIME, tamanho máx, vírus scan (opcional)

---

## 14. Import / Export

- [ ] `GET /export` — JSON completo (espelho da função do front)
- [ ] `POST /import` — upload JSON, valida, faz upsert em transação
- [ ] `GET /export/csv?type=products|metrics` — CSV pra Excel

---

## 15. Jobs em background

- [ ] **Scheduler** — node-cron / BullMQ / Postgres pg_cron
- [ ] **Job: stale alerts** — diário às 9h: notificar gestores sobre produtos parados em "Rodando" há > 7 dias
- [ ] **Job: daily digest** — email resumo da equipe (opcional)
- [ ] **Job: cleanup** — limpar notificações lidas > 30 dias
- [ ] **Job: backup** — `pg_dump` diário pro storage

---

## 16. Email / Push (opcional)

- [ ] **Provedor** — Resend / SendGrid / SES
- [ ] Email de mention quando offline > 1h
- [ ] Email de produto atribuído
- [ ] Push notification (web push API) — só pra mobile real

---

## 17. Observabilidade

- [ ] **Sentry** ou similar — captura de erros
- [ ] **Métricas Prometheus** — `/metrics` (latência, error rate)
- [ ] **Audit log** — quem fez o quê, quando (já parcial via activity)
- [ ] **Slow query log** — Postgres `log_min_duration_statement`

---

## 18. Testes

- [ ] **Unit** — funções puras (parser de menções, agregadores)
- [ ] **Integration** — endpoints com DB de teste (testcontainers)
- [ ] **E2E** — Playwright contra front+back stack completa
- [ ] **Seeds de teste** — fixtures determinísticas

---

## 19. Deploy

- [ ] **Containerização** — Dockerfile do backend
- [ ] **CI/CD** — GitHub Actions: lint → test → build → deploy
- [ ] **Hospedagem** — Railway / Fly.io / Render / Vercel + Supabase
- [ ] **DNS + HTTPS** — Cloudflare / Caddy / Traefik
- [ ] **Secrets manager** — não commitar `.env`
- [ ] **Backup automatizado** — Postgres dump pra S3

---

## 20. Front-end — adaptações necessárias

Não é "backend" mas vai junto:

- [ ] **Cliente HTTP** — fetch wrapper com auth header, retry, refresh token
- [ ] **State management** — substituir `localStorage` por React Query / SWR
- [ ] **Cliente realtime** — socket.io-client ou EventSource
- [ ] **Tela de login** — substituir o "perfil rápido" atual
- [ ] **Loading states** — skeletons em todas as telas
- [ ] **Error boundaries** — toasts pra erros de API
- [ ] **Optimistic updates** — drag de card não pode esperar request

---

## Resumo: prioridade mínima pra MVP

Se quiser cortar pra MVP funcional, faça **só estes**:

1. Infra (1) — sem testes, sem rate limit
2. Auth simples (2) — JWT só, sem refresh
3. CRUD de products + assignees + labels (4)
4. Comentários + mentions (7)
5. Activity + Notifications (8, 9)
6. Dashboard read-only (10)
7. Realtime via SSE (12) — só pra notificações

O resto é polimento.
