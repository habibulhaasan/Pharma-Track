# PharmaTrack — Deployment Guide

## Prerequisites
- Node.js 18+
- Firebase project (Blaze plan required for Admin SDK)
- Vercel account

---

## 1. Firebase Setup

### 1.1 Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Firestore Database** → Start in **production mode**

### 1.2 Get Client SDK Config
Firebase Console → Project Settings → Your Apps → Web App → Add app
Copy the config object values into your `.env.local`.

### 1.3 Generate Admin SDK Service Account
Firebase Console → Project Settings → Service Accounts → **Generate new private key**

Encode the private key for environment variables:
```bash
# Option A: base64 encode the entire key
cat serviceAccountKey.json | jq -r .private_key | base64 | tr -d '\n'
# Paste the output as FIREBASE_ADMIN_PRIVATE_KEY_BASE64

# Option B: Use the raw key with escaped newlines
# Set FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

### 1.4 Deploy Firestore Rules & Indexes
```bash
npm install -g firebase-tools
firebase login
firebase use --add   # select your project
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 2. Local Development

```bash
# 1. Clone the repo and install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env.local
# Edit .env.local with your Firebase config

# 3. Seed the database (creates admin user + sample products)
npx ts-node --project tsconfig.seed.json scripts/seed.ts

# 4. Run the dev server
npm run dev
```

**Default admin credentials after seeding:**
- Email: `admin@pharmatrack.com`
- Password: `Admin@123456`
- ⚠️ Change this immediately after first login!

---

## 3. Vercel Deployment

### 3.1 Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_ORG/pharmatrack.git
git push -u origin main
```

### 3.2 Import to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Framework preset: **Next.js** (auto-detected)

### 3.3 Environment Variables on Vercel
Add all variables from `.env.example` in Vercel's **Settings → Environment Variables**:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY_BASE64
NEXT_PUBLIC_APP_NAME
```

### 3.4 Update Firebase Auth Authorized Domains
Firebase Console → Authentication → Settings → Authorized domains
Add your Vercel deployment URL (e.g., `pharmatrack.vercel.app`).

### 3.5 Update next.config.mjs CORS
```js
experimental: {
  serverActions: {
    allowedOrigins: ["localhost:3000", "pharmatrack.vercel.app"],
  },
},
```

---

## 4. First-Time Setup Checklist

- [ ] Firebase project created
- [ ] Email/Password auth enabled
- [ ] Firestore rules deployed
- [ ] Firestore indexes deployed
- [ ] `.env.local` populated
- [ ] Database seeded (admin user exists)
- [ ] Admin can log in at `/login`
- [ ] Admin password changed
- [ ] Test: register a new user → admin approves → user logs in
- [ ] Test: add stock → transfer → dispense

---

## 5. Architecture Overview

```
Browser (Next.js App Router)
  │
  ├── Client Components (React)
  │     └── Read-only Firestore via SDK (real-time)
  │
  └── Server Actions ("use server")
        └── Firebase Admin SDK (full access)
              └── Firestore Transactions (atomic, no race conditions)
```

### Security Layers
1. **Firestore Security Rules** — client SDK reads are gated by auth status
2. **All writes blocked at Firestore level** — no direct client writes
3. **Server Actions** — verify session cookie → check role → run transaction
4. **Zod validation** — every input validated on server before DB touch
5. **Negative stock guard** — checked inside transaction before commit

---

## 6. Folder Structure

```
pharmacy-app/
├── app/
│   ├── (app)/                    ← Authenticated route group
│   │   ├── layout.tsx            ← Auth gate + AppShell
│   │   ├── dashboard/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx
│   │   │   └── users/page.tsx
│   │   ├── products/
│   │   │   ├── page.tsx          ← Server component (data fetch)
│   │   │   └── products-client.tsx ← Client component (UI)
│   │   ├── stock/
│   │   │   ├── main/
│   │   │   ├── transfer/
│   │   │   └── pharmacy/
│   │   └── reports/
│   ├── actions/                  ← Server Actions (all protected)
│   │   ├── auth.ts
│   │   ├── stock.ts
│   │   ├── transfer.ts
│   │   ├── dispense.ts
│   │   ├── products.ts
│   │   └── users.ts
│   ├── api/auth/session/route.ts
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── page.tsx                  ← Root redirect
│
├── components/
│   ├── layout/                   ← AppShell, Sidebar, Topbar
│   ├── ui/                       ← Button, Input, Card, Badge, etc.
│   ├── cards/                    ← StatCard, StockBadge, AdminUserCard
│   ├── tables/                   ← DataTable
│   ├── forms/                    ← ProductFormDialog
│   └── modals/                   ← ConfirmDialog
│
├── services/                     ← Server-only business logic
│   ├── userService.ts
│   ├── productService.ts
│   ├── stockService.ts           ← All transactions here
│   ├── ledgerService.ts
│   └── reportService.ts
│
├── schemas/                      ← Zod schemas (shared types)
│   ├── user.ts
│   ├── product.ts
│   ├── stock.ts
│   ├── transfer.ts
│   ├── dispense.ts
│   └── ledger.ts
│
├── lib/
│   ├── firebase.ts               ← Client SDK
│   ├── firebaseAdmin.ts          ← Admin SDK (server-only)
│   └── auth.ts                   ← Session management (server-only)
│
├── hooks/
│   ├── use-auth.ts
│   ├── use-firestore-query.ts
│   └── use-stock.ts
│
├── utils/
│   ├── errorHandler.ts
│   ├── stockUtils.ts
│   ├── date.ts
│   └── currency.ts
│
├── types/index.ts
├── middleware.ts
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── scripts/seed.ts
```

---

## 7. Key Design Decisions

| Decision | Rationale |
|---|---|
| All writes via Admin SDK server actions | Firestore rules block all client writes — prevents bypass |
| Firestore transactions for stock ops | Atomic read-modify-write, no race conditions, negative stock impossible |
| Session cookies (not JWT in localStorage) | HttpOnly, secure, not accessible to JS — XSS protection |
| Zod on server before every DB op | Validates shape, types, ranges — rejects malformed payloads early |
| `"server-only"` import guard | Prevents accidental Admin SDK import in client bundles |
| Soft delete for products | Preserves all historical ledger integrity |
| Activity log non-blocking | Logging failure never breaks a stock operation |

---

## 8. Extending the App

### Add Batch-Level Stock Tracking
The schema already includes `batch` and `expiry` on every ledger entry.
To enable per-batch stock, add a `batches` subcollection under `mainStock/{productId}`.

### Add Notifications
Use Firebase Cloud Messaging or a cron job (Vercel Cron) to alert on:
- Stock below reorder level
- Items expiring within 30 days

### Add Multi-Branch Support
Add a `branchId` field to users and stock documents.
Filter all queries by `branchId` and enforce in Firestore rules.

### Enable PDF Reports
Use `@react-pdf/renderer` in a server route to generate PDF exports.
