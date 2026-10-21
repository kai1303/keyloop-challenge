# Intelligent Inventory Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, filterable vehicle inventory with prominent aging stock and live action updates to the existing Admin Dashboard.

**Architecture:** Extend `/admin/bookings` with `/admin/inventory`, extracting only the admin layout, labelled Select, and dealership-date helper that both pages need. NestJS owns validated inventory reads and versioned action writes to local Supabase PostgreSQL; React subscribes to Supabase Postgres Changes over WebSockets and refetches authoritative snapshots. Preserve the root component showcase and all existing booking behavior.

**Tech Stack:** Existing React/TypeScript/Vite, NestJS, shared Keyloop/shadcn components, Motion providers, Vitest/React Testing Library/jsdom; add `@supabase/supabase-js@2.118.0` to API and web. Use the installed Supabase CLI (inspected version 2.117.0) and Docker for the local stack.

---

## Scope, baseline, and execution rules

Workspace: `/Users/kai/works/side-project/keyloop-interview`.

Approved design: `docs/superpowers/specs/2026-10-21-intelligent-inventory-dashboard-design.md`, revised in `59f5484`. The user's subsequent writing-plans invocation authorizes this planning step. No application changes or infrastructure startup occur while writing this plan.

CodeGraph currently indexes only YAML and no source symbols. Recheck it at execution time; use source files if the index still lacks the application. The observed API is a Nest starter. Appointment database/Realtime plans are not implemented prerequisites.

The dashboard was refreshed during planning. The final inspected version uses the shared `SidebarProvider`/`Sidebar` family, Card metrics, Radix Tabs for Day/List, and booking-details Popovers. Preserve that revision, including its Motion transitions and selection behavior; the extraction below targets its current Sidebar root, not the earlier plain `<aside>` shell. Inventory reuses those Sidebar/Card/Popover primitives.

The checkout contains pre-existing untracked application files and unrelated appointment documents. Do not create a worktree from HEAD and assume it contains these files. Prefer a suitable managed worktree only if it contains the actual working baseline; otherwise execute in the current checkout with file backups. Never clean, reset, broadly stage, or overwrite the existing work. Record `git status --short` before execution. The scoped commit commands below apply to newly created inventory files and existing tracked files; exclude pre-existing untracked files from staging until their owner has established their baseline. Continue implementing and verifying those files in the working tree, and report that commit boundary honestly. Do not change global Git identity.

This is one local, fictional-data feature: no login flow, external feed, action history, vehicle CRUD UI, router library, new design system, or booking persistence migration. Existing ordinary-link navigation reloads the app; booking edits therefore retain their existing reset-on-reload behavior.

## File map

All paths below are relative to the workspace root.

| Files | Responsibility |
| --- | --- |
| `apps/web/src/admin/AdminLayout.tsx`, `admin-layout.css`, `AdminLayout.test.tsx` | Existing shell shared by two admin sections; correct active navigation and section-specific demo copy |
| `apps/web/src/admin/AdminSelect.tsx` | Rename the already generic `BookingSelect`, preserving its contract |
| `apps/web/src/admin/dealer-date.ts` | Existing dealership timezone/date semantics, independent of booking rules |
| Existing `BookingDashboard.tsx`, `BookingEditor.tsx`, `booking-model.ts`, `booking-dashboard.css` and tests | Minimal integration of extracted pieces; booking domain logic remains intact |
| `supabase/config.toml`, `supabase/migrations/20261021000100_inventory.sql`, `supabase/seed.sql`, `supabase/tests/inventory.sql` | Isolated local database, constraints, atomic action RPC, read-only anonymous access, sample stock, SQL checks |
| `apps/api/src/inventory/inventory-model.ts`, `inventory.service.ts`, `inventory.controller.ts`, `inventory.module.ts` | Date/DTO rules, Supabase access, safe HTTP errors, dependency wiring |
| `apps/api/src/inventory/inventory-model.spec.ts`, `inventory.service.spec.ts`, `apps/api/test/inventory.e2e-spec.ts` | Validation, persistence error mapping, HTTP contract |
| `apps/web/src/admin/inventory/inventory-model.ts`, `inventory-model.test.ts` | Browser contract, age buckets/filtering, formatting |
| `apps/web/src/admin/inventory/inventory-api.ts`, `inventory-api.test.ts` | Browser-safe Supabase initialization, HTTP reads and writes |
| `apps/web/src/admin/inventory/watch-inventory.ts`, `watch-inventory.test.ts`, `useInventory.ts` | Subscription, serialized refetches, stale/reconnect/visibility/midnight recovery, React state |
| `apps/web/src/admin/inventory/InventoryDashboard.tsx`, `InventoryTable.tsx`, `InventoryDetails.tsx`, `InventoryActionDialog.tsx`, `inventory.css`, `InventoryDashboard.test.tsx` | Inventory screen and selected vehicle/action workflow |
| `apps/web/src/admin/inventory/inventory.live.test.ts` | Opt-in real local Supabase persistence, RLS, and WebSocket proof |
| `apps/web/src/main.tsx`, `apps/web/vite.config.ts` | Exact new path and local `/api` proxy; existing paths/providers preserved |
| API/web manifests, `pnpm-lock.yaml`, API/web `.env.example`, root/web/API READMEs, `.gitignore` | Dependency/configuration/setup and evidence boundaries |

## Fixed contract

The dealership timezone is `Asia/Ho_Chi_Minh`. Use dealer calendar dates, not elapsed 24-hour intervals or vehicle model year. A vehicle is aging only at **91+ days**. `pricePence` is a non-negative integer; GBP is display formatting only.

The API snapshot is `{ vehicles, dealershipDate, timeZone, serverTime }`. A vehicle is `{ id, registration, make, model, modelYear, pricePence, stockedOn, currentAction, note, actionUpdatedAt, version, daysInStock, aging }`. Action saves are `{ action, note, expectedVersion }`. The four accepted action values are their displayed labels: `Price Reduction Planned`, `Marketing Push Planned`, `Wholesale Review Planned`, `Monitor Stock`.

HTTP paths: browser `/api/inventory` → Nest `GET /inventory`; browser `/api/inventory/:id/action` → Nest `PATCH /inventory/:id/action`. Saves return a vehicle. Invalid input/non-aging stock returns 400; absent vehicle 404; stale version 409; unavailable/missing database configuration 503. Do not surface raw Supabase errors.

## Task 1: Reuse the existing admin shell without changing booking behavior

**Files:** Create `apps/web/src/admin/AdminLayout.tsx`, `AdminLayout.test.tsx`, `admin-layout.css`, `dealer-date.ts`; rename `BookingSelect.tsx` to `AdminSelect.tsx`; modify the existing booking page/editor/model/CSS. Reuse existing shared Sidebar/Card/Popover/Tabs components without editing their implementations.

- [ ] **Step 1: Record the working baseline and run existing booking tests.**

```sh
git status --short
pnpm install --frozen-lockfile
pnpm --filter @keyloop-interview/web test src/admin/BookingDashboard.test.tsx src/admin/booking-model.test.ts
pnpm --filter @keyloop-interview/web typecheck
```

Expected: the current booking suite passes. If it fails, record the failure before editing; do not report it as an inventory regression without checking the baseline.

- [ ] **Step 2: Add the failing shared-shell test.**

`apps/web/src/admin/AdminLayout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { AdminLayout } from "./AdminLayout"

beforeEach(() => {
  vi.stubGlobal('matchMedia',vi.fn().mockImplementation(() => ({ matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:vi.fn() })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it("marks only Inventory active and renders its persistence notice", () => {
  render(<AdminLayout activePage="inventory"><h1>Inventory test</h1></AdminLayout>)
  expect(screen.getByRole("link", { name: "Inventory" }).getAttribute("aria-current")).toBe("page")
  expect(screen.getByRole("link", { name: "Bookings" }).hasAttribute("aria-current")).toBe(false)
  expect(screen.getByText("Fictional inventory. Actions persist in local Supabase.")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Resources" })).toBeNull()
  expect(screen.getByRole("main").contains(screen.getByRole("heading"))).toBe(true)
})
it("retains booking-specific actions and its session-only notice", () => {
  render(<AdminLayout activePage="bookings" sidebarActions={<li><button>Resources</button></li>}><h1>Bookings test</h1></AdminLayout>)
  expect(screen.getByRole("link", { name: "Bookings" }).getAttribute("aria-current")).toBe("page")
  expect(screen.getByRole("button", { name: "Resources" })).toBeTruthy()
  expect(screen.getByText("Fictional bookings. Changes reset on refresh.")).toBeTruthy()
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/AdminLayout.test.tsx`; expected FAIL because the component does not exist.

- [ ] **Step 3: Add the shared layout.**

`apps/web/src/admin/AdminLayout.tsx`:

```tsx
import type { ReactNode } from "react"
import { Badge } from "@keyloop-interview/ui/components/badge"
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@keyloop-interview/ui/components/sidebar"
import "./admin-layout.css"

export function AdminLayout({ activePage, sidebarActions, children }: {
  activePage: "bookings" | "inventory"
  sidebarActions?: ReactNode
  children: ReactNode
}) {
  const inventory = activePage === "inventory"
  return <SidebarProvider className="admin-app">
    <Sidebar collapsible="none" className="admin-sidebar" role="complementary" aria-label="Dealership administration">
      <SidebarHeader className="p-0">
        <a className="admin-brand" href="/admin/bookings">keyloop<span aria-hidden="true">.</span></a>
        <p className="admin-product">{inventory ? "INVENTORY MANAGEMENT" : "SERVICE OPERATIONS"}</p>
        <div className="admin-domain" data-domain={inventory ? "supply" : "operate"}>
          <span>{inventory ? "SUPPLY" : "OPERATE"}</span><span className="admin-domain-line" />
        </div>
      </SidebarHeader>
      <SidebarContent className="admin-sidebar-content">
        <nav aria-label="Admin navigation"><SidebarMenu className="admin-nav">
          <SidebarMenuItem><SidebarMenuButton asChild isActive={activePage === "bookings"}>
            <a href="/admin/bookings" aria-current={activePage === "bookings" ? "page" : undefined}>Bookings</a>
          </SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton asChild isActive={inventory}>
            <a href="/admin/inventory" aria-current={inventory ? "page" : undefined}>Inventory</a>
          </SidebarMenuButton></SidebarMenuItem>
          {sidebarActions}
        </SidebarMenu></nav>
      </SidebarContent>
      <SidebarFooter className="admin-sidebar-footer px-0 pb-0">
        <Badge variant="outline">Demo workspace</Badge>
        <p>{inventory ? "Fictional inventory. Actions persist in local Supabase." : "Fictional bookings. Changes reset on refresh."}</p>
        <a href="/">Component library ↗</a>
      </SidebarFooter>
    </Sidebar>
    <main className="admin-main">{children}</main>
  </SidebarProvider>
}
```

- [ ] **Step 4: Extract the existing common CSS and helpers using guarded edits.**

Run this from the root after checking the named source markers still exist. It splits existing CSS blocks without restyling the booking timeline, updates all current Select consumers, and keeps the booking model's public date exports intact.

```python
from pathlib import Path
import re

admin = Path('apps/web/src/admin')
css_file = admin / 'booking-dashboard.css'
shared_file = admin / 'admin-layout.css'
assert not shared_file.exists(), 'Do not overwrite an existing shared stylesheet'
shared_names = {
 'admin-app','admin-sidebar','admin-sidebar-content','admin-brand','admin-product','admin-domain',
 'admin-domain-line','admin-nav','admin-sidebar-footer','admin-main',
 'admin-header','admin-eyebrow','admin-metrics','admin-filters',
 'admin-workspace','admin-workspace-details','admin-details',
 'admin-detail-section','admin-empty','admin-empty-mark','admin-page-footer'
}
def partition(text):
    common, booking = [], []
    pos = 0
    while pos < len(text):
        opening = text.find('{', pos)
        if opening < 0:
            assert not text[pos:].strip()
            break
        header = text[pos:opening].strip()
        depth, end = 1, opening + 1
        while depth:
            assert end < len(text)
            depth += (text[end] == '{') - (text[end] == '}')
            end += 1
        body = text[opening + 1:end - 1]
        if header.startswith('@media'):
            left, right = partition(body)
            if left.strip(): common.append(header + ' {\n' + left + '}\n')
            if right.strip(): booking.append(header + ' {\n' + right + '}\n')
        else:
            classes = set(re.findall(r'\.([a-zA-Z][a-zA-Z0-9_-]*)', header))
            target = common if classes & shared_names else booking
            target.append(header + ' {' + body + '}\n')
        pos = end
    return '\n'.join(common), '\n'.join(booking)
common, booking = partition(css_file.read_text())
shared_file.write_text(common + '''
.admin-nav a { background: transparent; border-left-color: transparent; }
.admin-nav a[aria-current="page"], .admin-nav a:hover {
  background: color-mix(in srgb, var(--kl-color-white) 12%, transparent);
}
.admin-nav a[aria-current="page"] { border-left-color: var(--kl-color-cta); }
.admin-domain[data-domain="supply"] .admin-domain-line { background: var(--primary); }
.admin-nav { flex-wrap: wrap; min-width: 0; }
''')
css_file.write_text(booking)

old_select = admin / 'BookingSelect.tsx'
new_select = admin / 'AdminSelect.tsx'
assert old_select.exists() and not new_select.exists()
old_select.rename(new_select)
for name in ['AdminSelect.tsx', 'BookingDashboard.tsx', 'BookingEditor.tsx']:
    path = admin / name
    path.write_text(path.read_text().replace('BookingSelect', 'AdminSelect'))

model = admin / 'booking-model.ts'
source = model.read_text()
timezone = 'export const DEALER_TIMEZONE = "Asia/Ho_Chi_Minh"\n'
start = source.index('export function dealerDate(')
end = source.index('export function shiftDate(', start)
date_function = source[start:end]
assert source.count(timezone) == 1 and not (admin / 'dealer-date.ts').exists()
(admin / 'dealer-date.ts').write_text(timezone + '\n' + date_function)
source = source[:start] + source[end:]
source = source.replace(timezone, '')
model.write_text('import { DEALER_TIMEZONE, dealerDate } from "./dealer-date"\n'
                'export { DEALER_TIMEZONE, dealerDate } from "./dealer-date"\n' + source)
```

