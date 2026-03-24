import { useEffect, useMemo, useState } from 'react';
import { type Category, type Rule } from '../../shared/types';

interface RulesPageProps {
  categories: Category[];
  rules: Rule[];
  onCreateRule: (input: Omit<Rule, 'id' | 'priority'>) => Promise<void>;
  onUpdateRule: (rule: Rule) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  onReorderRules: (orderedIds: string[]) => Promise<void>;
}

const conditionLabels: Record<Rule['condition_type'], string> = {
  description_contains: 'Description contains',
  discover_category_equals: 'Discover category equals'
};

export function RulesPage({
  categories,
  rules,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onReorderRules
}: RulesPageProps) {
  const [conditionType, setConditionType] = useState<Rule['condition_type']>('description_contains');
  const [conditionValue, setConditionValue] = useState('');
  const [targetCategory, setTargetCategory] = useState<Category>('Uncategorized');
  const [setExcluded, setSetExcluded] = useState(false);

  const ordered = useMemo(() => [...rules].sort((a, b) => a.priority - b.priority), [rules]);
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.localeCompare(b)), [categories]);

  useEffect(() => {
    if (sortedCategories.length === 0) {
      return;
    }

    const exists = sortedCategories.some((category) => category.toLowerCase() === targetCategory.toLowerCase());
    if (!exists) {
      setTargetCategory(sortedCategories[0]);
    }
  }, [sortedCategories, targetCategory]);

  async function handleMove(ruleId: string, direction: -1 | 1): Promise<void> {
    const index = ordered.findIndex((rule) => rule.id === ruleId);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) {
      return;
    }

    const copy = [...ordered];
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    await onReorderRules(copy.map((rule) => rule.id));
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <header className="panel-header">
          <h3>Create Rule</h3>
        </header>

        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = conditionValue.trim();
            if (!trimmed) {
              return;
            }

            void onCreateRule({
              enabled: true,
              condition_type: conditionType,
              condition_value: trimmed,
              target_category: targetCategory,
              set_excluded: setExcluded
            });

            setConditionValue('');
            setSetExcluded(false);
          }}
        >
          <label>
            Condition Type
            <select value={conditionType} onChange={(event) => setConditionType(event.target.value as Rule['condition_type'])}>
              <option value="description_contains">Description contains</option>
              <option value="discover_category_equals">Discover category equals</option>
            </select>
          </label>

          <label>
            Condition Value
            <input
              type="text"
              value={conditionValue}
              placeholder={conditionType === 'description_contains' ? 'ALDI' : 'Gasoline'}
              onChange={(event) => setConditionValue(event.target.value)}
            />
          </label>

          <label>
            Target Category
            <select value={targetCategory} onChange={(event) => setTargetCategory(event.target.value as Category)}>
              {sortedCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-checkbox">
            <input type="checkbox" checked={setExcluded} onChange={(event) => setSetExcluded(event.target.checked)} />
            Mark matched transactions as excluded
          </label>

          <button className="button" type="submit">
            Add Rule
          </button>
        </form>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Rule Priority</h3>
          <span>First match wins</span>
        </header>

        <div className="rules-list">
          {ordered.map((rule, index) => (
            <article key={rule.id} className="rule-item">
              <div className="rule-main">
                <strong>#{index + 1}</strong>
                <div>
                  <p>
                    {conditionLabels[rule.condition_type]}: <b>{rule.condition_value}</b>
                  </p>
                  <small>
                    Category: <b>{rule.target_category}</b> {rule.set_excluded ? '· Exclude matches' : ''}
                  </small>
                </div>
              </div>

              <div className="rule-controls">
                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => void onUpdateRule({ ...rule, enabled: event.target.checked })}
                  />
                  Enabled
                </label>

                <button className="ghost" onClick={() => void handleMove(rule.id, -1)}>
                  Move Up
                </button>
                <button className="ghost" onClick={() => void handleMove(rule.id, 1)}>
                  Move Down
                </button>
                <button className="ghost danger" onClick={() => void onDeleteRule(rule.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Rule Types</h3>
        </header>
        <div className="split">
          <div>
            <h4>Description Rules</h4>
            <p>Keyword matching on merchant text. Case-insensitive.</p>
          </div>
          <div>
            <h4>Discover Category Rules</h4>
            <p>Map Discover source categories (like Gasoline, Supermarkets) to your app categories.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
