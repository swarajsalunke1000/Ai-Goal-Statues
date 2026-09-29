# SaveIQ

A savings-goals dashboard with bank-linked funding, progress tracking, and an AI-style savings coach. Installable as a PWA.

## Tech stack

- [TanStack Start](https://tanstack.com/start) + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (Radix)
- Supabase (auth, Postgres, row-level security)
- Drizzle ORM / drizzle-kit for migrations
- Vite + vite-plugin-pwa

## Getting started

```bash
bun install
cp .env.example .env   # then fill in your Supabase values
bun run dev
```

## Scripts

| Command             | Description                |
| ------------------- | -------------------------- |
| `bun run dev`       | Start the dev server       |
| `bun run build`     | Production build           |
| `bun run preview`   | Preview the production build |
| `bun run lint`      | Lint the project           |
| `bun run format`    | Format with Prettier       |

## Database

SQL migrations live in `drizzle/migrations`. Set `DATABASE_URL` and run them against your Supabase Postgres database.