- [ ] **Step 5: Replace only the booking shell, retaining page content and modal handlers.**

```python
from pathlib import Path
path = Path('apps/web/src/admin/BookingDashboard.tsx')
source = path.read_text()
assert 'import { AdminLayout }' not in source
source = 'import { AdminLayout } from "./AdminLayout"\n' + source
old_import_start = source.index('import {\n  Sidebar,')
old_import_end = source.index('\n',source.index('from "@keyloop-interview/ui/components/sidebar"',old_import_start))+1
source = source[:old_import_start] + 'import { SidebarMenuButton, SidebarMenuItem } from "@keyloop-interview/ui/components/sidebar"\n' + source[old_import_end:]
start = source.index('    <SidebarProvider className="admin-app">')
main_marker = '      <main className="admin-main">\n'
content = source.index(main_marker,start) + len(main_marker)
source = source[:start] + '''    <>
      <AdminLayout activePage="bookings" sidebarActions={<>
        <SidebarMenuItem><SidebarMenuButton onClick={() => openModal("resources")}>Resources</SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton onClick={() => openModal("hours")}>Opening hours</SidebarMenuButton></SidebarMenuItem>
      </>}>
''' + source[content:]
assert source.count('      </main>') == 1
source = source.replace('      </main>', '      </AdminLayout>')
closing = source.rfind('    </SidebarProvider>')
assert closing >= 0 and source[closing:].strip() == '</SidebarProvider>\n  )\n}'
source = source[:closing] + source[closing:].replace('    </SidebarProvider>', '    </>', 1)
path.write_text(source)
```

If a guard fails because another change landed, inspect that file and apply the same narrow JSX move manually; keep new content and handlers. Do not replace the entire booking page with an older copy.

- [ ] **Step 6: Run regressions and make a scoped commit.**

```sh
pnpm --filter @keyloop-interview/web test src/admin/AdminLayout.test.tsx src/admin/BookingDashboard.test.tsx src/admin/booking-model.test.ts
pnpm --filter @keyloop-interview/web typecheck
git diff --check
git add -- apps/web/src/admin/AdminLayout.tsx apps/web/src/admin/AdminLayout.test.tsx apps/web/src/admin/admin-layout.css apps/web/src/admin/AdminSelect.tsx apps/web/src/admin/dealer-date.ts
git commit -m "refactor(web): share existing admin layout and controls"
```

Expected: PASS, with booking creation, filters, conflict checks, lifecycle actions, and focus restoration unchanged. Review tracked booking edits separately for staging, observing the baseline rule above.

## Task 2: Local Supabase schema, constraints, and atomic action persistence

**Files:** Create `supabase/config.toml`, `supabase/migrations/20261021000100_inventory.sql`, `supabase/seed.sql`, `supabase/tests/inventory.sql`.

- [ ] **Step 1: Configure an isolated local stack and write the SQL behavior check.**

Do not overwrite an existing `supabase/config.toml`; if another feature has introduced it, inspect its project identity/ports and merge this inventory migration without resetting its data. The fresh-stack configuration is:

```toml
project_id = "keyloop-inventory-local"
[api]
enabled = true
port = 55321
schemas = ["public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55322
shadow_port = 55320
major_version = 17
[db.seed]
enabled = false
[db.pooler]
enabled = false
[realtime]
enabled = true
[studio]
enabled = true
port = 55323
api_url = "http://127.0.0.1"
[inbucket]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:5176"
[storage]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
```

Seeding is explicit and idempotent below, not a startup action. `supabase/tests/inventory.sql`:

```sql
BEGIN;
DO $test$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  target uuid := 'ffffffff-ffff-4fff-8fff-000000000001';
  young uuid := 'ffffffff-ffff-4fff-8fff-000000000002';
  saved public.vehicles;
BEGIN
  INSERT INTO public.vehicles(id,registration,make,model,model_year,price_pence,stocked_on)
  VALUES (target,'TEST-INVENTORY-91','Toyota','Corolla',2022,1800000,today-91),
         (young,'TEST-INVENTORY-90','Toyota','Yaris',2023,1600000,today-90);
  SELECT * INTO saved FROM public.save_inventory_action(target,'Price Reduction Planned','  Review Friday  ',0);
  ASSERT saved.current_action = 'Price Reduction Planned';
  ASSERT saved.note = 'Review Friday';
  ASSERT saved.version = 1 AND saved.action_updated_at IS NOT NULL;
  BEGIN
    PERFORM public.save_inventory_action(target,'Monitor Stock',NULL,0);
    RAISE EXCEPTION 'stale version was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action(young,'Monitor Stock',NULL,0);
    RAISE EXCEPTION '90-day vehicle was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action(target,'Unsupported action',NULL,1);
    RAISE EXCEPTION 'unknown action was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action(target,'Monitor Stock',repeat('x',1001),1);
    RAISE EXCEPTION 'oversized note was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action('ffffffff-ffff-4fff-8fff-000000000099','Monitor Stock',NULL,0);
    RAISE EXCEPTION 'missing vehicle was accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.vehicles'::regclass);
  ASSERT has_table_privilege('anon','public.vehicles','SELECT');
  ASSERT NOT has_table_privilege('anon','public.vehicles','UPDATE');
  ASSERT NOT has_table_privilege('anon','public.vehicles','INSERT');
  ASSERT NOT has_table_privilege('anon','public.vehicles','DELETE');
  ASSERT NOT has_function_privilege('anon','public.save_inventory_action(uuid,text,text,integer)','EXECUTE');
  ASSERT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='vehicles');
END;
$test$;
ROLLBACK;
```

- [ ] **Step 2: Start only this local stack and observe the SQL test fail before the migration.**

First check the designated ports and Docker network. If they belong to a different service, choose unused ports and update all subsequent local URLs consistently; never stop the other service.

```python
import socket, subprocess
for port in [55320, 55321, 55322, 55323]:
    with socket.socket() as probe:
        assert probe.connect_ex(('127.0.0.1',port)) != 0, f'Port {port} is already used; inspect its owner'
network = 'keyloop-inventory-local'
if subprocess.run(['docker','network','inspect',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
    subprocess.run(['docker','network','create','-o','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network],check=True)
```

```sh
supabase start --network-id keyloop-inventory-local
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/inventory.sql
```

Expected initial SQL failure: relation/type `public.vehicles` does not exist. If the dedicated stack already exists, inspect its state and skip the occupied-port assertion/start rather than reset it. Verify `docker port supabase_db_keyloop-inventory-local` binds only loopback before continuing.

- [ ] **Step 3: Add the schema migration and fictional seed.**

`supabase/migrations/20261021000100_inventory.sql`:

```sql
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration text NOT NULL UNIQUE CHECK (length(btrim(registration)) BETWEEN 1 AND 32),
  make text NOT NULL CHECK (length(btrim(make)) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 80),
  model_year integer NOT NULL CHECK (model_year BETWEEN 1886 AND 2100),
  price_pence integer NOT NULL CHECK (price_pence >= 0),
  stocked_on date NOT NULL CHECK (stocked_on <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  current_action text CHECK (current_action IN ('Price Reduction Planned','Marketing Push Planned','Wholesale Review Planned','Monitor Stock')),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  action_updated_at timestamptz,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  CHECK ((current_action IS NULL AND note IS NULL AND action_updated_at IS NULL)
      OR (current_action IS NOT NULL AND action_updated_at IS NOT NULL))
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicles FROM anon, authenticated;
GRANT SELECT ON public.vehicles TO anon;
GRANT ALL ON public.vehicles TO service_role;
CREATE POLICY inventory_demo_read ON public.vehicles FOR SELECT TO anon USING (true);

CREATE FUNCTION public.save_inventory_action(
  p_id uuid, p_action text, p_note text, p_expected_version integer
) RETURNS SETOF public.vehicles
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  vehicle public.vehicles;
  today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('Price Reduction Planned','Marketing Push Planned','Wholesale Review Planned','Monitor Stock')
      OR p_expected_version IS NULL OR p_expected_version < 0
      OR char_length(btrim(coalesce(p_note,''))) > 1000 THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Invalid inventory action';
  END IF;
  SELECT * INTO vehicle FROM public.vehicles WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'P0002' USING MESSAGE='Vehicle not found'; END IF;
  IF today - vehicle.stocked_on <= 90 THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Actions are available only for aging stock';
  END IF;
  IF vehicle.version <> p_expected_version THEN
    RAISE SQLSTATE '40001' USING MESSAGE='Vehicle action changed; review the latest version';
  END IF;
  RETURN QUERY UPDATE public.vehicles SET current_action=p_action,
    note=nullif(btrim(coalesce(p_note,'')),''), action_updated_at=now(), version=version+1
    WHERE id=p_id RETURNING *;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_inventory_action(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_inventory_action(uuid,text,text,integer) TO service_role;

DO $publication$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='vehicles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
  END IF;
END;
$publication$;
```

`supabase/seed.sql`:

```sql
WITH samples AS (
  SELECT n, (n-1)%6 AS variant,
    (ARRAY[0,12,30,31,60,61,90,91,120,150,180,210])[1+(n-1)%12] AS days
  FROM generate_series(1,24) AS n
)
INSERT INTO public.vehicles(id,registration,make,model,model_year,price_pence,stocked_on,current_action,note,action_updated_at)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'KL-DEMO-'||lpad(n::text,3,'0'),
  CASE WHEN variant<2 THEN 'Toyota' WHEN variant<4 THEN 'BMW' ELSE 'Ford' END,
  (ARRAY['Corolla','Yaris','3 Series','X1','Focus','Kuga'])[variant+1],
  2020+n%5, 1500000+n*50000,
  (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-days,
  CASE WHEN days>90 AND n%4=0 THEN 'Price Reduction Planned' END,
  CASE WHEN days>90 AND n%4=0 THEN 'Review pricing at the next stock meeting.' END,
  CASE WHEN days>90 AND n%4=0 THEN now() END
FROM samples
ON CONFLICT (id) DO NOTHING;
```

The row lock makes age eligibility/version checking and saving one transaction. The seed never updates an existing vehicle or action. Do not add a destructive reset to normal setup.

- [ ] **Step 4: Apply and verify against PostgreSQL, then commit the new files.**

```sh
supabase migration up --local
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql
docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/inventory.sql
git add -- supabase/config.toml supabase/migrations/20261021000100_inventory.sql supabase/seed.sql supabase/tests/inventory.sql
git commit -m "feat(inventory): add Supabase stock and atomic action persistence"
```

Expected: pending migration applied, 24 sample rows on first seeding, SQL `DO` succeeds and transaction rolls back its fixtures. Repeating the seed inserts zero duplicates and preserves actions. Do not infer WebSocket delivery from these SQL checks.

## Task 3: NestJS inventory contract and validated HTTP endpoints

**Files:** Create the four inventory API files and two unit-test files listed below, plus `apps/api/test/inventory.e2e-spec.ts`. Modify `apps/api/package.json`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, and `pnpm-lock.yaml`.

- [ ] **Step 1: Add the required client dependency and failing date/input tests.**

```sh
pnpm --filter @keyloop-interview/api add @supabase/supabase-js@2.118.0
pnpm --filter @keyloop-interview/web add @supabase/supabase-js@2.118.0
```

`apps/api/src/inventory/inventory-model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dealerDate, daysInStock, validateAction } from './inventory-model.js';

it('uses dealership midnight even when UTC is still the previous date', () => {
  expect(dealerDate(new Date('2030-01-02T17:01:00Z'))).toBe('2030-01-03');
  expect(daysInStock('2029-10-04', '2030-01-02')).toBe(90);
  expect(daysInStock('2029-10-04', '2030-01-03')).toBe(91);
});
describe('action payload boundary', () => {
  it('normalizes an optional note', () => {
    expect(validateAction({ action: 'Monitor Stock', note: '  weekly review  ', expectedVersion: 0 }))
      .toEqual({ action: 'Monitor Stock', note: 'weekly review', expectedVersion: 0 });
  });
  it.each([
    null, [], {}, { action: 'other', expectedVersion: 0 },
    { action: 'Monitor Stock', expectedVersion: -1 },
    { action: 'Monitor Stock', expectedVersion: 0.5 },
    { action: 'Monitor Stock', expectedVersion: 2147483647 },
    { action: 'Monitor Stock', expectedVersion: 0, note: 7 },
    { action: 'Monitor Stock', expectedVersion: 0, note: 'x'.repeat(1001) },
    { action: 'Monitor Stock', expectedVersion: 0, pricePence: 0 },
  ])('rejects malformed input %#', value => expect(() => validateAction(value)).toThrow());
});
```

