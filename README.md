<div align="center">

# Tender Executive Dashboard

**Internal platform for Laser Power & Infra that tracks government and private tenders from discovery to supply.**
It manages AI relevance screening, automated document download and parsing, participation, EMD, reverse auctions, results, supply history and performance certificates.

<br />

[![Next.js](https://img.shields.io/badge/Next.js-16.4-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma-7.8-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)

[![Redux Toolkit](https://img.shields.io/badge/Redux_Toolkit-2.12-764ABC?style=for-the-badge&logo=redux&logoColor=white)](https://redux-toolkit.js.org)
[![Auth.js](https://img.shields.io/badge/Auth.js-v5_beta-7C3AED?style=for-the-badge&logo=auth0&logoColor=white)](https://authjs.dev)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com)
[![Vercel AI SDK](https://img.shields.io/badge/AI_SDK-7-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://ai-sdk.dev)
[![n8n](https://img.shields.io/badge/n8n-webhooks-EA4B71?style=for-the-badge&logo=n8n&logoColor=white)](https://n8n.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)

[![Deploy](https://img.shields.io/github/actions/workflow/status/laser-power-infra/tender-executive-dashboard/deploy.yml?branch=main&style=flat-square&label=deploy&logo=githubactions&logoColor=white)](.github/workflows/deploy.yml)
[![Node](https://img.shields.io/badge/node-22-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Image](https://img.shields.io/badge/image-ghcr.io-181717?style=flat-square&logo=github)](https://github.com/orgs/laser-power-infra/packages)
[![License](https://img.shields.io/badge/license-proprietary-red?style=flat-square)](#license)

<br />

<a href="https://skillicons.dev">
  <img src="https://skillicons.dev/icons?i=nextjs,react,ts,tailwind,redux,prisma,postgres,rabbitmq,aws,gcp,docker,githubactions,nodejs&perline=13" alt="Tech stack" />
</a>

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Tender lifecycle](#tender-lifecycle)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Database](#database)
- [API](#api)
- [Scheduled sync jobs](#scheduled-sync-jobs)
- [Deployment](#deployment)
- [Conventions](#conventions)
- [Further documentation](#further-documentation)
- [License](#license)

---

## Overview

The Tender Executive Dashboard is the single workspace the tender team uses to:

1. Collect tenders from GeM, non-GeM portals, railways and EPC sources into one merged table (`TenderMerged`).
2. Screen each tender with AI agents for relevance, then download and parse its documents automatically.
3. Track the decision, pre-participation, participation, EMD, reverse auction and result of each tender.
4. Keep supply history, sale bills, contracts and performance certificates linked to the original tender.
5. Sync data in both directions with Smartsheet, Google Sheets, Google Drive, network file shares and the ERP BOM API.

The app is a Next.js App Router project. The UI lives under `/v2`, and the root URL redirects to `/v2/tenders`.

## Features

| Area | What it does | Route |
|------|--------------|-------|
| **Tenders** | Virtualised, filterable table of all merged tenders with configurable columns, inline edits and a document viewer | `/v2/tenders` |
| **AI analysis** | Relevance verdicts, intelligence reports and feedback loop for the AI agents; re-queue of stuck jobs | `/v2/ai-analysis` |
| **Pre-participation** | Tenders accepted for bidding, with costing, BOM and checklist data | `/v2/pre-participation` |
| **Post-participation** | Bids submitted, reverse auction, result and rank tracking | `/v2/post-participation` |
| **Not participated** | Rejected tenders with reason codes | `/v2/not-participated` |
| **Quotation pending** | Live dockets (participated, or undecided with the deadline ahead) with no quotation number yet | `/v2/quotation-pending` |
| **EMD** | Earnest money deposits (BG and cash), status, reasons and email to bank / party | `/v2/emd` |
| **Supply history** | Sale bills, quotations, contracts, document ZIP download and certificate generation | `/v2/supply-history` |
| **Performance certificates** | Upload, split and AI date extraction for certificates of satisfactory performance | `/v2/performance-certificates` |
| **Railways** | Railway tenders and item mapping from QR sheets | `/v2/railways` |
| **Items** | Item master and knowledge base | `/v2/items` |
| **SOP** | Daily responsibilities and log toggles per user | `/v2/sop` |
| **Credentials** | Encrypted store for portal logins | `/v2/credentials` |
| **Activity** | Audit log of every server action and API call | `/v2/activity` |
| **Admin** | Column indices, column mappings, tender merging and SOP setup (admin / developer roles only) | `/v2/admin/*` |

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, standalone output), React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4, Base UI, `motion`, `lucide-react` icons, `sonner` toasts |
| State | Redux Toolkit + React Redux (`lib/slices`) |
| Tables | `@tanstack/react-virtual` |
| Auth | Auth.js (`next-auth` v5) with credentials + `bcryptjs`, role-based routes in `proxy.ts` |
| Database | PostgreSQL via Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| Queue | RabbitMQ (`amqplib`) for AI agent and automation jobs |
| AI | Vercel AI SDK (`ai`, `@ai-sdk/openai`) |
| Storage | AWS S3 or any S3-compatible store (MinIO, R2, Ceph), UNC network shares |
| Integrations | Smartsheet, Google Sheets, Google Drive, n8n webhooks, ERP BOM API |
| Documents | `pdf-lib`, `puppeteer-core` + Chromium, `handlebars`, `xlsx`, `archiver` |
| Deployment | Docker multi-stage image, GHCR, GitHub Actions, self-hosted runner |

## Architecture

```
                   ┌───────────────────────────────────────────────┐
  Browser  ──────► │ Next.js app (proxy.ts: auth + role checks)    │
                   │  ├─ app/(v2)        UI pages                   │
                   │  ├─ actions/        server actions (withLog)   │
                   │  └─ app/api/        route handlers (withLog)   │
                   └───────┬───────────────┬───────────────┬───────┘
                           │               │               │
                    Prisma │        amqplib│               │ HTTP
                           ▼               ▼               ▼
                     PostgreSQL       RabbitMQ        Smartsheet / Google /
                                         │            n8n / BOM API / S3
                                         ▼
                                  AI + automation workers
                                         │
                                         └──► POST /api/webhook/*  (back to app)
```

- **Server actions** (`actions/`) and **route handlers** (`app/api/`) hold all writes. Each one is wrapped in `withLog` (`lib/activity-logger.ts`), which writes an `ActivityLog` row.
- **Services** (`services/`) hold sync and indexing logic (Smartsheet, Google Sheets, network file indexers, contract and quotation sync).
- **Workers** are external. The app publishes jobs to RabbitMQ (`lib/queue`) and the workers call back the webhook routes.

## Tender lifecycle

A tender passes through asynchronous stages. The dashboard publishes a job, a worker processes it, and the worker calls a webhook. The webhook saves the result and publishes the next job.

```
AI relevance ──(valid = yes)──► Automation ──┬──► Parsing (per file, side branch)
      │                                      │
      │                                      └──► Ingestion ──► Intelligence ──► Completed
      │
      └──(valid = no)──► Rejected (stop)
```

| Queue | Purpose |
|-------|---------|
| `agent:relevance` | AI relevance check |
| `tender:tasks` / `automation-v2:tasks` | Document download (selected by `AUTOMATION_VERSION`) |
| `tender:parsing` / `automation-v2:parsing` | Per-file document parsing |
| `agent:ingestion` | Knowledge ingestion |
| `agent:intelligence` | Intelligence report |
| `agent:knowledgebase` | Item knowledge base |
| `agent:performance_cert` | Performance certificate extraction |

Full contract (payloads, client IDs, statuses, webhook envelope): [`docs/tender-lifecycle.md`](docs/tender-lifecycle.md).

## Project structure

```
.
├── app/
│   ├── (v2)/            # UI: /auth/* and /v2/* pages
│   └── api/             # Route handlers (sync, webhooks, files, CRUD)
├── actions/             # Server actions
├── components/
│   ├── v2/              # v2 UI (data-table, shell, feature folders, ui primitives)
│   ├── participation-flow/
│   └── tender-viewer/
├── controllers/         # Tender and attachment controllers
├── services/            # Sync, indexers, Smartsheet / Google / supply services
├── lib/
│   ├── queue/           # RabbitMQ queue config and publisher
│   ├── integrations/    # n8n
│   ├── services/        # PDF extraction and parsing
│   ├── slices/          # Redux slices
│   ├── activity-logger.ts  # withLog wrapper
│   ├── dal.ts           # Data access + requireApiKey
│   └── *.check.ts       # Runnable self-checks
├── prisma/              # schema.prisma, migrations, seed.ts
├── scripts/             # One-off backfills, syncs, migrations, publishers
├── emails/              # Email templates
├── docs/                # Lifecycle, scheduler, notification docs
├── auth.ts              # Auth.js config
├── proxy.ts             # Request proxy: auth, roles, public API paths
├── Dockerfile
└── docker-compose.yml
```

## Getting started

### Prerequisites

- Node.js 22
- PostgreSQL 14 or later
- RabbitMQ (optional; queue publishing is off when `RABBITMQ_URL` is not set)
- Chrome or Chromium (for PDF generation and GeM downloaders)
- Access to the network shares, Smartsheet and Google service account for the sync features

### Install and run

```bash
# 1. Install dependencies
pnpm install

# 2. Create your env file and fill in the values
cp .env.example .env

# 3. Apply migrations to your database (ask the maintainer before running against a shared database)
pnpm exec prisma migrate deploy

# 4. Optional: seed reference data
pnpm exec prisma db seed

# 5. Start the dev server (runs prisma generate first)
pnpm dev
```

Open [http://localhost:3125](http://localhost:3125). You are redirected to `/v2/tenders` and then to `/auth/login` if you have no session.

> [!WARNING]
> Never run `prisma db push` or `prisma migrate dev` against the shared or production database. Schema changes go through a reviewed migration, applied by the maintainer.

## Environment variables

[`.env.example`](.env.example) lists every variable with a tag:

- `[REQUIRED]` the app fails or is insecure without it.
- `[REQUIRED for <X>]` only feature X breaks when it is not set.
- `[OPTIONAL]` a safe fallback exists.

| Group | Variables |
|-------|-----------|
| Core | `DATABASE_URL`, `ENVIRONMENT` (`PROD` enables outbound sends), `EXTERNAL_API_KEY`, `FILE_CRYPTO_KEY`, `FILE_CRYPTO_IV`, `AUTOMATION_VERSION` (`v1` or `v2`) |
| Auth | `AUTH_SECRET` (Auth.js) |
| Queue / agents | `RABBITMQ_URL`, `TENDER_AUTOMATION_*_CLIENT_ID`, `TENDER_AGENT_*_CLIENT_ID` |
| Storage | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`, `S3_ACL` |
| Google | `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GDRIVE_CLIENT_EMAIL`, `GDRIVE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID` |
| Smartsheet | `SMARTSHEET_API_TOKEN`, `SMARTSHEET_SHEET_ID`, `LC_SMARTSHEET_ID`, `SALES_ENQUIRY_ITEM_LIST_ERP_ID` |
| Network shares | `INDEXER_NETWORK_PATH`, `COSTING_FILE_NETWORK_PATH`, `SUPPLY_NETWORK_PATH`, `CONDUTOR_PATH`, `OLD_FILES`, `TYPE_TEST_FILES_PATH`, `OLD_RA_EXCEL_PATH` |
| n8n | `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_URL_TEST`, `N8N_NOTIFICATION_WEBHOOK_URL`, `N8N_EMD_WEBHOOK_URL`, `N8N_RA_WEBHOOK_URL`, `REQUISITION_EMAIL_N8N_WEBHOOK_URL`, `N8N_CERTIFICATE_EMAIL_WEBHOOK_URL` |
| Misc | `CHROME_PATH`, `BOM_API_URL`, `BOM_API_KEY`, `MONITOR_ALERT_EMAIL` |

Production reads `.env.production` through `docker-compose.yml`. Do not commit real secrets.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Generate the Prisma client and start the dev server on port **3125** |
| `pnpm build` | Production build (standalone output); `postbuild` copies `public` and `.next/static` into `.next/standalone` |
| `pnpm start` | Start the built app on port **3126** |
| `pnpm build-start` | Generate, build and start in one step |
| `pnpm start-prod` | Run the standalone server (`node .next/standalone/server.js`) |
| `pnpm prisma:generate` | Generate the Prisma client into `generated/` |
| `pnpm typecheck` | `tsc --noEmit` |

One-off maintenance scripts live in [`scripts/`](scripts) and run with `tsx`:

```bash
pnpm exec tsx scripts/syncBgDetails.ts
```

Self-checks for core logic live next to the code as `lib/*.check.ts`:

```bash
pnpm exec tsx lib/tender-query.check.ts
```

## Database

- Schema: [`prisma/schema.prisma`](prisma/schema.prisma). Migrations: [`prisma/migrations`](prisma/migrations).
- Main models: `TenderMerged` (single source for tenders), `GemTender`, `NonGemTender`, `TenderFile`, `SupplyHistory`, `EmdMerged`, `PerformanceCertificate`, `Railways`, `Items`, `Bom`, `TypeTest`, `ActivityLog`, `User`, `Credential`.
- Column configuration: `ColumnIndex`, `ColumnMapping`, `ColumnGroup` drive the configurable table columns.
- Prisma client output is `generated/`. Regenerate after every schema change with `pnpm prisma:generate`.

## API

Route handlers live in [`app/api`](app/api). Access rules come from [`proxy.ts`](proxy.ts):

| Kind | Auth | Examples |
|------|------|----------|
| Session routes | Logged-in user for `POST`, `PATCH`, `PUT`, `DELETE` | `/api/tenders`, `/api/emd`, `/api/supply-history/*`, `/api/upload` |
| Sync routes | Admin or developer role | `/api/sync`, `/api/refresh-all` |
| Public API-key routes | `x-api-key` or `Authorization: Bearer` equal to `EXTERNAL_API_KEY` | `/api/external`, `/api/sync-dockets`, `/api/sync-bom`, `/api/sync-to-merged`, `/api/sync-costing-smartsheet` |
| Worker webhooks | API key | `/api/webhook/ai-relevance`, `/automation`, `/parsing`, `/ingestion`, `/intelligence`, `/feedback`, `/result`, `/performance-certificate` |
| Health | None | `/api/health` |

## Scheduled sync jobs

No scheduler runs inside the app. Point an external scheduler (cron, n8n, GitHub Actions) at the sync routes:

```bash
curl -X POST http://tender-executive-dashboard:3126/api/sync-dockets \
  -H "x-api-key: $EXTERNAL_API_KEY"
```

Job list and schedule: [`docs/scheduler.md`](docs/scheduler.md).

## Deployment

Each push to `main` in the `laser-power-infra` organisation runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. **Build & push** — builds the multi-stage [`Dockerfile`](Dockerfile) (Node 22, Chromium included) and pushes `ghcr.io/laser-power-infra/tender-executive-dashboard` with tags `latest` and the short commit SHA.
2. **Deploy** — a self-hosted Windows runner copies `docker-compose.yml` to `D:/tender-executive-dashboard`, pulls the image, restarts the container and keeps only the two newest images.

The container listens on port **3126** on the external `infra` Docker network. Network shares mount as external volumes (`infrastructure_condutor`, `infrastructure_indexer`, `infrastructure_supply`, `infrastructure_costing`, `infrastructure_old-files`).

Run it manually:

```bash
APP_VERSION=latest docker compose pull
docker compose up -d
```

## Conventions

- Wrap every server action and API route in `withLog` so it writes an activity log entry.
- Use `lucide-react` for all icons. No emoji or inline SVG icons.
- Do not use serif fonts.
- After an edit, update Redux state in place. Do not refetch the page data.
- Any change to queues, payloads, webhooks or statuses must also update [`docs/tender-lifecycle.md`](docs/tender-lifecycle.md) and `lib/tender-lifecycle.ts`.
- This project uses Next.js 16. APIs differ from older versions; check `node_modules/next/dist/docs/` before you write framework code.

## Further documentation

| Document | Topic |
|----------|-------|
| [`docs/tender-lifecycle.md`](docs/tender-lifecycle.md) | AI and automation pipeline, queues, webhooks, statuses |
| [`docs/scheduler.md`](docs/scheduler.md) | Scheduled sync jobs |
| [`docs/notifications.md`](docs/notifications.md) | Removed WhatsApp notifications, kept for rebuild |
| [`docs/epc-subcategory-rules.md`](docs/epc-subcategory-rules.md) | EPC sub-category classification |
| [`DESIGN.md`](DESIGN.md) | UI design system |
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents |

## License

Proprietary. Internal use by Laser Power & Infra only. All rights reserved.
