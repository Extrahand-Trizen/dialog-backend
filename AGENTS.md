# TrizenDialog Backend

Before implementing any code, read:

| File | Authority |
|------|-----------|
| `.cursor/rules/trizendialog.mdc` | Architecture boundaries, API contracts, database, Prisma, queues, Meta, security |
| `.cursor/rules/implementation-style.mdc` | Implementation shape — functional modules by default, rare classes |
| `.cursor/rules/no-enterprise-patterns.mdc` | No bases, interfaces-per-class, factories, or file sprawl |

**Stack:** TypeScript, Express, Prisma, PostgreSQL, Redis, BullMQ

**HTTP flow (all functions):**

```text
routes.ts → handlers.ts → service.ts → repository.ts → Prisma
```

**Async flow (all functions):**

```text
worker → processor.ts → orchestrator.ts → service.ts → repository.ts
```

**Classes allowed only for:** `AppError` hierarchy, `MetaWhatsAppClient`, BullMQ worker lifecycle, EventBus (optional object singleton).

**Primary API:** `POST /api/v1/events`

Meta is the source of truth for WhatsApp entities.

Do not generate controller/service/repository classes or DI chains for new modules unless class usage criteria are met.

Prefer the minimum number of files and the simplest correct implementation.
