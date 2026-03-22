# PharmaTrack — Pharmacy Inventory Management System

A production-ready, role-based pharmacy inventory management system built with **Next.js 15 App Router**, **React 19**, **Firebase 11 Auth**, **Firestore**, and **TailwindCSS + Radix UI**.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.3 (App Router, Turbopack) |
| UI | React 19, TailwindCSS 3, Radix UI primitives |
| Auth | Firebase Auth 11 (client-side) + httpOnly session cookies |
| Database | Firestore (Firebase 11 client + Admin SDK 13) |
| Validation | Zod 3 on every server action |
| Forms | react-hook-form 7 + @hookform/resolvers 5 |
| Notifications | Sonner 2 |
| Date utils | date-fns 4 |

## Features

| Feature | Details |
|---|---|
| **Authentication** | Two-step: Firebase Auth client SDK → server action mints httpOnly session cookie |
| **Role-based access** | Admin / User — enforced in middleware (cookie check) + server actions (full verify) |
| **Stock IN** | Purchase receipts with batch, expiry, price, supplier, invoice reference |
| **Transfer** | Main Stock → Pharmacy Stock with Firestore transaction (atomic, no negatives) |
| **Dispense** | Pharmacy dispensing with patient name, prescription number |
| **Admin** | Approve/disable users, manage products, stock corrections with audit trail |
| **Ledger** | Full IN/OUT/ADJUSTMENT history per product |
| **Reports** | Stock value, expiry alerts (90 days), CSV export |
| **Dark mode** | System preference + manual toggle |
| **Mobile-first** | Responsive sidebar drawer on mobile |

## Architecture

```
Browser
 ├── Firebase Client SDK (auth sign-in, real-time stock listeners)
 └── Next.js Client Components (UI state, form inputs)

Next.js Server (Node.js runtime — NOT Edge)
 ├── Server Actions ("use server") — all stock mutations
 │    └── Zod validation → firebase-admin transactions → activity log
 ├── Server Components — data fetch for initial page render
 └── API Route /api/auth/session — session cookie management

Firestore Security Rules
 └── ALL writes blocked at DB level (client SDK write = rejected)
      Only firebase-admin (via server actions) can write
```

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all Firebase values (see DEPLOYMENT.md for instructions)

# 3. Deploy Firestore rules and indexes
npm install -g firebase-tools
firebase login && firebase use --add
firebase deploy --only firestore

# 4. Seed the database (creates admin user + 10 sample products)
npm run seed

# 5. Start development server (Turbopack)
npm run dev
```

**Default admin after seeding:**
- Email: `admin@pharmatrack.com`
- Password: `Admin@123456`
- ⚠️ Change this immediately in Firebase Console after first login

## Key Design Rules

1. **Middleware is Edge-safe** — only reads a cookie. Never touches `firebase-admin`.
2. **`firebase-admin` lives in server zone only** — services/, lib/auth.ts, lib/firebaseAdmin.ts, app/actions/, app/api/
3. **All stock mutations use Firestore transactions** — atomic, prevents race conditions, enforces no-negative-stock
4. **`cookies()` is always awaited** — Next.js 15 made the API async
5. **Every server page declares `export const runtime = "nodejs"`** — opts out of Edge runtime
6. **Zod validates every server action input** — rejects before touching Firestore

## Project Structure

```
├── app/
│   ├── (app)/              ← Authenticated route group (Node.js runtime)
│   │   ├── layout.tsx      ← Auth gate → AppShell
│   │   ├── dashboard/
│   │   ├── admin/          ← Admin panel + user management + stock adjustment
│   │   ├── products/       ← Product catalog (admin: CRUD, user: read)
│   │   ├── stock/main/     ← Purchase IN
│   │   ├── stock/transfer/ ← Main → Pharmacy transfer
│   │   ├── stock/pharmacy/ ← Dispense
│   │   ├── ledger/         ← Full ledger history
│   │   └── reports/        ← Stock value, expiry (admin only)
│   ├── actions/            ← Server Actions (all protected, Zod-validated)
│   ├── api/auth/session/   ← Session cookie endpoint
│   ├── login/ register/    ← Public auth pages
│   └── layout.tsx          ← Root layout (Geist fonts, ThemeProvider, Toaster)
│
├── components/
│   ├── layout/             ← AppShell, Sidebar, Topbar
│   ├── ui/                 ← Button, Input, Card, Badge, Dialog, Select...
│   ├── cards/              ← StatCard, StockBadge, AdminUserCard
│   ├── forms/              ← ProductFormDialog
│   ├── tables/             ← DataTable (search, pagination)
│   └── modals/             ← ConfirmDialog
│
├── services/               ← Server-only business logic
│   ├── stockService.ts     ← ALL transactions (IN, OUT, TRANSFER, DISPENSE, ADJUST)
│   ├── productService.ts
│   ├── userService.ts
│   ├── ledgerService.ts
│   └── reportService.ts
│
├── schemas/                ← Zod schemas (user, product, stock, transfer, dispense)
├── lib/
│   ├── constants.ts        ← Edge-safe constants (no imports)
│   ├── firebase.ts         ← Client SDK
│   ├── firebaseAdmin.ts    ← Admin SDK (server-only)
│   └── auth.ts             ← Session management (server-only)
│
├── hooks/                  ← useAuth, useFirestoreQuery, useStockLevel
├── types/index.ts          ← Shared TypeScript types
├── utils/                  ← date, currency, stockUtils, errorHandler
├── middleware.ts            ← Edge-safe: cookie existence check only
├── firestore.rules         ← Complete security rules
├── firestore.indexes.json
└── scripts/seed.ts         ← Database seeder
```

## Environment Variables

See `.env.example` for the full list. Required variables:

```bash
# Firebase Client (public, safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Firebase Admin (server-only, NEVER expose)
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY_BASE64   # base64-encoded private key (Vercel-friendly)
```

See `DEPLOYMENT.md` for full setup instructions including Vercel deployment.
