# Budget Ledger (Desktop Mac App)

Budget Ledger is a local-first desktop budgeting app built with Electron + React + TypeScript.

It imports bank CSV files from two different providers (Citizens and Discover), normalizes them into one unified ledger, auto-categorizes transactions using user-defined rules, and provides a weekly budget + trend dashboard.

## Core Features

- Mac desktop app (`.app` / `.dmg`) with no backend and no cloud sync
- CSV import via drag/drop or file picker
- Source detection for:
  - Citizens CSV: `Transaction Type, Date, Account Type, Description, Amount, ...`
  - Discover CSV: `Trans. Date, Post Date, Description, Amount, Category`
- Unified transaction ledger with normalized amount semantics:
  - Spending = negative
  - Income/refunds = positive
- Incremental imports:
  - Uses latest imported date cutoff
  - Imports newer rows
  - On boundary date, deduplicates using source row hash
- Rule-based auto categorization with priority ordering
- Manual single-row category changes and description edits
- Soft delete + undo recovery
- Exclude/include toggles for dashboard filtering
- One-page classify workflow with separate Citizens and Discover sections
- Weekly budget tracker + weekly net savings target
- Weekly and monthly trend charts
- 90-day category distribution chart
- Recurring subscription detection suggestions
- CSV exports for transactions and dashboard summaries

## Categories

Default user categories:

- `Groceries`
- `Restaurants`
- `Gas`
- `Rent`
- `Utilities`
- `Subscriptions`
- `Income`
- `Entertainment`
- `Other`

System categories:

- `Uncategorized`
- `Transfer`

## High-Level Architecture

- **Electron Main Process** (`src/main/*`)
  - Owns filesystem access, CSV parsing, rules, imports, analytics, and export logic
  - Exposes typed IPC handlers
- **Electron Preload** (`src/main/preload.ts`)
  - Exposes a restricted `window.budgetApi` interface to the renderer
- **React Renderer** (`src/renderer/*`)
  - UI only (import/classify, rules, transactions, dashboard)
- **Shared Contracts** (`src/shared/types.ts`)
  - Shared TypeScript interfaces and constants

## Project Structure

```text
.
├── src
│   ├── main
│   │   ├── main.ts              # Electron app bootstrap + IPC registration
│   │   ├── preload.ts           # contextBridge API surface
│   │   ├── service.ts           # application service layer
│   │   ├── store.ts             # CSV persistence abstraction
│   │   ├── importer.ts          # source detection + normalization + incremental import
│   │   ├── rules.ts             # rule engine + starter rules
│   │   ├── metrics.ts           # dashboard aggregations + subscription detection
│   │   ├── csv.ts               # CSV parser/stringifier helpers
│   │   ├── utils.ts             # date/math/string utilities
│   │   └── constants.ts         # app paths + schema headers
│   ├── renderer
│   │   ├── App.tsx              # app shell, nav, and orchestration
│   │   ├── main.tsx             # renderer entry
│   │   ├── styles.css           # visual system and responsive layout
│   │   ├── format.ts            # date/currency formatting helpers
│   │   ├── components
│   │   │   ├── LineChart.tsx    # lightweight SVG line chart
│   │   │   └── DonutChart.tsx   # lightweight SVG donut chart
│   │   └── pages
│   │       ├── ImportClassifyPage.tsx
│   │       ├── RulesPage.tsx
│   │       ├── TransactionsPage.tsx
│   │       └── DashboardPage.tsx
│   └── shared
│       └── types.ts             # shared interfaces and constants
├── tests
│   ├── csv.test.ts
│   ├── importer.test.ts
│   ├── rules.test.ts
│   └── metrics.test.ts
├── transactions                 # sample source CSV files used for development
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── vite.config.ts
└── index.html
```

## Local Data Storage

By default, the app writes to:

- `~/Documents/BudgetApp/data/transactions_master.csv`
- `~/Documents/BudgetApp/data/rules.csv`
- `~/Documents/BudgetApp/data/category_budgets_weekly.csv`
- `~/Documents/BudgetApp/data/settings.csv`
- `~/Documents/BudgetApp/imports/citizens/*.csv`
- `~/Documents/BudgetApp/imports/discover/*.csv`
- `~/Documents/BudgetApp/exports/*.csv`

### Test Override

Tests set `BUDGET_APP_ROOT` to a temporary directory so production data is never touched.

## Unified Transaction Schema

`transactions_master.csv` columns:

- `id`
- `source` (`citizens` | `discover`)
- `source_file`
- `source_row_hash`
- `date` (`YYYY-MM-DD`)
- `description`
- `amount` (normalized numeric)
- `category`
- `discover_original_category`
- `excluded` (`true`/`false`)
- `deleted` (`true`/`false`)
- `delete_reason`
- `notes`
- `created_at`
- `updated_at`