Run `pnpm --filter @keyloop-interview/api test src/inventory/inventory-model.spec.ts`; expected FAIL resolving the missing model.

- [ ] **Step 2: Implement the API model and payload validation.**

`apps/api/src/inventory/inventory-model.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const ACTIONS = ['Price Reduction Planned', 'Marketing Push Planned', 'Wholesale Review Planned', 'Monitor Stock'] as const;
export type Action = typeof ACTIONS[number];
export interface VehicleRow {
  id: string; registration: string; make: string; model: string;
  model_year: number; price_pence: number; stocked_on: string;
  current_action: Action | null; note: string | null;
  action_updated_at: string | null; version: number;
}
export function dealerDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year','month','day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function daysInStock(stockedOn: string, today: string): number {
  return (Date.parse(today + 'T00:00:00Z') - Date.parse(stockedOn + 'T00:00:00Z')) / 86400000;
}
export function vehicleView(row: VehicleRow, today: string) {
  const days = daysInStock(row.stocked_on, today);
  return {
    id: row.id, registration: row.registration, make: row.make, model: row.model,
    modelYear: row.model_year, pricePence: row.price_pence, stockedOn: row.stocked_on,
    currentAction: row.current_action, note: row.note, actionUpdatedAt: row.action_updated_at,
    version: row.version, daysInStock: days, aging: days > 90,
  };
}
export function validateId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new BadRequestException('Invalid vehicle ID');
  }
}
export function validateAction(value: unknown): { action: Action; note: string | null; expectedVersion: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid action payload');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['action','note','expectedVersion'].includes(key))
      || !ACTIONS.includes(body.action as Action)
      || typeof body.expectedVersion !== 'number' || !Number.isInteger(body.expectedVersion)
      || body.expectedVersion < 0 || body.expectedVersion > 2147483646
      || (body.note !== undefined && body.note !== null && typeof body.note !== 'string')) {
    throw new BadRequestException('Choose a valid action and version');
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) throw new BadRequestException('Notes must be 1,000 characters or fewer');
  return { action: body.action as Action, note: note || null, expectedVersion: body.expectedVersion };
}
```

- [ ] **Step 3: Add a failing persistence/error-mapping unit test.**

`apps/api/src/inventory/inventory.service.spec.ts`:

```ts
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { InventoryService } from './inventory.service.js';

const id = '00000000-0000-4000-8000-000000000008';
it('maps a stale database version to HTTP 409 without leaking the raw error', async () => {
  const single = vi.fn().mockResolvedValue({ data: null, error: { code: '40001', message: 'private SQL details' } });
  const rpc = vi.fn().mockReturnValue({ single });
  const service = new InventoryService({ rpc } as unknown as SupabaseClient);
  await expect(service.save(id, { action: 'Monitor Stock', expectedVersion: 0 })).rejects.toMatchObject({ status: 409 });
  expect(rpc).toHaveBeenCalledWith('save_inventory_action', {
    p_id: id, p_action: 'Monitor Stock', p_note: null, p_expected_version: 0,
  });
});
it.each([['P0002',404],['22023',400],['connection_failure',503]])('maps %s safely', async (code, status) => {
  const rpc = () => ({ single: async () => ({ data: null, error: { code, message: 'private SQL details' } }) });
  const service = new InventoryService({ rpc } as unknown as SupabaseClient);
  await expect(service.save(id, { action: 'Monitor Stock', expectedVersion: 0 })).rejects.toMatchObject({ status });
});
it('reports missing configuration as 503 instead of fictional inventory', async () => {
  await expect(new InventoryService(null).list()).rejects.toMatchObject({ status: 503 });
});
```

Run `pnpm --filter @keyloop-interview/api test src/inventory`; expected the model tests PASS and the missing service test FAIL.

- [ ] **Step 4: Implement service, controller, and module.**

`apps/api/src/inventory/inventory.service.ts`:

```ts
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dealerDate, TIME_ZONE, validateAction, validateId, vehicleView, type VehicleRow } from './inventory-model.js';

@Injectable()
export class InventoryService {
  constructor(@Inject('INVENTORY_DB') private readonly database: SupabaseClient | null) {}
  private db(): SupabaseClient {
    if (!this.database) throw new ServiceUnavailableException('Inventory database is not configured');
    return this.database;
  }
  async list() {
    try {
      // shortcut: the fictional inventory fits within 1,000 rows, add pagination before expanding that limit.
      const { data, error } = await this.db().from('vehicles').select('*').order('stocked_on');
      if (error || !data) throw new ServiceUnavailableException('Unable to load inventory');
      const now = new Date();
      const today = dealerDate(now);
      return { vehicles: (data as VehicleRow[]).map(row => vehicleView(row, today)), dealershipDate: today, timeZone: TIME_ZONE, serverTime: now.toISOString() };
    } catch (failure) {
      if (failure instanceof ServiceUnavailableException) throw failure;
      throw new ServiceUnavailableException('Unable to load inventory');
    }
  }
  async save(id: string, value: unknown) {
    validateId(id);
    const body = validateAction(value);
    const db = this.db();
    let result;
    try {
      result = await db.rpc('save_inventory_action', {
        p_id: id, p_action: body.action, p_note: body.note, p_expected_version: body.expectedVersion,
      }).single();
    } catch {
      throw new ServiceUnavailableException('Unable to save action. Please retry.');
    }
    if (result.error) {
      if (result.error.code === 'P0002') throw new NotFoundException('Vehicle is no longer in inventory');
      if (result.error.code === '40001') throw new ConflictException('Another manager changed this action. Review the latest vehicle before retrying.');
      if (result.error.code === '22023') throw new BadRequestException('Actions require a valid action and a vehicle stocked for more than 90 days');
      throw new ServiceUnavailableException('Unable to save action. Please retry.');
    }
    if (!result.data) throw new ServiceUnavailableException('Unable to confirm the saved action');
    return vehicleView(result.data as VehicleRow, dealerDate());
  }
}
```

`apps/api/src/inventory/inventory.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}
  @Get()
  list() { return this.inventory.list(); }
  @Patch(':id/action')
  save(@Param('id') id: string, @Body() body: unknown) { return this.inventory.save(id, body); }
}
```

`apps/api/src/inventory/inventory.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

export function createInventoryClient() {
  const url = process.env.INVENTORY_SUPABASE_URL;
  const key = process.env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const parsed = new URL(url);
  if (!['http:','https:'].includes(parsed.protocol) || !['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('Inventory Supabase URL must be a loopback URL for this demo');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
@Module({
  controllers: [InventoryController],
  providers: [{ provide: 'INVENTORY_DB', useFactory: createInventoryClient }, InventoryService],
})
export class InventoryModule {}
```

Import `InventoryModule` and append it to `AppModule.imports`; retain all other modules/controllers/providers:

```ts
import { InventoryModule } from './inventory/inventory.module.js';
// Within the existing @Module metadata:
imports: [InventoryModule],
```

Missing inventory configuration must not break the existing starter `/` test. It produces an explicit 503 from inventory routes, while an invalid non-loopback configuration fails safely.

- [ ] **Step 5: Load ignored API environment values and bind the demo to loopback.**

In the existing `apps/api/src/main.ts`, retain its module import and merge this bootstrap code with any configuration added since planning:

```ts
import { loadEnvFile } from 'node:process';

async function bootstrap() {
  try { loadEnvFile('.env'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173' });
  await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
}
await bootstrap();
```

- [ ] **Step 6: Add the HTTP contract check and verify all API checks.**

`apps/api/test/inventory.e2e-spec.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
const order = vi.fn();
const single = vi.fn();
beforeEach(async () => {
  single.mockClear(); order.mockClear();
  order.mockResolvedValue({ data: [], error: null });
  single.mockResolvedValue({ data: null, error: { code: '40001' } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider('INVENTORY_DB').useValue({
      from: () => ({ select: () => ({ order }) }), rpc: () => ({ single }),
    }).compile();
  app = module.createNestApplication();
  await app.init();
});
afterEach(async () => { await app.close(); });
it('returns a real empty snapshot with dealership metadata', async () => {
  const response = await request(app.getHttpServer()).get('/inventory').expect(200);
  expect(response.body.vehicles).toEqual([]);
  expect(response.body.timeZone).toBe('Asia/Ho_Chi_Minh');
  expect(response.body.dealershipDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
it('rejects unexpected fields before writing', async () => {
  await request(app.getHttpServer()).patch('/inventory/00000000-0000-4000-8000-000000000008/action')
    .send({ action: 'Monitor Stock', expectedVersion: 0, pricePence: 0 }).expect(400);
  expect(single).not.toHaveBeenCalled();
});
it('rejects malformed IDs and exposes version conflicts as 409', async () => {
  await request(app.getHttpServer()).patch('/inventory/not-an-id/action')
    .send({ action: 'Monitor Stock', expectedVersion: 0 }).expect(400);
  await request(app.getHttpServer()).patch('/inventory/00000000-0000-4000-8000-000000000008/action')
    .send({ action: 'Monitor Stock', expectedVersion: 0 }).expect(409);
});
```

The mock call history resets before each test so the no-write assertion is independent of test order. Run:

```sh
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api test:e2e
pnpm --filter @keyloop-interview/api typecheck
pnpm --filter @keyloop-interview/api build
```

Expected: PASS including the existing root endpoint tests. Stage only the inventory files and reviewed configuration/dependency changes under the baseline rule, then commit with `feat(api): expose validated inventory reads and action saves`.

## Task 4: Browser inventory contract, filters, and HTTP adapter

**Files:** Create `apps/web/src/admin/inventory/inventory-model.ts`, `inventory-model.test.ts`, `inventory-fixture.ts`, `inventory-api.ts`, `inventory-api.test.ts`.

- [ ] **Step 1: Write failing filter/boundary tests and a reusable test-only fixture.**

`apps/web/src/admin/inventory/inventory-fixture.ts` (imported only by tests):

```ts
import type { InventorySnapshot } from './inventory-model'
export const snapshot: InventorySnapshot = {
  dealershipDate: '2030-01-03', timeZone: 'Asia/Ho_Chi_Minh', serverTime: '2030-01-03T02:00:00Z',
  vehicles: [
    { id: '00000000-0000-4000-8000-000000000001', registration: 'KL-001', make: 'Toyota', model: 'Corolla', modelYear: 2022, pricePence: 1800000, stockedOn: '2029-10-04', currentAction: null, note: null, actionUpdatedAt: null, version: 0, daysInStock: 91, aging: true },
    { id: '00000000-0000-4000-8000-000000000002', registration: 'KL-002', make: 'BMW', model: 'X1', modelYear: 2023, pricePence: 2200000, stockedOn: '2029-10-05', currentAction: null, note: null, actionUpdatedAt: null, version: 0, daysInStock: 90, aging: false },
  ],
}
```

`apps/web/src/admin/inventory/inventory-model.test.ts`:

```ts
import { expect, it } from 'vitest'
import { filterVehicles, midnightDelay, parseSnapshot, summary } from './inventory-model'
import { snapshot } from './inventory-fixture'

it('separates 90 from 91 days and combines all filters', () => {
  expect(filterVehicles(snapshot.vehicles, { make: 'all', model: 'all', age: 'aging' }).map(v => v.registration)).toEqual(['KL-001'])
  expect(filterVehicles(snapshot.vehicles, { make: 'BMW', model: 'X1', age: '61-90' }).map(v => v.registration)).toEqual(['KL-002'])
  expect(filterVehicles(snapshot.vehicles, { make: 'BMW', model: 'Corolla', age: 'all' })).toEqual([])
  expect(summary(snapshot.vehicles)).toEqual({ total: 2, aging: 1, needsAction: 1 })
})
it('checks API shape and age consistency', () => {
  expect(parseSnapshot(snapshot)).toEqual(snapshot)
  expect(() => parseSnapshot({ ...snapshot, vehicles: [{ ...snapshot.vehicles[0], daysInStock: 90 }] })).toThrow()
  expect(() => parseSnapshot({ ...snapshot, vehicles: [{ ...snapshot.vehicles[0], pricePence: -1 }] })).toThrow()
})
it('refreshes at dealership midnight using server time', () => {
  expect(midnightDelay(snapshot)).toBe(15 * 60 * 60 * 1000 + 50)
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/inventory/inventory-model.test.ts`; expected FAIL resolving the missing model.

- [ ] **Step 2: Implement pure browser rules and response validation.**

`apps/web/src/admin/inventory/inventory-model.ts`:

