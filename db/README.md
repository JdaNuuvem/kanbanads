# Postgres — Kanban Ads & Dropshipping

Schema completo do painel mapeando **multi-assignee, mentions, activity feed, notificações, criativos, métricas, checklist e histórico**.

## Estrutura

```
db/
├── schema.sql          DDL: tabelas, índices, triggers, views
├── seed.sql            Dados iniciais (catálogos, equipe, exemplo)
├── docker-compose.yml  Postgres 16 local
└── README.md           Este arquivo
```

## Subir local

```bash
cd db
docker compose up -d
# espera ~5s
psql postgresql://kanban:kanban_dev_pwd@localhost:5432/kanban_ads -c "\dt"
```

`schema.sql` e `seed.sql` rodam automaticamente na primeira inicialização.

Pra resetar:
```bash
docker compose down -v && docker compose up -d
```

## Modelo de dados

```
users ─┬──< product_assignees >──┬─ products ──┬──< product_labels >── labels
       │                         │             ├──< creatives
       │                         │             ├──< metrics
       │                         │             ├──< comments ──< comment_mentions >── users
       │                         │             ├──< product_checklist
       │                         │             └──< product_history
       │                         │
       ├──< activity (by_id) ────┤
       ├──< activity_targets ────┘
       └──< notifications
```

Pontos importantes:

- **`product_assignees`** — M2M (resolveu o "atribuição múltipla").
- **`comment_mentions`** — registro normalizado das @menções.
- **`activity`** — feed global; cada evento referencia o produto e o autor.
- **`activity_targets`** — quem foi afetado por cada evento (mencionado/responsável). Trigger gera `notifications` automaticamente.
- **`notifications`** — view personalizada por usuário com flag `read`.
- **Generated column `cpa`** em `metrics` — calculado automaticamente.

## Views úteis

| View | Pra que serve |
|------|---------------|
| `v_product_metrics` | Agregados por produto (cost, revenue, profit, ROAS, CPA) |
| `v_user_workload` | Carga de trabalho — alimenta o gráfico do Dashboard |
| `v_user_stage_distribution` | Distribuição estágios → barra empilhada por usuário |
| `v_funnel` | Funil de produtos com tempo médio por estágio |
| `v_unread_counts` | Badge do sino |

Exemplos:

```sql
-- Carga de trabalho da equipe
SELECT * FROM v_user_workload;

-- Notificações não-lidas pra Ana
SELECT n.*, a.text, a.product_name, a.at
FROM notifications n
JOIN activity a ON a.id = n.activity_id
WHERE n.user_id = '22222222-2222-2222-2222-222222222222' AND n.read = false
ORDER BY n.created_at DESC;

-- Feed da equipe (últimas 50 atividades)
SELECT a.type, u.name AS by, a.text, a.product_name, a.at
FROM activity a LEFT JOIN users u ON u.id = a.by_id
ORDER BY a.at DESC LIMIT 50;
```

## Próximos passos pra produção

1. **Auth** — adicionar JWT/Supabase/Auth0; popular `password_hash` ou usar SSO.
2. **RLS** — descomentar bloco no fim do `schema.sql`; políticas por `role`.
3. **Sync** — substituir o `localStorage` do app por chamadas REST/GraphQL → Postgres.
4. **Realtime** — `LISTEN/NOTIFY` em `activity` ou Supabase Realtime pra empurrar notificações em tempo real.
5. **Backup** — `pg_dump` agendado (diário).
6. **Migrations** — mover pra um framework (sqlx/Prisma/Drizzle/Knex/Flyway) em vez de `schema.sql` monolítico.
