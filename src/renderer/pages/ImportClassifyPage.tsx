import { useMemo, useState } from 'react';
import { type Category, type ImportCsvResult, type Transaction } from '../../shared/types';
import { formatDate, formatMoney } from '../format';

interface ImportClassifyPageProps {
  transactions: Transaction[];
  categories: Category[];
  busy: boolean;
  onImportFiles: (files: File[]) => Promise<ImportCsvResult | null>;
  onUpdateCategory: (id: string, category: Category) => Promise<void>;
  onUpdateDescription: (id: string, description: string) => Promise<void>;
  onSetExcluded: (id: string, excluded: boolean) => Promise<void>;
  onSoftDelete: (id: string, reason: string) => Promise<void>;
  onRunRules: (scope: 'uncategorized' | 'all') => Promise<number>;
}

interface TxTableProps {
  title: string;
  rows: Transaction[];
  categories: Category[];
  onUpdateCategory: (id: string, category: Category) => Promise<void>;
  onUpdateDescription: (id: string, description: string) => Promise<void>;
  onSetExcluded: (id: string, excluded: boolean) => Promise<void>;
  onSoftDelete: (id: string, reason: string) => Promise<void>;
}

function TransactionTable({
  title,
  rows,
  categories,
  onUpdateCategory,
  onUpdateDescription,
  onSetExcluded,
  onSoftDelete
}: TxTableProps) {
  const [draftDescriptions, setDraftDescriptions] = useState<Record<string, string>>({});

  return (
    <section className="panel">
      <header className="panel-header">
        <h3>{title}</h3>
        <span>{rows.length} transactions</span>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 250).map((tx) => {
              const draft = draftDescriptions[tx.id] ?? tx.description;

              return (
                <tr key={tx.id}>
                  <td>{formatDate(tx.date)}</td>
                  <td>
                    <input
                      value={draft}
                      onChange={(event) =>
                        setDraftDescriptions((current) => ({
                          ...current,
                          [tx.id]: event.target.value
                        }))
                      }
                      onBlur={() => {
                        if (draft !== tx.description) {
                          void onUpdateDescription(tx.id, draft.trim());
                        }
                      }}
                    />
                  </td>
                  <td className={tx.amount < 0 ? 'neg' : 'pos'}>{formatMoney(tx.amount)}</td>
                  <td>
                    <select value={tx.category} onChange={(event) => void onUpdateCategory(tx.id, event.target.value as Category)}>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="status-stack">{tx.excluded ? <span className="chip chip-muted">Excluded</span> : null}</div>
                  </td>
                  <td>
                    <div className="actions-row">
                      <button className="ghost" onClick={() => void onSetExcluded(tx.id, !tx.excluded)}>
                        {tx.excluded ? 'Include' : 'Exclude'}
                      </button>
                      <button className="ghost danger" onClick={() => void onSoftDelete(tx.id, 'Removed during classify')}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ImportClassifyPage({
  transactions,
  categories,
  busy,
  onImportFiles,
  onUpdateCategory,
  onUpdateDescription,
  onSetExcluded,
  onSoftDelete,
  onRunRules
}: ImportClassifyPageProps) {
  const [dragOver, setDragOver] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportCsvResult | null>(null);

  const active = useMemo(() => transactions.filter((tx) => !tx.deleted), [transactions]);

  const needsReview = useMemo(() => active.filter((tx) => tx.category === 'Uncategorized'), [active]);

  const citizens = useMemo(() => active.filter((tx) => tx.source === 'citizens'), [active]);
  const discover = useMemo(() => active.filter((tx) => tx.source === 'discover'), [active]);

  async function handleImport(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const result = await onImportFiles(Array.from(fileList));
    if (result) {
      setImportSummary(result);
    }
  }

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <h2>Import + Classify</h2>
          <p>
            Drop Citizens and Discover CSV files here. New rows are imported incrementally and auto-categorized by your
            rule priority.
          </p>
        </div>
        <div className="hero-actions">
          <label className="button">
            Import CSV Files
            <input type="file" accept=".csv,text/csv" multiple onChange={(event) => void handleImport(event.target.files)} hidden />
          </label>
          <button className="ghost" onClick={() => void onRunRules('uncategorized')} disabled={busy}>
            Re-run Rules (Uncategorized)
          </button>
          <button className="ghost" onClick={() => void onRunRules('all')} disabled={busy}>
            Re-run Rules (All)
          </button>
        </div>
      </section>

      <section
        className={`drop-zone ${dragOver ? 'active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleImport(event.dataTransfer.files);
        }}
      >
        <strong>Drag and drop CSV files</strong>
        <span>Supports mixed Citizens + Discover imports.</span>
      </section>

      {importSummary ? (
        <section className="summary-banner">
          <strong>Import Result</strong>
          <span>
            Imported {importSummary.importedCount} rows, skipped {importSummary.skippedCount} duplicate rows.
          </span>
          <span>
            Citizens parsed: {importSummary.sourceBreakdown.citizens} · Discover parsed: {importSummary.sourceBreakdown.discover}
          </span>
          {importSummary.warnings.length > 0 ? <em>{importSummary.warnings.length} warnings. Check source row formats.</em> : null}
        </section>
      ) : null}

      <TransactionTable
        title="Needs Review"
        rows={needsReview}
        categories={categories}
        onUpdateCategory={onUpdateCategory}
        onUpdateDescription={onUpdateDescription}
        onSetExcluded={onSetExcluded}
        onSoftDelete={onSoftDelete}
      />

      <TransactionTable
        title="Citizens Transactions"
        rows={citizens}
        categories={categories}
        onUpdateCategory={onUpdateCategory}
        onUpdateDescription={onUpdateDescription}
        onSetExcluded={onSetExcluded}
        onSoftDelete={onSoftDelete}
      />

      <TransactionTable
        title="Discover Transactions"
        rows={discover}
        categories={categories}
        onUpdateCategory={onUpdateCategory}
        onUpdateDescription={onUpdateDescription}
        onSetExcluded={onSetExcluded}
        onSoftDelete={onSoftDelete}
      />
    </div>
  );
}