```ts
import { DEALER_TIMEZONE, dealerDate } from '../dealer-date'
export const ACTIONS = ['Price Reduction Planned', 'Marketing Push Planned', 'Wholesale Review Planned', 'Monitor Stock'] as const
export type Action = typeof ACTIONS[number]
export type Age = 'all' | '0-30' | '31-60' | '61-90' | 'aging'
export interface Vehicle {
  id: string; registration: string; make: string; model: string; modelYear: number
  pricePence: number; stockedOn: string; currentAction: Action | null; note: string | null
  actionUpdatedAt: string | null; version: number; daysInStock: number; aging: boolean
}
export interface InventorySnapshot {
  vehicles: Vehicle[]; dealershipDate: string; timeZone: string; serverTime: string
}
export interface Filters { make: string; model: string; age: Age }
export interface ActionDraft { action: Action; note: string; expectedVersion: number }
export const AGE_OPTIONS = [
  { id: 'all', name: 'All stock ages' }, { id: '0-30', name: '0–30 days' },
  { id: '31-60', name: '31–60 days' }, { id: '61-90', name: '61–90 days' },
  { id: 'aging', name: 'Over 90 days' },
]
function dateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}
export function parseVehicle(value: unknown): Vehicle {
  if (!record(value)
      || typeof value.id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.id)
      || !['registration','make','model'].every(key => typeof value[key] === 'string' && String(value[key]).trim().length > 0)
      || !integer(value.modelYear,1886,2100) || !integer(value.pricePence,0,2147483647)
      || !dateOnly(value.stockedOn) || !integer(value.version,0,2147483647)
      || !integer(value.daysInStock,0) || value.aging !== (value.daysInStock > 90)
      || !(value.currentAction === null || ACTIONS.includes(value.currentAction as Action))
      || !(value.note === null || (typeof value.note === 'string' && value.note.length <= 1000))
      || !(value.actionUpdatedAt === null || (typeof value.actionUpdatedAt === 'string' && Number.isFinite(Date.parse(value.actionUpdatedAt))))
      || (value.currentAction === null && (value.note !== null || value.actionUpdatedAt !== null))
      || (value.currentAction !== null && value.actionUpdatedAt === null)) {
    throw new Error('Inventory service returned invalid vehicle data')
  }
  return value as unknown as Vehicle
}
export function parseSnapshot(value: unknown): InventorySnapshot {
  if (!record(value) || !Array.isArray(value.vehicles) || !dateOnly(value.dealershipDate)
      || value.timeZone !== DEALER_TIMEZONE || typeof value.serverTime !== 'string'
      || !Number.isFinite(Date.parse(value.serverTime))
      || dealerDate(new Date(value.serverTime)) !== value.dealershipDate) throw new Error('Inventory service returned an invalid snapshot')
  const vehicles = value.vehicles.map(parseVehicle)
  const today = value.dealershipDate
  if (new Set(vehicles.map(vehicle => vehicle.id)).size !== vehicles.length || vehicles.some(vehicle =>
    (Date.parse(today + 'T00:00:00Z') - Date.parse(vehicle.stockedOn + 'T00:00:00Z')) / 86400000 !== vehicle.daysInStock
  )) throw new Error('Inventory dates or vehicle IDs are inconsistent')
  return { vehicles, dealershipDate: today, timeZone: value.timeZone, serverTime: value.serverTime }
}
export function filterVehicles(vehicles: Vehicle[], filters: Filters): Vehicle[] {
  return vehicles.filter(vehicle => {
    const age = vehicle.daysInStock
    const matchesAge = filters.age === 'all' || (filters.age === 'aging' ? age > 90
      : filters.age === '0-30' ? age <= 30 : filters.age === '31-60' ? age >= 31 && age <= 60 : age >= 61 && age <= 90)
    return (filters.make === 'all' || vehicle.make === filters.make)
      && (filters.model === 'all' || vehicle.model === filters.model) && matchesAge
  }).sort((a,b) => b.daysInStock-a.daysInStock || a.id.localeCompare(b.id))
}
export function summary(vehicles: Vehicle[]) {
  return { total: vehicles.length, aging: vehicles.filter(v => v.aging).length, needsAction: vehicles.filter(v => v.aging && !v.currentAction).length }
}
export function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(pence / 100)
}
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: DEALER_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
export function midnightDelay(snapshot: InventorySnapshot): number {
  // shortcut: this dealership uses fixed UTC+07, replace this calculation if its configured timezone changes.
  const nextMidnight = Date.parse(snapshot.dealershipDate + 'T00:00:00+07:00') + 86400000
  return Math.max(1000, nextMidnight - Date.parse(snapshot.serverTime) + 50)
}
```

- [ ] **Step 3: Write failing HTTP/configuration adapter tests.**

`apps/web/src/admin/inventory/inventory-api.test.ts`:

```ts
import { afterEach, expect, it, vi } from 'vitest'
import { getInventory, inventoryRealtimeClient, saveAction } from './inventory-api'
import { snapshot } from './inventory-fixture'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('posts only the selected action, note, and expected version', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...snapshot.vehicles[0], currentAction: 'Monitor Stock', actionUpdatedAt: snapshot.serverTime, version: 1 })))
  vi.stubGlobal('fetch', fetcher)
  await saveAction(snapshot.vehicles[0].id, { action: 'Monitor Stock', note: 'weekly', expectedVersion: 0 })
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: 'Monitor Stock', note: 'weekly', expectedVersion: 0 })
})
it('keeps HTTP status for conflict handling', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Review the latest vehicle' }), { status: 409 })))
  await expect(getInventory()).rejects.toMatchObject({ status: 409 })
})
it('requires local public configuration instead of silently simulating live updates', () => {
  vi.stubEnv('VITE_INVENTORY_SUPABASE_URL', '')
  vi.stubEnv('VITE_INVENTORY_SUPABASE_ANON_KEY', '')
  expect(() => inventoryRealtimeClient()).toThrow(/Configure/)
  vi.stubEnv('VITE_INVENTORY_SUPABASE_URL', 'https://remote.example.com')
  vi.stubEnv('VITE_INVENTORY_SUPABASE_ANON_KEY', 'public-test-key')
  expect(() => inventoryRealtimeClient()).toThrow(/loopback/)
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/inventory/inventory-api.test.ts`; expected FAIL resolving the adapter.

- [ ] **Step 4: Implement the small HTTP/public-client adapter and run checks.**

`apps/web/src/admin/inventory/inventory-api.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { parseSnapshot, parseVehicle, type ActionDraft } from './inventory-model'

export class InventoryError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const timeout = AbortSignal.timeout(10000)
  const signal = init.signal ? AbortSignal.any([init.signal,timeout]) : timeout
  const response = await fetch('/api/inventory' + path, { ...init, signal })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message : 'Unable to complete the inventory request. Please retry.'
    throw new InventoryError(message, response.status)
  }
  return data
}
export async function getInventory(signal?: AbortSignal) {
  return parseSnapshot(await request('', { signal }))
}
export async function saveAction(id: string, draft: ActionDraft) {
  return parseVehicle(await request('/' + encodeURIComponent(id) + '/action', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
  }))
}
export function inventoryRealtimeClient() {
  const url = import.meta.env.VITE_INVENTORY_SUPABASE_URL
  const key = import.meta.env.VITE_INVENTORY_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Configure local Supabase to enable inventory and live updates')
  const parsed = new URL(url)
  if (!['http:','https:'].includes(parsed.protocol) || !['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('Inventory Realtime must use a loopback URL for this demo')
  }
  return createClient(url,key,{ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}
```

```sh
pnpm --filter @keyloop-interview/web test src/admin/inventory/inventory-model.test.ts src/admin/inventory/inventory-api.test.ts
pnpm --filter @keyloop-interview/web typecheck
git add -- apps/web/src/admin/inventory/inventory-model.ts apps/web/src/admin/inventory/inventory-model.test.ts apps/web/src/admin/inventory/inventory-api.ts apps/web/src/admin/inventory/inventory-api.test.ts apps/web/src/admin/inventory/inventory-fixture.ts
git commit -m "feat(web): define inventory filters and HTTP contract"
```

Expected: PASS. Fixture data must never be used as a runtime fallback.

## Task 5: WebSocket subscription, fresh snapshots, and recovery

**Files:** Create `apps/web/src/admin/inventory/watch-inventory.ts`, `watch-inventory.test.ts`, and `useInventory.ts`.

- [ ] **Step 1: Write failing subscription/recovery checks.**

`apps/web/src/admin/inventory/watch-inventory.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { watchInventory, type InventoryState } from './watch-inventory'
import { snapshot } from './inventory-fixture'

let status: (value: string) => void
let changed: () => void
let stop: (() => void) | undefined
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(snapshot.serverTime)) })
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); vi.useRealTimers() })
function setup(load = vi.fn().mockResolvedValue(snapshot)) {
  const states: InventoryState[] = []
  const channel = {
    on: vi.fn((_kind: string, _filter: unknown, callback: () => void) => { changed = callback; return channel }),
    subscribe: vi.fn((callback: (value: string) => void) => { status = callback; return channel }),
  }
  const removeChannel = vi.fn().mockResolvedValue('ok')
  const client = { channel: () => channel, removeChannel } as unknown as SupabaseClient
  const watcher = watchInventory(client, state => states.push(state), load)
  stop = watcher.stop
  return { states, load, channel, removeChannel, watcher }
}
it('loads initially and again after subscribing before claiming Live', async () => {
  const test = setup()
  await vi.waitFor(() => expect(test.states.at(-1)?.data).not.toBeNull())
  expect(test.states.at(-1)?.connection).toBe('Connecting')
  status('SUBSCRIBED')
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe('Live'))
  expect(test.load).toHaveBeenCalledTimes(2)
  expect(test.channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, expect.any(Function))
})
it('coalesces an event burst into one trailing authoritative fetch', async () => {
  let finish!: (value: typeof snapshot) => void
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValue(snapshot)
  const test = setup(load)
  status('SUBSCRIBED')
  for (let index = 0; index < 10; index++) changed()
  expect(load).toHaveBeenCalledTimes(1)
  finish(snapshot)
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe('Live'))
  expect(load).toHaveBeenCalledTimes(2)
})
it('marks old data stale on failures and refetches after reconnect', async () => {
  const test = setup()
  status('SUBSCRIBED')
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe('Live'))
  status('CHANNEL_ERROR')
  expect(test.states.at(-1)).toMatchObject({ stale: true, connection: 'Reconnecting' })
  status('SUBSCRIBED')
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe('Live'))
  test.load.mockRejectedValueOnce(new Error('Inventory refresh failed'))
  changed()
  await vi.waitFor(() => expect(test.states.at(-1)?.error).toBe('Inventory refresh failed'))
  expect(test.states.at(-1)?.data).not.toBeNull()
  expect(test.states.at(-1)?.stale).toBe(true)
  expect(test.states.at(-1)?.connection).not.toBe('Live')
})
it('refreshes on visible/focus/midnight and cleans everything up', async () => {
  const test = setup()
  status('SUBSCRIBED')
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe('Live'))
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const before = test.load.mock.calls.length
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(test.load.mock.calls.length).toBeGreaterThan(before))
  window.dispatchEvent(new Event('focus'))
  await vi.waitFor(() => expect(test.states.at(-1)?.connection).toBe('Live'))
  const midnightBefore = test.load.mock.calls.length
  await vi.advanceTimersByTimeAsync(15 * 60 * 60 * 1000 + 100)
  expect(test.load.mock.calls.length).toBeGreaterThan(midnightBefore)
  test.watcher.stop()
  const stoppedCount = test.load.mock.calls.length
  const stoppedStates = test.states.length
  changed(); status('SUBSCRIBED'); window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(86400000)
  expect(test.load).toHaveBeenCalledTimes(stoppedCount)
  expect(test.states).toHaveLength(stoppedStates)
  expect(test.removeChannel).toHaveBeenCalledTimes(1)
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/inventory/watch-inventory.test.ts`; expected FAIL resolving the watcher.

- [ ] **Step 2: Implement the lifecycle in one framework-independent module.**

`apps/web/src/admin/inventory/watch-inventory.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getInventory } from './inventory-api'
import { midnightDelay, type InventorySnapshot } from './inventory-model'

export interface InventoryState {
  data: InventorySnapshot | null
  connection: 'Connecting' | 'Live' | 'Reconnecting' | 'Disconnected'
  stale: boolean; loading: boolean; error: string | null; lastUpdated: string | null
}
export const INITIAL_INVENTORY: InventoryState = {
  data: null, connection: 'Connecting', stale: true, loading: true, error: null, lastUpdated: null,
}
export function watchInventory(
  client: SupabaseClient,
  onState: (state: InventoryState) => void,
  load: (signal?: AbortSignal) => Promise<InventorySnapshot> = getInventory,
) {
  let state: InventoryState = { ...INITIAL_INVENTORY }
  let stopped = false, connected = false, running = false, dirty = false, epoch = 0
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  function publish(patch: Partial<InventoryState>) {
    if (stopped) return
    state = { ...state, ...patch }
    onState(state)
  }
  async function drain() {
    running = true
    while (dirty && !stopped) {
      dirty = false
      const started = Date.now()
      const requestEpoch = epoch
      controller = new AbortController()
      try {
        const data = await load(controller.signal)
        if (stopped) break
        const fresh = connected && requestEpoch === epoch && !dirty
        publish({ data, loading: false, error: null, lastUpdated: new Date().toISOString(), stale: !fresh,
          connection: fresh ? 'Live' : connected ? 'Connecting' : state.connection })
        clearTimeout(timer)
        timer = setTimeout(refresh, Math.max(1000,midnightDelay(data) - (Date.now()-started)))
      } catch (failure) {
        if (!stopped) publish({ loading: false, stale: true,
          connection: connected ? 'Connecting' : state.connection,
          error: failure instanceof Error ? failure.message : 'Unable to refresh inventory. Please retry.' })
      }
    }
    controller = null
    running = false
  }
  function refresh() {
    if (stopped) return
    dirty = true
    publish({ stale: true, loading: state.data === null, connection: connected ? 'Connecting' : state.connection })
    if (!running) void drain()
  }
  function visibility() { if (document.visibilityState === 'visible') refresh() }
  const channel = client.channel('inventory-dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, refresh)
  refresh()
  channel.subscribe(status => {
    if (stopped) return
    epoch++
    connected = status === 'SUBSCRIBED'
    if (connected) refresh()
    else publish({ stale: true, connection: status === 'CLOSED' ? 'Disconnected' : 'Reconnecting' })
  })
  document.addEventListener('visibilitychange',visibility)
  window.addEventListener('focus',refresh)
  return {
    refresh,
    stop() {
      if (stopped) return
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange',visibility)
      window.removeEventListener('focus',refresh)
      void client.removeChannel(channel).catch(() => undefined)
    },
  }
}
```