## Import and Normalization Rules

### Source Detection

The importer checks CSV headers:

- **Citizens format** if headers include: `Transaction Type`, `Date`, `Description`, `Amount`
- **Discover format** if headers include: `Trans. Date`, `Description`, `Amount`, `Category`

Unsupported headers are skipped with warnings.

### Amount Normalization

- Citizens amount is used directly (debits typically already negative)
- Discover amount is inverted:
  - charges (positive in source) -> negative spend
  - payments/credits (negative in source) -> positive

### Incremental Logic

For each import run:

1. Load existing ledger
2. Determine latest transaction date
3. Import rows with date newer than latest date
4. For rows on latest date, import only unseen `source_row_hash` values
5. Skip older rows

## Rule Engine

Rule file: `rules.csv`

Rule fields:

- `id`
- `priority` (lower number executes first)
- `enabled`
- `condition_type`
  - `description_contains`
  - `discover_category_equals`
- `condition_value`
- `target_category`
- `set_excluded`

Matching behavior:

- Rules run in priority order
- First match wins
- Description matching is case-insensitive
- Discover category rules only apply to Discover transactions

## Dashboard Calculations

- Week starts on Monday
- Weekly metrics are calculated from non-deleted, non-excluded rows
- Weekly net = `weeklyIncome + weeklyExpenses` (expenses are negative)
- Weekly category budget table compares actual spend vs category limit
- Weekly savings delta = `weeklyNet - weekly_net_savings_target`
- Trends:
  - 12-week net trend
  - 12-month net trend
- Distribution:
  - 90-day spending distribution by category

## Subscription Detection

The app suggests recurring subscriptions by grouping merchants and checking:

- at least 3 expense transactions
- average interval roughly monthly
- low interval variance
- low amount variance

Suggested rows can be one-click categorized as `Subscriptions`.

## IPC API Surface

Exposed via `window.budgetApi`:

- `importCsvFiles(files[])`
- `getTransactions(filters)`
- `updateTransaction({id, category?, description?, excluded?, notes?})`
- `softDeleteTransaction({id, reason?})`
- `undoDeleteTransaction({id})`
- `getRules()`
- `createRule(rule)`
- `updateRule(rule)`
- `reorderRules({orderedIds})`
- `runRules(scope)`
- `getBudgets()`
- `setBudget(category, weeklyLimit)`
- `getSettings()`
- `updateSettings(settings)`
- `getDashboardMetrics(range?)`
- `exportTransactionsCsv(filters?)`
- `exportDashboardSummaryCsv(range?)`
- `applySubscriptionSuggestion(merchantKey)`

## Getting Started

### Prerequisites

- macOS
- Node.js 22+
- npm 10+

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

This starts:

- Vite renderer dev server
- TypeScript watch build for Electron main/preload
- Electron app window

### Build Production Artifacts

```bash
npm run build
```

Build outputs:

- Renderer: `dist/renderer`
- Main/preload: `dist-electron`

### Package macOS App (.app + .dmg)

```bash
npm run package:mac
```

Outputs are generated in `release/`.

## Tests

Run all tests:

```bash
npm test
```

Current coverage areas:

- CSV parsing/stringifying
- Incremental import behavior
- Discover amount normalization
- Rule priority and matching behavior
- Dashboard budget/net calculations

## Usage Workflow

1. Open **Import + Classify**
2. Drag in one or more CSV files from Citizens and/or Discover
3. Review **Needs Review** section
   - assign categories
   - include/exclude rows as needed
   - soft delete irrelevant rows
4. Open **Rules**
   - add and reorder rules
   - map Discover categories to app categories
5. Open **Dashboard**
   - set weekly category budgets
   - set weekly net savings target
   - inspect over-budget categories and trends
6. Open **Transactions**
   - filter history
   - update category/description
   - soft delete/undo
   - export CSV

## Important Notes

- This is local-only; no cloud backup or sync is included.
- Packaging is unsigned by default, so macOS Gatekeeper may show warnings on first open.
- CSV files are source-of-truth for persistence.
- Manual description edits are allowed; date/amount remain immutable for consistency.

## Troubleshooting

### Electron window does not open in dev

- Ensure `npm install` succeeded
- Re-run `npm run dev`
- Confirm no stale process is occupying port `5173`

### No data appears after import

- Verify CSV headers match supported Citizens/Discover formats
- Check the status message bar for import warnings
- Inspect `~/Documents/BudgetApp/imports/` to confirm files were captured

### Duplicate or missing recent rows

- Incremental import intentionally uses latest-date cutoff + boundary hash dedupe
- If source exports change historical row order/shape, re-import behavior may vary
- Use full export review in Transactions page to inspect imported rows

### Reset all app data

Delete `~/Documents/BudgetApp` and restart the app.
