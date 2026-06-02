# Batra Butterfly — Footwear Business OS

## Overview

Full-stack web application for managing a footwear distribution business. Built with React + Vite (frontend) and Express 5 (backend) in a pnpm monorepo.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/batra-butterfly)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Charts**: Recharts
- **Animations**: Framer Motion
- **Styling**: Tailwind CSS (dark theme, black background)

## Modules

1. **Retailer Credit System** — outstanding balances, credit limits, overdue detection, ledger entries
2. **Top Retailer Analytics** — purchase trends, growth rate, under-buying alerts
3. **Staff Performance** — leaderboard, commission tracking, monthly filters
4. **AI Photo Stock Management** — image upload → AI article code suggestion → confirm to update stock
5. **Dashboard** — KPI summary, recent activity feed, top retailers

## Database Tables

- `retailers` — id, name, phone, credit_limit
- `ledger_entries` — id, retailer_id, type (sale/payment), amount, note, date
- `staff` — id, name, commission_rate
- `sales` — id, retailer_id, staff_id, amount, date
- `products` — id, article_code, name, price, current_stock, image_url
- `stock_movements` — id, product_id, type (in/out), quantity, image_url, date

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Routes

- `/` — Dashboard
- `/retailers` — Retailer list
- `/retailers/:id` — Retailer detail + ledger
- `/analytics` — Analytics charts and under-buying detection
- `/staff` — Staff leaderboard
- `/stock` — Stock inventory
- `/stock/upload` — AI-assisted photo stock management

## Design

- Pure black (#000000) background
- White (#FFFFFF) text with gray (#A0A0A0) accents
- Inter font
- Framer Motion for all transitions and animations
- Glassmorphism-style cards
- Indian Rupee (₹) currency formatting