Requests are serialized: an event during a request marks the result stale and requests one trailing snapshot. A notification never supplies displayed vehicle values. This prevents older responses replacing newer snapshots without maintaining a second client-side event store.

- [ ] **Step 3: Add the React hook, exposing refresh and configuration failures.**

`apps/web/src/admin/inventory/useInventory.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { inventoryRealtimeClient } from './inventory-api'
import { INITIAL_INVENTORY, watchInventory } from './watch-inventory'

export function useInventory() {
  const [state,setState] = useState(INITIAL_INVENTORY)
  const [attempt,setAttempt] = useState(0)
  const watcher = useRef<ReturnType<typeof watchInventory> | null>(null)
  useEffect(() => {
    try {
      const active = watchInventory(inventoryRealtimeClient(),setState)
      watcher.current = active
      return () => { active.stop(); if (watcher.current === active) watcher.current = null }
    } catch (failure) {
      setState(current => ({ ...current, connection: 'Disconnected', loading: false, stale: true,
        error: failure instanceof Error ? failure.message : 'Unable to configure inventory' }))
    }
  },[attempt])
  const refresh = useCallback(() => {
    if (watcher.current) watcher.current.refresh()
    else setAttempt(value => value+1)
  },[])
  return { ...state, refresh }
}
```

- [ ] **Step 4: Verify the lifecycle tests and commit only these files.**

```sh
pnpm --filter @keyloop-interview/web test src/admin/inventory/watch-inventory.test.ts
pnpm --filter @keyloop-interview/web typecheck
git add -- apps/web/src/admin/inventory/watch-inventory.ts apps/web/src/admin/inventory/watch-inventory.test.ts apps/web/src/admin/inventory/useInventory.ts
git commit -m "feat(web): refresh inventory through Supabase WebSockets"
```

Expected: PASS. Unit delivery is simulated; actual Supabase acceptance is Task 8. SDK subscription statuses drive reconnect indicators, and every resubscription forces a new snapshot before Live.

## Task 6: Inventory table, details, and action dialog inside AdminLayout

**Files:** Create `apps/web/src/admin/inventory/InventoryDashboard.tsx`, `InventoryTable.tsx`, `InventoryDetails.tsx`, `InventoryActionDialog.tsx`, `inventory.css`, and `InventoryDashboard.test.tsx`; modify `apps/web/src/main.tsx`. Reuse the latest shared Card metrics and vehicle-detail Popover pattern rather than adding the older split-panel layout.

- [ ] **Step 1: Write the UI tests before the components.**

`apps/web/src/admin/inventory/InventoryDashboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LazyMotion, domAnimation, MotionConfig } from 'motion/react'
import { InventoryDashboard } from './InventoryDashboard'
import { useInventory } from './useInventory'
import { getInventory, InventoryError, saveAction } from './inventory-api'
import { INITIAL_INVENTORY } from './watch-inventory'
import { snapshot } from './inventory-fixture'

vi.mock('./useInventory', () => ({ useInventory: vi.fn() }))
vi.mock('./inventory-api', async original => ({
  ...await original<typeof import('./inventory-api')>(), getInventory: vi.fn(), saveAction: vi.fn(),
}))
const refresh = vi.fn()
const saved = { ...snapshot.vehicles[0], currentAction: 'Monitor Stock' as const, note: 'weekly', actionUpdatedAt: snapshot.serverTime, version: 1 }
const state = () => ({ ...INITIAL_INVENTORY, data: snapshot, connection: 'Live' as const, stale: false, loading: false, lastUpdated: snapshot.serverTime, refresh })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useInventory).mockReturnValue(state())
  vi.mocked(saveAction).mockReset().mockResolvedValue(saved)
  vi.mocked(getInventory).mockReset().mockResolvedValue(snapshot)
  vi.stubGlobal('matchMedia',vi.fn().mockImplementation(() => ({ matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:vi.fn() })))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const page = () => <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="always"><InventoryDashboard /></MotionConfig></LazyMotion>
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(screen.getByRole('option', { name: option }))
}
it('renders inventory within the existing admin navigation and filters stock', async () => {
  const user = userEvent.setup()
  render(page())
  expect(screen.getByRole('heading', { name: 'Intelligent Inventory' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Bookings' }).getAttribute('href')).toBe('/admin/bookings')
  expect(within(screen.getByRole('table')).getByText('KL-002')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /Show aging stock/ }))
  expect(within(screen.getByRole('table')).queryByText('KL-002')).toBeNull()
  await choose(user,'Make','BMW')
  expect(screen.getByText('No vehicles match your filters.')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(within(screen.getByRole('table')).getByText('KL-002')).toBeTruthy()
})
it('saves an action and requests a persisted snapshot', async () => {
  const user = userEvent.setup()
  render(page())
  await user.click(screen.getByRole('button', { name: 'Log action for KL-001' }))
  await choose(user,'Current action','Monitor Stock')
  await user.type(screen.getByLabelText('Note (optional)'),'weekly')
  await user.click(screen.getByRole('button', { name: 'Save action' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(saveAction).toHaveBeenCalledWith(snapshot.vehicles[0].id,{ action: 'Monitor Stock', note: 'weekly', expectedVersion: 0 })
  expect(refresh).toHaveBeenCalled()
  expect(screen.getByText('KL-001 action saved.')).toBeTruthy()
})
it('shows vehicle context in the existing popover pattern and keeps it open for action editing', async () => {
  const user = userEvent.setup()
  render(page())
  await user.click(screen.getByRole('button',{ name:'View KL-001' }))
  const detailsElement = screen.getByRole('dialog',{ name:'Vehicle details' })
  const details = within(detailsElement)
  expect(details.getByText('2029-10-04')).toBeTruthy()
  await user.click(details.getByRole('button',{ name:'Log action' }))
  expect(screen.getByRole('dialog',{ name:'Log vehicle action' })).toBeTruthy()
  expect(detailsElement.isConnected).toBe(true)
})
it('retains a failed draft and requires deliberate review after a conflict', async () => {
  const user = userEvent.setup()
  vi.mocked(saveAction).mockRejectedValueOnce(new InventoryError('Another manager changed this action',409))
  vi.mocked(getInventory).mockResolvedValue({ ...snapshot, vehicles: [saved,snapshot.vehicles[1]] })
  render(page())
  await user.click(screen.getByRole('button', { name: 'Log action for KL-001' }))
  await choose(user,'Current action','Monitor Stock')
  await user.type(screen.getByLabelText('Note (optional)'),'my draft')
  await user.click(screen.getByRole('button', { name: 'Save action' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('Another manager'))
  expect((screen.getByLabelText('Note (optional)') as HTMLTextAreaElement).value).toBe('my draft')
  expect((screen.getByRole('button',{ name: 'Save action' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('button',{ name: 'Load latest action (replaces draft)' }))
  await waitFor(() => expect((screen.getByLabelText('Note (optional)') as HTMLTextAreaElement).value).toBe('weekly'))
  await user.click(screen.getByRole('button',{ name: 'Save action' }))
  await waitFor(() => expect(saveAction).toHaveBeenLastCalledWith(snapshot.vehicles[0].id,expect.objectContaining({ expectedVersion: 1 })))
})
it('does not replace an open draft or expected version when snapshots change', async () => {
  const user = userEvent.setup()
  const rendered = render(page())
  await user.click(screen.getByRole('button', { name: 'Log action for KL-001' }))
  await choose(user,'Current action','Monitor Stock')
  await user.type(screen.getByLabelText('Note (optional)'),'keep this draft')
  vi.mocked(useInventory).mockReturnValue({ ...state(), data: { ...snapshot, vehicles: [saved,snapshot.vehicles[1]] } })
  rendered.rerender(page())
  expect((screen.getByLabelText('Note (optional)') as HTMLTextAreaElement).value).toBe('keep this draft')
  await user.click(screen.getByRole('button', { name: 'Save action' }))
  await waitFor(() => expect(saveAction).toHaveBeenCalledWith(snapshot.vehicles[0].id,expect.objectContaining({ expectedVersion: 0 })))
})
it('supports Escape and restores the originating action control', async () => {
  const user = userEvent.setup()
  render(page())
  const trigger = screen.getByRole('button', { name: 'Log action for KL-001' })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(trigger)
})
it('shows a real empty dealership separately from a failed load', () => {
  vi.mocked(useInventory).mockReturnValue({ ...state(), data: { ...snapshot, vehicles: [] } })
  const rendered = render(page())
  expect(screen.getByText('No vehicles in inventory.')).toBeTruthy()
  vi.mocked(useInventory).mockReturnValue({ ...state(), data: null, error: 'Inventory is unavailable', stale: true, connection: 'Disconnected' })
  rendered.rerender(page())
  expect(screen.getByRole('alert').textContent).toContain('Inventory is unavailable')
  expect(screen.queryByText('No vehicles in inventory.')).toBeNull()
})
```

Run `pnpm --filter @keyloop-interview/web test src/admin/inventory/InventoryDashboard.test.tsx`; expected FAIL resolving the page.

- [ ] **Step 2: Add the table and details components using existing UI primitives.**

`apps/web/src/admin/inventory/InventoryTable.tsx`:

```tsx
import { Badge } from '@keyloop-interview/ui/components/badge'
import { Button } from '@keyloop-interview/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@keyloop-interview/ui/components/table'
import { Popover, PopoverTrigger, PopoverContent } from '@keyloop-interview/ui/components/popover'
import { useIsMobile } from '@keyloop-interview/ui/lib/use-mobile'
import { InventoryDetails } from './InventoryDetails'
import { money, type Vehicle } from './inventory-model'

export function InventoryTable({ vehicles, selectedId, onSelect, onAction, modalOpen }: {
  vehicles: Vehicle[]; selectedId: string | null; onSelect: (vehicle: Vehicle | null) => void; modalOpen: boolean
  onAction: (vehicle: Vehicle, trigger: HTMLElement) => void
}) {
  const isMobile = useIsMobile()
  return <Table aria-label="Vehicle inventory">
    <TableHeader><TableRow>
      <TableHead>Vehicle</TableHead><TableHead>Registration</TableHead><TableHead>Price</TableHead>
      <TableHead>Days in stock</TableHead><TableHead>Current action</TableHead><TableHead>Manage</TableHead>
    </TableRow></TableHeader>
    <TableBody>{vehicles.map(vehicle => <TableRow key={vehicle.id} data-state={selectedId === vehicle.id ? 'selected' : undefined}>
      <TableCell><Popover open={selectedId === vehicle.id} onOpenChange={open => onSelect(open ? vehicle : null)}>
        <PopoverTrigger asChild><Button variant="link" className="h-auto p-0" aria-label={'View ' + vehicle.registration}>
          {vehicle.make} {vehicle.model}
        </Button></PopoverTrigger>
        <PopoverContent aria-label="Vehicle details" className="inventory-details-popover" side={isMobile ? 'bottom' : 'right'} align="start" sideOffset={10} collisionPadding={12}
          onInteractOutside={event => { if (modalOpen) event.preventDefault() }}
          onCloseAutoFocus={event => { if (modalOpen || selectedId !== vehicle.id) event.preventDefault() }}>
          <InventoryDetails vehicle={vehicle} onClose={() => onSelect(null)} onAction={onAction} />
        </PopoverContent>
      </Popover><p className="text-xs text-muted-foreground">{vehicle.modelYear}</p></TableCell>
      <TableCell>{vehicle.registration}</TableCell><TableCell>{money(vehicle.pricePence)}</TableCell>
      <TableCell><p>{vehicle.daysInStock} days</p>{vehicle.aging && <Badge variant="outline">Aging stock</Badge>}</TableCell>
      <TableCell>{vehicle.currentAction ?? (vehicle.aging ? <Badge variant="outline">Needs action</Badge> : '—')}</TableCell>
      <TableCell>{vehicle.aging ? <Button size="sm" variant="outline" aria-label={(vehicle.currentAction ? 'Edit action for ' : 'Log action for ') + vehicle.registration}
        onClick={event => onAction(vehicle,event.currentTarget)}>{vehicle.currentAction ? 'Edit action' : 'Log action'}</Button> : <span className="text-xs text-muted-foreground">No action required</span>}</TableCell>
    </TableRow>)}</TableBody>
  </Table>
}
```

