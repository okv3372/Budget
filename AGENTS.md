# AGENTS.md

This file is for engineers and coding agents working on this repository.

It describes project intent, architecture boundaries, implementation contracts, and safe extension patterns.

## Mission

Build and maintain a local-first macOS desktop budgeting tool that:

- imports Citizens and Discover CSVs
- normalizes all rows into one unified transaction ledger
- supports rule-driven + manual categorization
- provides weekly budget and trend analytics
- persists everything to local CSV files

## Product Guarantees

These are intentional guarantees and should not be broken casually:

1. **Local-first storage**
   - No backend is required for core functionality.
2. **CSV persistence**
   - Main app state is persisted in CSV files on the local filesystem.
3. **Incremental import behavior**
   - Uses latest-date cutoff + boundary-date dedupe via source hash.
4. **Normalized amount semantics**
   - Spending is always negative.
   - Income/refunds are always positive.
5. **Soft delete only**
   - Deletion is recoverable through undo.

## Repository Map

```text
src/main
  constants.ts  # paths, file names, CSV headers
  csv.ts        # CSV parse/stringify utilities
  importer.ts   # format detection, row normalization, incremental merge
  main.ts       # Electron bootstrap and IPC handlers
  metrics.ts    # dashboard aggregation and subscription suggestion logic
  preload.ts    # window.budgetApi bridge
  rules.ts      # rule engine
  service.ts    # orchestrates all domain operations
  store.ts      # file-backed CSV persistence
  utils.ts      # date/hash/number/string helpers

src/renderer
  App.tsx       # top-level shell + state orchestration
  styles.css    # design system / layout / table styles
  pages/*       # user-facing views
  components/*  # charting primitives
  format.ts     # renderer formatting helpers

src/shared
  types.ts      # all shared contracts and API signatures

tests
  csv.test.ts
  importer.test.ts
  rules.test.ts
  metrics.test.ts
```

## Data Layout and Contracts

Default root:

- `~/Documents/BudgetApp`

Files:

- `data/transactions_master.csv`
- `data/rules.csv`
- `data/category_budgets_weekly.csv`
- `data/settings.csv`
- `imports/citizens/*.csv`
- `imports/discover/*.csv`
- `exports/*.csv`

Environment override for tests:

- `BUDGET_APP_ROOT`

### Transaction Contract (Important)

`Transaction.amount` meaning is normalized and must remain stable:

- `< 0`: spending
- `> 0`: income/refund/payment credit

Do not introduce source-specific amount semantics into renderer calculations.

## Import Pipeline Rules

When changing importer behavior:

1. Keep source header detection explicit and strict.
2. Preserve date normalization to ISO (`YYYY-MM-DD`).
3. Keep incremental strategy deterministic:
   - newer than latest date => import
   - equal latest date => hash dedupe
   - older => skip
4. Keep import warnings human-readable per file/row.

If you expand to additional institutions, prefer adding a new explicit parser branch instead of fuzzy heuristics.

## Rule Engine Rules

- Rule priority order is authoritative.
- First match wins.
- Description matching is case-insensitive substring.
- Discover category rule is exact match against original Discover category field.
- Re-run scopes:
  - `uncategorized`: apply only to uncategorized rows
  - `all`: reset category candidate to uncategorized and re-evaluate all non-deleted rows

When adding new rule types, update:

- `src/shared/types.ts`
- `src/main/rules.ts`
- `src/renderer/pages/RulesPage.tsx`
- tests

## Dashboard Logic Rules

- Monday is the start of week.
- Deleted and excluded rows are omitted from dashboard aggregates.
- Weekly net = income + expenses (expenses negative).
- Budget overrun checks apply to spend categories (not income alerting logic).
- Weekly savings target is compared to weekly net.

If changing aggregation windows, update README and tests.

## UI/UX Constraints

- Keep the one-page classify workflow with sections:
  - Needs Review
  - Citizens transactions
  - Discover transactions
- Maintain lightweight table interactions for fast bulk review.
- Keep desktop-first responsiveness (window can be resized).
- Preserve accessibility basics:
  - visible labels
  - keyboard-focusable actions
  - high-contrast text states

## IPC and Security Boundaries

- Renderer must use `window.budgetApi` only.
- Node integration in renderer should stay disabled.
- Expose only typed, explicit IPC handlers.
- Avoid exposing raw filesystem functions directly to renderer.

When adding a new feature:

1. Add shared types in `src/shared/types.ts`
2. Add service method in `src/main/service.ts`
3. Register IPC in `src/main/main.ts`
4. Expose preload bridge method in `src/main/preload.ts`
5. Use it from renderer

## Dev Workflow

Install:

```bash
npm install
```

Development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Tests:

```bash
npm test
```

Package mac app:

```bash
npm run package:mac
```

## Testing Expectations

Before finalizing meaningful logic changes, run:

- `npm test`
- `npm run build`

If importer/rules/metrics logic changed, add or update targeted tests.

## Common Extension Patterns

### Add a new source CSV parser

- Add source-specific parser function in `importer.ts`
- Extend source union in shared types
- Add header detection branch
- Include source in sectioned classify view if required
- Add fixture-style tests

### Add new dashboard metric

- Implement in `metrics.ts`
- Extend shared metric type
- Render in `DashboardPage.tsx`
- Export metric in dashboard CSV if relevant
- Add test assertions in `metrics.test.ts`

### Add a new row action

- Add service method and IPC handler
- Wire UI action button
- Ensure persistence writes through `store.ts`

## Known Limitations

- No cloud sync, auth, or collaboration
- CSV parser is custom and intentionally lightweight
- Packaging is unsigned by default (Gatekeeper warning expected)
- Very large CSVs may require pagination/virtualization improvements later

## Do Not Break

- `transactions_master.csv` column order and field names
- `window.budgetApi` existing method names/signatures
- normalized amount sign behavior
- soft delete recoverability
