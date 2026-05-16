# Community Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public report and admin-confirmed badge layer for unofficial pharmacy observations, starting with suspected/confirmed herbal pharmacist employment outside HIRA staff data.

**Architecture:** Keep official HIRA/MOIS fields unchanged. Store user reports in a private report table, store public admin-confirmed badges in a separate assertion table, and render approved badges on pharmacy details. Server routes use the Supabase service key; public clients never write directly to Supabase.

**Tech Stack:** Next.js App Router, Supabase Postgres/RLS, TypeScript React components, existing `pharmacies` detail pages.

---

### Task 1: Schema And RLS

**Files:**
- Create: `scripts/migrations/2026-05-16_community_badges.sql`
- Modify: `scripts/schema.sql`

- [ ] Create `pharmacy_badge_reports` for public submissions.
- [ ] Create `pharmacy_badge_assertions` for admin-approved public badges.
- [ ] Restrict report reads to service-role only.
- [ ] Allow public read only for published assertions.
- [ ] Add indexes for pharmacy id, badge type, status, and created date.

### Task 2: API Routes

**Files:**
- Create: `frontend/src/lib/badges.ts`
- Create: `frontend/src/app/api/pharmacy/[id]/badge-reports/route.ts`
- Create: `frontend/src/app/api/admin/badge-reports/route.ts`
- Create: `frontend/src/app/api/admin/badge-reports/[id]/route.ts`
- Create: `frontend/src/app/api/admin/badge-assertions/route.ts`

- [ ] Add shared badge type labels and validation helpers.
- [ ] Add public POST route for reports with strict validation and optional reporter contact.
- [ ] Add admin list route guarded by `ADMIN_BADGE_TOKEN`.
- [ ] Add admin review route to approve/reject reports.
- [ ] Add admin assertion route to create/update public badges.

### Task 3: Public Pharmacy UI

**Files:**
- Create: `frontend/src/components/pharmacy/CommunityBadgePanel.tsx`
- Create: `frontend/src/components/pharmacy/CommunityReportForm.tsx`
- Modify: `frontend/src/app/pharmacy/[id]/page.tsx`
- Modify: `frontend/src/components/pharmacy/PharmacyDetail.tsx`
- Modify: `frontend/src/lib/types.ts`

- [ ] Fetch published badge assertions with pharmacy detail.
- [ ] Show official HIRA staff data separately from community/admin badges.
- [ ] Add report form under pharmacy detail.
- [ ] Use cautious wording: “제보”, “관리자 검토”, “공식자료와 다를 수 있음”.

### Task 4: Admin UI

**Files:**
- Create: `frontend/src/app/admin/badges/page.tsx`
- Create: `frontend/src/components/admin/AdminBadgeReview.tsx`

- [ ] Add token input stored in session state.
- [ ] List pending/reviewing reports.
- [ ] Show pharmacy official staff data beside each report.
- [ ] Allow approve/reject/needs_more_evidence.
- [ ] On approval, create/update a published assertion.

### Task 5: Verification

**Commands:**
- `python -m pytest scripts/tests/test_matcher.py scripts/tests/test_normalizer.py -q`
- `npm run build` in `frontend`
- Apply migration to Supabase.
- Submit a sample report through the API.
- Approve it through admin API or UI.
- Verify the approved badge appears on a pharmacy detail page and unapproved reports do not.