`apps/web/src/admin/inventory/InventoryDetails.tsx`:

```tsx
import { Button } from '@keyloop-interview/ui/components/button'
import { PopoverHeader, PopoverTitle } from '@keyloop-interview/ui/components/popover'
import { Separator } from '@keyloop-interview/ui/components/separator'
import { money, timestamp, type Vehicle } from './inventory-model'

export function InventoryDetails({ vehicle, onClose, onAction }: {
  vehicle: Vehicle; onClose: () => void
  onAction: (vehicle: Vehicle, trigger: HTMLElement) => void
}) {
  return <div className="admin-details">
    <PopoverHeader className="flex-row items-start justify-between gap-3">
      <PopoverTitle className="font-heading text-xl font-semibold">{vehicle.registration}</PopoverTitle>
      <Button variant="ghost" size="icon-sm" aria-label="Close vehicle details" onClick={onClose}>×</Button>
    </PopoverHeader>
      <Separator className="mt-5" />
      <section className="admin-detail-section"><h3>Vehicle & stock</h3><dl>
        <div><dt>Vehicle</dt><dd>{vehicle.make} {vehicle.model} · {vehicle.modelYear}</dd></div>
        <div><dt>Price · GBP</dt><dd>{money(vehicle.pricePence)}</dd></div>
        <div><dt>Stocked on</dt><dd>{vehicle.stockedOn}</dd></div>
        <div><dt>Days in inventory</dt><dd>{vehicle.daysInStock}{vehicle.aging ? ' · Aging stock' : ''}</dd></div>
      </dl></section>
      <Separator className="mt-5" />
      <section className="admin-detail-section"><h3>Current action</h3><dl>
        <div><dt>Action</dt><dd>{vehicle.currentAction ?? (vehicle.aging ? 'Needs action' : 'No action required')}</dd></div>
        <div><dt>Note</dt><dd className="whitespace-pre-wrap">{vehicle.note ?? 'No note recorded.'}</dd></div>
        {vehicle.actionUpdatedAt && <div><dt>Last updated · dealership local</dt><dd>{timestamp(vehicle.actionUpdatedAt)}</dd></div>}
      </dl></section>
      {vehicle.aging && <Button className="mt-5" onClick={event => onAction(vehicle,event.currentTarget)}>{vehicle.currentAction ? 'Edit action' : 'Log action'}</Button>}
  </div>
}
```

- [ ] **Step 3: Add the action dialog, retaining drafts and handling conflicts explicitly.**

`apps/web/src/admin/inventory/InventoryActionDialog.tsx`:

```tsx
import { useId, useState } from 'react'
import { Button } from '@keyloop-interview/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@keyloop-interview/ui/components/dialog'
import { Label } from '@keyloop-interview/ui/components/label'
import { Textarea } from '@keyloop-interview/ui/components/textarea'
import { AdminSelect } from '../AdminSelect'
import { getInventory, InventoryError, saveAction } from './inventory-api'
import { ACTIONS, type Action, type Vehicle } from './inventory-model'

export function InventoryActionDialog({ vehicle, onClose, onSaved, restoreFocus }: {
  vehicle: Vehicle; onClose: () => void; onSaved: (saved: Vehicle) => void; restoreFocus: () => void
}) {
  const noteId = useId()
  const [base,setBase] = useState(vehicle)
  const [action,setAction] = useState<Action | ''>(vehicle.currentAction ?? '')
  const [note,setNote] = useState(vehicle.note ?? '')
  const [saving,setSaving] = useState(false)
  const [reviewing,setReviewing] = useState(false)
  const [conflict,setConflict] = useState(false)
  const [missing,setMissing] = useState(false)
  const [error,setError] = useState<string | null>(null)
  const [notice,setNotice] = useState('')
  async function reviewLatest() {
    setReviewing(true)
    try {
      const snapshot = await getInventory()
      const latest = snapshot.vehicles.find(item => item.id === vehicle.id)
      if (!latest) throw new InventoryError('Vehicle is no longer in inventory',404)
      if (!latest.aging) throw new InventoryError('Vehicle is no longer aging stock',400)
      setBase(latest); setAction(latest.currentAction ?? ''); setNote(latest.note ?? '')
      setConflict(false); setError(null); setNotice('Latest action loaded. Review it before saving.')
    } catch (failure) {
      if (failure instanceof InventoryError && failure.status === 404) setMissing(true)
      setError(failure instanceof Error ? failure.message : 'Unable to load the latest action')
    } finally { setReviewing(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving && !reviewing) onClose() }}>
    <DialogContent onCloseAutoFocus={event => { event.preventDefault(); restoreFocus() }}>
      <DialogHeader><DialogTitle>{vehicle.currentAction ? 'Edit vehicle action' : 'Log vehicle action'}</DialogTitle>
        <DialogDescription>{vehicle.registration} · {vehicle.make} {vehicle.model} · {vehicle.daysInStock} days in stock. Saves persist in local Supabase.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-5" onSubmit={async event => {
        event.preventDefault()
        if (!action || saving || reviewing || conflict || missing) return
        setSaving(true); setError(null); setNotice('')
        try { onSaved(await saveAction(vehicle.id,{ action, note: note.trim(), expectedVersion: base.version })) }
        catch (failure) {
          setConflict(failure instanceof InventoryError && failure.status === 409)
          setMissing(failure instanceof InventoryError && failure.status === 404)
          setError(failure instanceof Error ? failure.message : 'Unable to save action. Please retry.')
        } finally { setSaving(false) }
      }}>
        <AdminSelect label="Current action" value={action} onChange={value => setAction(value as Action)} options={ACTIONS.map(value => ({ id: value, name: value }))} disabled={saving || reviewing} />
        <div className="grid gap-2"><Label htmlFor={noteId}>Note (optional)</Label>
          <Textarea id={noteId} value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={4} disabled={saving || reviewing} aria-describedby={noteId + '-help'} />
          <p id={noteId + '-help'} className="text-xs text-muted-foreground">Up to 1,000 characters. Only the current action is retained.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {conflict && !missing && <Button type="button" variant="outline" disabled={reviewing} onClick={() => void reviewLatest()}>Load latest action (replaces draft)</Button>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving || reviewing} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!action || saving || reviewing || conflict || missing}>{saving ? 'Saving…' : 'Save action'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
```

- [ ] **Step 4: Compose the page and scoped responsive styles.**

`apps/web/src/admin/inventory/InventoryDashboard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@keyloop-interview/ui/components/badge'
import { Button } from '@keyloop-interview/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@keyloop-interview/ui/components/card'
import { AdminLayout } from '../AdminLayout'
import { AdminSelect } from '../AdminSelect'
import { DEALER_TIMEZONE } from '../dealer-date'
import { InventoryActionDialog } from './InventoryActionDialog'
import { InventoryTable } from './InventoryTable'
import { AGE_OPTIONS, filterVehicles, summary, timestamp, type Filters, type Vehicle } from './inventory-model'
import { useInventory } from './useInventory'
import './inventory.css'

const EMPTY_FILTERS: Filters = { make: 'all', model: 'all', age: 'all' }
export function InventoryDashboard() {
  const inventory = useInventory()
  const [filters,setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selectedId,setSelectedId] = useState<string | null>(null)
  const [editing,setEditing] = useState<Vehicle | null>(null)
  const [notice,setNotice] = useState('')
  const trigger = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const vehicles = inventory.data?.vehicles ?? []
  const visible = filterVehicles(vehicles,filters)
  const counts = summary(vehicles)
  const makes = [...new Set(vehicles.map(vehicle => vehicle.make))].sort()
  const models = [...new Set(vehicles.filter(vehicle => filters.make === 'all' || vehicle.make === filters.make).map(vehicle => vehicle.model))].sort()
  const filtered = filters.make !== 'all' || filters.model !== 'all' || filters.age !== 'all'
  useEffect(() => {
    const previous = document.title
    document.title = 'Intelligent Inventory · Keyloop'
    return () => { document.title = previous }
  },[])
  function openAction(vehicle: Vehicle, element: HTMLElement) {
    trigger.current = element
    setEditing(vehicle)
  }
  function restoreFocus() {
    (trigger.current?.isConnected ? trigger.current : heading.current)?.focus()
  }
  return <>
    <AdminLayout activePage="inventory">
      <header className="admin-header">
        <div><p className="admin-eyebrow">SUPPLY / INVENTORY</p>
          <h1 ref={heading} tabIndex={-1}>Intelligent Inventory</h1>
          <p className="mt-2 text-sm text-muted-foreground">One dealership · {DEALER_TIMEZONE}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{inventory.stale && inventory.connection === 'Live' ? 'Data stale' : inventory.connection}</Badge>
          <Button variant="outline" onClick={inventory.refresh} disabled={inventory.loading}>Refresh inventory</Button>
        </div>
      </header>
      {inventory.error && <div role="alert" className="inventory-warning"><p>{inventory.error}</p><Button variant="outline" onClick={inventory.refresh}>Retry</Button></div>}
      {inventory.loading && !inventory.data && <p role="status">Loading inventory…</p>}
      {inventory.data && <>
        {inventory.stale && <p className="inventory-warning" role="status">Inventory may be out of date. Waiting for a fresh snapshot and live connection.</p>}
        <section className="admin-metrics" aria-label="Dealership inventory summary">
          {[
            { label:'Total vehicles',value:counts.total,description:'All dealership stock' },
            { label:'Aging stock',value:counts.aging,description:'More than 90 days in inventory' },
            { label:'Needs action',value:counts.needsAction,description:'Aging vehicles with no saved action' },
          ].map(metric => <div key={metric.label}><Card className="h-full gap-2 py-4">
            <CardHeader className="gap-2 px-4"><CardDescription className="text-foreground font-medium">{metric.label}</CardDescription><CardTitle className="font-heading text-[28px] tabular-nums">{metric.value}</CardTitle></CardHeader>
            <CardContent className="px-4 text-xs text-muted-foreground">{metric.description}</CardContent>
          </Card></div>)}
        </section>
        <Card className="admin-board gap-0 py-0"><CardContent className="space-y-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading font-semibold">Vehicle inventory</h2>
            <Button variant={filters.age === 'aging' ? 'secondary' : 'outline'} onClick={() => setFilters(current => ({ ...current, age: 'aging' }))}>Show aging stock ({counts.aging})</Button>
          </div>
          <div className="inventory-filters">
            <AdminSelect label="Make" value={filters.make} options={[{ id: 'all', name: 'All makes' },...makes.map(value => ({ id: value, name: value }))]}
              onChange={make => setFilters(current => ({ ...current, make, model: current.model !== 'all' && vehicles.some(vehicle => (make === 'all' || vehicle.make === make) && vehicle.model === current.model) ? current.model : 'all' }))} />
            <AdminSelect label="Model" value={filters.model} options={[{ id: 'all', name: 'All models' },...models.map(value => ({ id: value, name: value }))]} onChange={model => setFilters(current => ({ ...current, model }))} />
            <AdminSelect label="Days in stock" value={filters.age} options={AGE_OPTIONS} onChange={age => setFilters(current => ({ ...current, age: age as Filters['age'] }))} />
          </div>
          <div className="admin-workspace">
            <section className="min-w-0" aria-label="Inventory results">
              {visible.length ? <InventoryTable vehicles={visible} selectedId={selectedId} onSelect={vehicle => setSelectedId(vehicle?.id ?? null)} onAction={openAction} modalOpen={editing !== null} /> :
                <div className="admin-empty"><h3>{vehicles.length ? 'No vehicles match your filters.' : 'No vehicles in inventory.'}</h3><p>{vehicles.length ? 'Change the make, model, or stock age.' : 'No vehicle records have been loaded for this dealership.'}</p></div>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{visible.length} of {vehicles.length} vehicles shown{filtered ? ' · filtered' : ''}</span>
                {filtered && <Button variant="link" size="xs" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button>}
              </div>
            </section>
          </div>
        </CardContent></Card>
        <p className="mt-4 text-xs text-muted-foreground">{inventory.lastUpdated ? 'Last refreshed: ' + timestamp(inventory.lastUpdated) : 'Waiting for inventory'} · Stock age uses the dealership date.</p>
      </>}
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">{notice}</p>
      <footer className="admin-page-footer"><span>Keyloop · Supply</span><span>Fictional inventory. Actions persist in local Supabase.</span></footer>
    </AdminLayout>
    {editing && <InventoryActionDialog key={editing.id} vehicle={editing} onClose={() => setEditing(null)} restoreFocus={restoreFocus} onSaved={saved => {
      setNotice(saved.registration + ' action saved.'); setEditing(null); inventory.refresh()
    }} />}
  </>
}
```

`apps/web/src/admin/inventory/inventory.css`:

```css
.inventory-filters { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--kl-space-4); }
.inventory-details-popover { width: min(360px,calc(100vw - 24px)); max-height: min(560px,calc(100dvh - 24px)); overflow-y: auto; }
.inventory-warning { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--kl-space-3); padding: var(--kl-space-4); margin-bottom: var(--kl-space-5); border: 1px solid var(--border); border-left: 3px solid var(--primary); border-radius: var(--kl-radius-control); background: var(--card); font-size: 14px; }
@media (max-width: 520px) { .inventory-filters { grid-template-columns: minmax(0,1fr); } }
```

- [ ] **Step 5: Add the exact route while preserving existing route branches and providers.**

Add the import alongside the current lazy route definitions in `apps/web/src/main.tsx`:

```tsx
const InventoryDashboard = lazy(() => import('./admin/inventory/InventoryDashboard').then(module => ({ default: module.InventoryDashboard })))
```

The current two-route render expression becomes:

```tsx
{window.location.pathname === '/admin/bookings' ? <BookingDashboard />
  : window.location.pathname === '/admin/inventory' ? <InventoryDashboard />
  : <App />}
```

If additional routes exist when executing, add only the inventory branch; do not remove them or the current Motion/StrictMode/Suspense wrappers.

- [ ] **Step 6: Run inventory and booking regressions, then commit scoped changes.**

```sh
pnpm --filter @keyloop-interview/web test src/admin
pnpm --filter @keyloop-interview/web typecheck
pnpm --filter @keyloop-interview/web build
git diff --check
git add -- apps/web/src/admin/inventory/InventoryDashboard.tsx apps/web/src/admin/inventory/InventoryTable.tsx apps/web/src/admin/inventory/InventoryDetails.tsx apps/web/src/admin/inventory/InventoryActionDialog.tsx apps/web/src/admin/inventory/InventoryDashboard.test.tsx apps/web/src/admin/inventory/inventory.css
git commit -m "feat(web): add inventory management to the admin dashboard"
```

Expected: PASS. Include reviewed tracked route edits under the baseline staging rule. Existing booking tests must still pass; do not weaken their assertions to accommodate extraction regressions.

## Task 7: Local credentials, development proxy, and setup documentation

**Files:** Create/merge API/web `.env.example`; modify `apps/web/vite.config.ts`, `.gitignore`, root/web/API READMEs. Actual `.env` files remain ignored and owner-readable.

- [ ] **Step 1: Add browser-safe/server-only example configuration.**

Append missing keys to `apps/api/.env.example`, preserving other features' examples:

```dotenv
INVENTORY_SUPABASE_URL=http://127.0.0.1:55321
INVENTORY_SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_ORIGIN=http://127.0.0.1:5173
PORT=3000
```

Append missing keys to `apps/web/.env.example`:

```dotenv
VITE_INVENTORY_SUPABASE_URL=http://127.0.0.1:55321
VITE_INVENTORY_SUPABASE_ANON_KEY=
```

Add only absent ignore entries, retaining all current rules:

```gitignore
supabase/.temp/
supabase/.branches/
```

Existing `.env`, `.env.*`, and `!.env.example` rules already keep actual credentials untracked. Verify this after files are written.

- [ ] **Step 2: Merge the development proxy into the current Vite config.**

`apps/web/vite.config.ts`, if it still contains only the inspected React/Tailwind plugins:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(),tailwindcss()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: process.env.INVENTORY_API_ORIGIN ?? 'http://127.0.0.1:3000',
        rewrite: path => path.replace(/^\/api/,''),
      },
    },
  },
})
```

Preserve any unrelated plugins, routes, tests, or proxy entries added since inspection. This proxy applies only to development; this plan does not deploy the app.

- [ ] **Step 3: Generate only the designated local inventory environment values without printing keys.**

Run this only after verifying the local stack identity and loopback port bindings. It captures CLI JSON privately and merges only inventory keys into existing environment files:

```python
from pathlib import Path
import json, os, subprocess, tempfile
from urllib.parse import urlparse

status = json.loads(subprocess.check_output(['supabase','status','-o','json'],text=True,stderr=subprocess.DEVNULL))
url = status['API_URL']
parsed = urlparse(url)
assert parsed.hostname in ('localhost','127.0.0.1','::1') and parsed.port == 55321
def merge_env(path, values):
    path = Path(path)
    original = path.read_text().splitlines() if path.exists() else []
    for line in original:
        if line.startswith(('INVENTORY_SUPABASE_URL=','VITE_INVENTORY_SUPABASE_URL=')):
            existing = line.split('=',1)[1].strip().strip('"').strip("'")
            assert not existing or existing == url, 'Existing inventory targets another instance; inspect before replacing it'
    kept = [line for line in original if line.split('=',1)[0] not in values]
    content = '\n'.join(kept + [key+'='+json.dumps(value) for key,value in values.items()])+'\n'
    descriptor, temporary = tempfile.mkstemp(dir=path.parent,prefix='.inventory-env-')
    try:
        os.fchmod(descriptor,0o600)
        with os.fdopen(descriptor,'w') as handle:
            handle.write(content)
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
merge_env('apps/api/.env',{
  'INVENTORY_SUPABASE_URL':url,
  'INVENTORY_SUPABASE_SERVICE_ROLE_KEY':status['SERVICE_ROLE_KEY'],
})
merge_env('apps/web/.env',{
  'VITE_INVENTORY_SUPABASE_URL':url,
  'VITE_INVENTORY_SUPABASE_ANON_KEY':status['ANON_KEY'],
})
print('Updated ignored API/web inventory environment values; keys were not printed.')
```

```sh
git check-ignore apps/api/.env apps/web/.env
```

Expected: both actual environment paths are ignored. Browser variables contain only the anonymous key; never copy the service-role key to a `VITE_` variable.

- [ ] **Step 4: Append concrete usage instructions to the READMEs.**

Add to the root README:

```markdown
## Intelligent Inventory

`/admin/inventory` extends the existing admin navigation. Filter by make, model,
or days in stock; stock becomes aging at 91 days. Log an action and optional note
for aging vehicles. Actions persist in local Supabase PostgreSQL. Supabase
Realtime uses WebSockets to invalidate and refetch inventory in connected tabs.

Local prerequisites: Docker, Supabase CLI, Node 22.12+, pnpm 8.10.3.
Start this repository's isolated stack with:

    supabase start --network-id keyloop-inventory-local
    supabase migration up --local
    docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql

Create the loopback Docker network before first start, using the setup procedure
in the inventory implementation plan. Configure the API/web inventory environment
variables described in their `.env.example` files, then run `pnpm dev`.

The seed inserts missing fictional vehicles only; ordinary startup never replaces
saved actions. No reset command is needed. Do not run `supabase db reset` against
an existing demo database to apply a migration.

Bookings remain a separate session-only demo; navigating away resets sample booking
changes. Inventory actions persist. Both sections use Asia/Ho_Chi_Minh dealership
dates. The root component library remains at `/`.

This application is local-only, with fictional inventory and no staff login. Its
anonymous inventory read policy is not authorization for real dealership data.
```

Add to `apps/web/README.md`:

```markdown
## Inventory administration

- `/admin/inventory`: make/model/stock-age filters, aging indicators, vehicle
  details, and persisted action editing within the shared admin layout.
- `VITE_INVENTORY_SUPABASE_URL` and `VITE_INVENTORY_SUPABASE_ANON_KEY` configure
  the local browser subscription. A service-role key must never be browser-side.
- NestJS HTTP reads/writes use the development `/api` proxy. Realtime events are
  invalidation hints; reconnect, visibility restoration, and dealership midnight
  trigger authoritative snapshot refreshes. A stale connection/data warning is
  shown instead of claiming old inventory is live.
- `INVENTORY_API_ORIGIN` can select a different loopback API during isolated
  development, for example `http://127.0.0.1:3006`.
- No runtime sample-data fallback exists. Configure local Supabase before using
  this page. Existing booking samples still reset on reload.

Run `pnpm --filter @keyloop-interview/web test`, `typecheck`, and `build`.
Live Supabase checks require the opt-in procedure in the inventory plan; ordinary
unit tests do not prove database persistence or browser WebSocket delivery.
```

Add to `apps/api/README.md`:

```markdown
## Inventory API

`GET /inventory` returns a snapshot with dealership date/timezone and stock ages.
`PATCH /inventory/:id/action` accepts `action`, optional `note`, and required
`expectedVersion`. Actions apply only to stock over 90 days. Updates are locked
and version-checked inside PostgreSQL; stale edits return 409 for explicit review.

The API reads ignored `.env` values at startup. Configure
`INVENTORY_SUPABASE_URL` and `INVENTORY_SUPABASE_SERVICE_ROLE_KEY` for the local
stack. Missing configuration returns 503 for inventory without breaking the
starter endpoint. Database errors and credentials are not returned to clients.

The Supabase migration grants anonymous read access only to fictional inventory;
browser writes and action RPC execution are denied. The service-role key is
server-only. This is a loopback demo, not staff authentication or a public service.

Use `supabase migration up --local` for schema upgrades. `supabase/seed.sql`
inserts missing fictional samples without updating existing rows/actions.
SQL behavior checks are in `supabase/tests/inventory.sql`; the test transaction
rolls back its own fixtures. Two-browser delivery and restart persistence are
separate acceptance checks in the inventory implementation plan.
```

- [ ] **Step 5: Check the configured boundaries and commit reviewed documentation/configuration.**

```sh
pnpm --filter @keyloop-interview/web typecheck
pnpm --filter @keyloop-interview/api typecheck
git diff --check
git status --short
```

Expected: actual `.env` files do not appear as untracked or staged. Stage only examples and reviewed inventory-specific configuration/documentation changes under the baseline rule, then commit `docs: document local inventory and Supabase setup`.

## Task 8: Real Supabase, two-browser acceptance, and final verification

**Files:** Create `apps/web/src/admin/inventory/inventory.live.test.ts`; record observed checks in `exports/inventory-browser-checks.json`. Update README evidence only after checks actually run.

- [ ] **Step 1: Add an opt-in real-service test that owns and cleans only its own fixture.**

`apps/web/src/admin/inventory/inventory.live.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { dealerDate } from '../dealer-date'

describe.skipIf(env.RUN_INVENTORY_LIVE !== '1')('real local Supabase inventory', () => {
  let server: SupabaseClient | undefined
  let anonymous: SupabaseClient | undefined
  let url: string, publicKey: string, origin: string
  const id = randomUUID()
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  beforeAll(async () => {
    url = env.INVENTORY_TEST_URL ?? ''
    publicKey = env.INVENTORY_TEST_ANON_KEY ?? ''
    origin = env.INVENTORY_TEST_API_ORIGIN ?? 'http://127.0.0.1:3006'
    const parsed = new URL(url)
    const api = new URL(origin)
    if (!['127.0.0.1','localhost'].includes(parsed.hostname) || parsed.port !== '55321'
        || !['127.0.0.1','localhost'].includes(api.hostname)
        || !env.INVENTORY_TEST_SERVICE_ROLE_KEY || !publicKey) throw new Error('Explicit local inventory test configuration required')
    server = createClient(url,env.INVENTORY_TEST_SERVICE_ROLE_KEY,{ auth })
    anonymous = createClient(url,publicKey,{ auth })
    const today = dealerDate()
    const stockedOn = new Date(Date.parse(today+'T00:00:00Z')-120*86400000).toISOString().slice(0,10)
    const inserted = await server.from('vehicles').insert({ id, registration: 'INV-TEST-'+id.slice(0,8), make: 'Test', model: 'Owned fixture', model_year: 2022, price_pence: 1000000, stocked_on: stockedOn })
    if (inserted.error) throw new Error('Unable to insert the owned local test fixture')
  })
  afterAll(async () => {
    if (server) {
      const removed = await server.from('vehicles').delete().eq('id',id)
      if (removed.error) throw new Error('Owned inventory fixture cleanup failed: '+id)
      server.realtime.disconnect()
    }
    anonymous?.realtime.disconnect()
  })
  async function write(action: string, expectedVersion: number) {
    return fetch(origin+'/inventory/'+id+'/action',{
      method: 'PATCH', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ action, note: 'Owned realtime verification fixture', expectedVersion }),
    })
  }
  it('permits anonymous reads but rejects table writes and action RPC', async () => {
    const read = await anonymous!.from('vehicles').select('id').eq('id',id).single()
    expect(read.error).toBeNull()
    expect(read.data?.id).toBe(id)
    const update = await anonymous!.from('vehicles').update({ note: 'forbidden' }).eq('id',id)
    expect(update.error).not.toBeNull()
    const insert = await anonymous!.from('vehicles').insert({ id: randomUUID(), registration:'FORBIDDEN-TEST' })
    expect(insert.error).not.toBeNull()
    const remove = await anonymous!.from('vehicles').delete().eq('id',id)
    expect(remove.error).not.toBeNull()
    const rpc = await anonymous!.rpc('save_inventory_action',{ p_id:id,p_action:'Monitor Stock',p_note:null,p_expected_version:0 })
    expect(rpc.error).not.toBeNull()
  })
  it('persists through the API and delivers committed changes to two independent WebSocket clients', async () => {
    const clients = [createClient(url,publicKey,{ auth }),createClient(url,publicKey,{ auth })]
    const subscriptions = clients.map(client => {
      let notify!: () => void
      const changed = new Promise<void>(resolve => { notify = resolve })
      let channel: ReturnType<SupabaseClient['channel']>
      const ready = new Promise<void>((resolve,reject) => {
        channel = client.channel('inventory-proof-'+randomUUID())
          .on('postgres_changes',{ event:'UPDATE',schema:'public',table:'vehicles',filter:'id=eq.'+id },notify)
          .subscribe(status => {
            if (status === 'SUBSCRIBED') resolve()
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reject(new Error('Local Realtime subscription failed'))
          })
      })
      return { client, channel: channel!, ready, changed }
    })
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.all(subscriptions.map(subscription => subscription.ready))
      const current = await server!.from('vehicles').select('version').eq('id',id).single()
      expect(current.error).toBeNull()
      const response = await write('Monitor Stock',current.data!.version)
      expect(response.status).toBe(200)
      const saved = await response.json()
      expect(saved.version).toBe(current.data!.version+1)
      await Promise.race([
        Promise.all(subscriptions.map(subscription => subscription.changed)),
        new Promise((_,reject) => { timeout=setTimeout(() => reject(new Error('Real WebSocket updates were not received')),10000) }),
      ])
      const read = await fetch(origin+'/inventory')
      expect(read.status).toBe(200)
      const snapshot = await read.json()
      expect(snapshot.vehicles.find((vehicle: { id: string }) => vehicle.id === id)).toMatchObject({ currentAction:'Monitor Stock',version:saved.version })
    } finally {
      clearTimeout(timeout)
      await Promise.all(subscriptions.map(async subscription => {
        await subscription.client.removeChannel(subscription.channel)
        subscription.client.realtime.disconnect()
      }))
    }
  },30000)
  it('allows only one of two simultaneous edits at the same version', async () => {
    const current = await server!.from('vehicles').select('version').eq('id',id).single()
    expect(current.error).toBeNull()
    const responses = await Promise.all([write('Monitor Stock',current.data!.version),write('Marketing Push Planned',current.data!.version)])
    expect(responses.map(response => response.status).sort()).toEqual([200,409])
    const final = await server!.from('vehicles').select('version').eq('id',id).single()
    expect(final.data?.version).toBe(current.data!.version+1)
  })
})
```

The normal test command must skip this suite unless explicitly enabled. A missing explicit local configuration is a failure when live testing is requested, not a skipped success. The localhost/port guard must be updated deliberately if Task 2 selected alternate ports.

- [ ] **Step 2: Start isolated API and browser dev servers, preserving existing processes.**

Check 3006 and 5176 are unused; if they are occupied, inspect and select free ports, then update the command origins consistently. Use separate managed terminal sessions:

```sh
PORT=3006 FRONTEND_ORIGIN=http://127.0.0.1:5176 pnpm --filter @keyloop-interview/api dev
```

```sh
INVENTORY_API_ORIGIN=http://127.0.0.1:3006 pnpm --filter @keyloop-interview/web exec vite --host 127.0.0.1 --port 5176 --strictPort
```

Expected: both services listen on loopback. `/admin/inventory` loads the configured database records; its header reaches Live only after the subscribed snapshot is refreshed. `/admin/bookings` and `/` remain accessible. Do not terminate the existing preview on 5173 or 5175.

- [ ] **Step 3: Run the live suite without copying secrets into command text or output.**

```python
import json, os, subprocess
from urllib.parse import urlparse
status = json.loads(subprocess.check_output(['supabase','status','-o','json'],text=True,stderr=subprocess.DEVNULL))
target = urlparse(status['API_URL'])
assert target.hostname in ('localhost','127.0.0.1') and target.port == 55321
test_env = dict(os.environ)
test_env.update({
 'RUN_INVENTORY_LIVE':'1',
 'INVENTORY_TEST_URL':status['API_URL'],
 'INVENTORY_TEST_ANON_KEY':status['ANON_KEY'],
 'INVENTORY_TEST_SERVICE_ROLE_KEY':status['SERVICE_ROLE_KEY'],
 'INVENTORY_TEST_API_ORIGIN':'http://127.0.0.1:3006',
})
subprocess.run(['pnpm','--filter','@keyloop-interview/web','test','src/admin/inventory/inventory.live.test.ts'],env=test_env,check=True)
```

Expected: all live cases PASS and their random-ID row is removed. These are real PostgreSQL/HTTP/WebSocket checks, still distinct from React running in two browsers.

- [ ] **Step 4: Verify the actual dashboard in two browser contexts.**

Use the available browser tooling; inspect DOM/accessibility state for interactions, with screenshots only where needed for layout evidence. Open `http://127.0.0.1:5176/admin/inventory` in two separate contexts.

1. Both reach Live and display inventory from Supabase, with connection and last-refreshed labels.
2. In context A filter to Toyota and over-90-days stock, select an aging vehicle, and verify its details popover matches the row. Clear filters and verify global metrics did not change with table filtering.
3. Choose `KL-DEMO-008` or another actual aging sample. Save `Monitor Stock` with note `Reviewed in the live demo`. Context B must show the committed action without a manual page refresh. Reload B and confirm the action is still present.
4. Open that vehicle's dialog in both contexts before editing. Save a new note in A, then save the old draft in B. B must get 409, retain its draft, and require Load latest action before retrying. A WebSocket refresh must not silently update B's captured expected version.
5. Disable network in B, change the action in A, then restore B's network. B shows a stale/reconnecting state and fetches the latest action on resubscription without relying on replay of the missed event.
6. Insert a separately named fictional fixture directly in the designated local database, then observe both dashboards receive it without an HTTP mutation. Clear filters first. Its later deletion must also refresh the dashboards. This changes no existing vehicle:

```sql
BEGIN;
INSERT INTO public.vehicles(id,registration,make,model,model_year,price_pence,stocked_on)
VALUES ('ffffffff-ffff-4fff-8fff-000000000008','INV-DB-PROOF','Toyota','Owned SQL proof',2022,1000000,
        (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-120);
COMMIT;
SELECT pg_sleep(3);
BEGIN;
DELETE FROM public.vehicles
WHERE id='ffffffff-ffff-4fff-8fff-000000000008' AND registration='INV-DB-PROOF';
COMMIT;
```

Run the SQL in one `docker exec -i supabase_db_keyloop-inventory-local psql -U postgres -d postgres -v ON_ERROR_STOP=1` session. If interrupted after the insert, delete only this exact owned fixture with the final DELETE statement and verify cleanup. If its ID/registration already exists before the check, inspect it rather than overwrite it. No remote or real dealership table is a valid target.

- [ ] **Step 5: Verify database restart persistence and error recovery.**

While a saved demo action is visible, restart only the designated local PostgreSQL container:

```sh
docker restart supabase_db_keyloop-inventory-local
docker exec supabase_db_keyloop-inventory-local pg_isready -U postgres -d postgres
```

Expected: the action/note/version remain after the database is ready and clients reconnect/refetch. No reset, seed overwrite, container volume deletion, or `--no-backup` stop is allowed. If startup is still in progress, retry readiness briefly while keeping the user informed.

For a failed-save check, stop only this task's API dev session, enter a different draft in the browser, and submit. The form must retain its contents and show an error. Restart the same API session and retry. Check initial-load errors separately from the genuine empty-inventory and no-filter-match states.

- [ ] **Step 6: Verify accessible controls, narrow layouts, and existing routes.**

Check keyboard navigation through all filters and row actions, Escape dismissal and returned focus, labelled fields, visible aging text independent of color, and contained table scrolling at 390px and 320px widths. Open `/admin/bookings`, exercise its Day/List switch and Resources/Opening hours dialogs, and verify only Bookings is active. Open Inventory and verify only Inventory is active; then open `/` and verify the component library still renders. Returning to Bookings may reset its fictional data, consistent with existing session-only storage.

Record only observed outcomes in `exports/inventory-browser-checks.json`. Use this shape with actual booleans/results and an actual timestamp produced during execution; omit any item not run rather than filling it with an assumed PASS:

```ts
interface InventoryEvidence {
  checkedAt: string
  origin: string
  supabaseProject: string
  checks: { name: string; result: 'passed' | 'failed' | 'not-run'; detail: string }[]
}
```

- [ ] **Step 7: Run final checks and make the final scoped commit.**

```sh
pnpm --filter @keyloop-interview/web test
pnpm --filter @keyloop-interview/api test
pnpm --filter @keyloop-interview/api test:e2e
pnpm typecheck
pnpm build
pnpm test
pnpm lint
git diff --check
git status --short
```

Expected: PASS for relevant checks, with live tests separately executed in Step 3. If a baseline check remains broken, identify it precisely rather than claiming the workspace is clean. Stage the new live test, observed evidence file, and reviewed tracked documentation updates only; commit `test(inventory): verify local persistence and realtime delivery`.

Deliver the actual preview URL, actual test results, and persistence/WebSocket evidence separately. Report any remaining live check as pending. Stop only task-owned preview processes if they are no longer needed; preserve the user-visible preview and local database with its saved demo actions. Never remove other projects, containers, volumes, or untracked files.

## Plan self-review and coverage

| Design requirement | Implementing tasks |
| --- | --- |
| Existing admin navigation/layout, shared controls, booking preservation | 1, 6, 8 |
| Filterable all-vehicle inventory and global metrics | 4, 6 |
| Strict 90/91-day boundary, dealership-local dates/midnight refresh | 2, 3, 4, 5 |
| Persisted current action/note/timestamp and no history | 2, 3, 6, 8 |
| Atomic conflict prevention, retained drafts, explicit review | 2, 3, 6, 8 |
| WebSocket database-originated updates, reconnect gap recovery, stale warnings | 2, 5, 6, 8 |
| Browser read-only access, server-only write key, loopback-only demo | 2, 3, 4, 7, 8 |
| Empty/error states, focus, keyboard, narrow layout | 1, 5, 6, 8 |
| Idempotent seed and persistence across service restart | 2, 7, 8 |
| Existing dirty-work boundaries and scoped changes | Baseline rules and every commit step |

Before handoff, check that every named import/file/function is defined here or exists in the inspected source; that action field names and versions match SQL/API/browser layers; that plan code fences balance; and that no incomplete implementation instructions remain. Fix inconsistencies in this document before offering execution. This plan is a proposal for implementation, not evidence that its application tests or live checks have run.

Planning validation performed: all Python snippets parse, 28 standalone TypeScript/TSX code blocks parse, and the guarded CSS/Select/date/Sidebar extraction scripts run successfully against temporary copies of the latest admin files while retaining its Tabs, Motion header, handlers, and booking-only modals. This was syntax/plan validation only; no application typecheck, application test suite, database migration, or live Supabase/browser check was executed. A temporary npm-cached TypeScript parser was used without adding a workspace dependency.

## Primary references checked while planning

- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [JavaScript subscription lifecycle](https://supabase.com/docs/reference/javascript/subscribe)
- [Local CLI configuration](https://supabase.com/docs/guides/local-development/cli/config)
- [Supabase seed behavior](https://supabase.com/docs/guides/local-development/seeding-your-database)
- Local CLI help for `supabase start` and `supabase migration up`; no hosted project was selected or changed.

## Execution record — 2026-10-21

Implemented inline on `codex/inventory-dashboard` after the user selected option 2. All eight feature tasks are implemented in the working checkout; the step checkboxes above retain the original proposed sequence, including commit and audit steps that were not all performed verbatim. This execution record and `exports/inventory-browser-checks.json` are the acceptance record.

- Shared admin shell, labelled Select and dealer-date helper extracted while preserving concurrent sidebar/rail/logo/calendar changes and existing booking interactions. Inventory route, filtering, aging, details, current action/note persistence, conflicts, loading/error/empty states, and realtime lifecycle are implemented.
- Local Supabase auth infrastructure is enabled because this CLI version otherwise omits the standard anonymous/service-role keys. There is no staff login UI. Anonymous access is SELECT-only; server-only RPC writes are version-checked in PostgreSQL. Actual environment files are ignored with mode 0600; example files contain no keys.
- Added explicit browser offline/online recovery after a failing regression demonstrated stale state did not automatically recover on network restoration. The regression now passes; an actual offline save retained its draft and the page returned to Live after restoration.
- `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm lint` and API HTTP tests pass. Web: 67 passed, 3 opt-in tests skipped in normal runs; API: 18 unit + 4 HTTP passed. All 3 opt-in real-service tests passed separately. SQL assertions pass. No owned temporary fixture remains (24 vehicles).
- Browser proof covers composed filters, 90/91-day boundary, two-tab committed action delivery, retained conflict draft and explicit latest-action loading, SQL-originated insert/delete in both tabs, failed-save draft retention, online recovery, database restart persistence, 390/320px containment, booking List/Resources/Opening hours and the root showcase. Full keyboard-only/screen-reader audit was not performed.
- Running preview: `http://127.0.0.1:5176/admin/inventory`; task API: loopback port 3006; local project: `keyloop-inventory-local`. Preview and database remain available. Other previews were preserved.
- Source and documentation self-review completed inline; no subagent review was used. No deployment, production data/feed, login, action history or vehicle CRUD was added.
- Pre-existing untracked app/manifests/lockfile/README files remain outside scoped staging, as required by the baseline rule. New inventory-owned source/tests/SQL and tracked inventory documentation can be committed, but that commit alone does not establish a runnable repository baseline. Shared files with concurrent work also remain unstaged. No unrelated appointment changes were staged.

Screenshots: `exports/inventory-dashboard.png`, `exports/inventory-mobile.png`. Detailed observed evidence: `exports/inventory-browser-checks.json`. Local auth/network overrides were restored and temporary browser tabs closed.
