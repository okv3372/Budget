import { ALL_CATEGORIES, type Category, type Rule, type RuleConditionType, type Transaction } from '../shared/types.js';

function makeRule(
  id: string,
  priority: number,
  conditionType: RuleConditionType,
  conditionValue: string,
  targetCategory: Category,
  setExcluded = false
): Rule {
  return {
    id,
    priority,
    enabled: true,
    condition_type: conditionType,
    condition_value: conditionValue,
    target_category: targetCategory,
    set_excluded: setExcluded
  };
}

export function buildStarterRules(): Rule[] {
  const rules: Rule[] = [
    makeRule('starter-desc-aldi', 1, 'description_contains', 'ALDI', 'Groceries'),
    makeRule('starter-desc-tops', 2, 'description_contains', 'TOPS MARKETS', 'Groceries'),
    makeRule('starter-desc-wegmans', 3, 'description_contains', 'WEGMANS', 'Groceries'),
    makeRule('starter-desc-target', 4, 'description_contains', 'TARGET', 'Groceries'),
    makeRule('starter-desc-walmart', 5, 'description_contains', 'WAL-MART', 'Groceries'),
    makeRule('starter-desc-gas-bjs', 6, 'description_contains', "BJ'S FUEL", 'Gas'),
    makeRule('starter-desc-gas-speedway', 7, 'description_contains', 'SPEEDWAY', 'Gas'),
    makeRule('starter-desc-gas-sunoco', 8, 'description_contains', 'SUNOCO', 'Gas'),
    makeRule('starter-desc-utilities-fuel', 9, 'description_contains', "NAT'L FUEL", 'Utilities'),
    makeRule('starter-desc-utilities-ngrid', 10, 'description_contains', 'NGRID', 'Utilities'),
    makeRule('starter-desc-payroll', 11, 'description_contains', 'PAYROLL', 'Income'),
    makeRule('starter-desc-direct-deposit', 12, 'description_contains', 'DIRECT DEPOSIT', 'Income'),
    makeRule('starter-desc-subscription-fitness', 13, 'description_contains', 'CATALYST FITNESS', 'Subscriptions'),
    makeRule('starter-desc-restaurants-subway', 14, 'description_contains', 'SUBWAY', 'Restaurants'),
    makeRule('starter-desc-restaurants-hortons', 15, 'description_contains', 'TIM HORTONS', 'Restaurants'),

    makeRule('starter-discover-supermarkets', 16, 'discover_category_equals', 'Supermarkets', 'Groceries'),
    makeRule('starter-discover-gasoline', 17, 'discover_category_equals', 'Gasoline', 'Gas'),
    makeRule('starter-discover-restaurants', 18, 'discover_category_equals', 'Restaurants', 'Restaurants'),
    makeRule('starter-discover-entertainment', 19, 'discover_category_equals', 'Travel/ Entertainment', 'Entertainment'),
    makeRule('starter-discover-services', 20, 'discover_category_equals', 'Services', 'Other'),
    makeRule('starter-discover-merchandise', 21, 'discover_category_equals', 'Merchandise', 'Other'),
    makeRule('starter-discover-home', 22, 'discover_category_equals', 'Home Improvement', 'Other'),
    makeRule('starter-discover-education', 23, 'discover_category_equals', 'Education', 'Other')
  ];

  return rules;
}

export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

function isValidCategory(category: string): category is Category {
  return (ALL_CATEGORIES as readonly string[]).includes(category);
}

export function applyRulesToTransaction(transaction: Transaction, rules: Rule[]): Transaction {
  let next = { ...transaction };

  for (const rule of sortRules(rules)) {
    if (!rule.enabled) {
      continue;
    }

    const conditionValue = rule.condition_value.trim();
    if (!conditionValue) {
      continue;
    }

    let matched = false;

    if (rule.condition_type === 'description_contains') {
      matched = next.description.toLowerCase().includes(conditionValue.toLowerCase());
    } else if (rule.condition_type === 'discover_category_equals') {
      matched =
        next.source === 'discover' &&
        next.discover_original_category.toLowerCase() === conditionValue.toLowerCase();
    }

    if (matched && isValidCategory(rule.target_category)) {
      next = {
        ...next,
        category: rule.target_category,
        excluded: rule.set_excluded ? true : next.excluded
      };
      break;
    }
  }

  return next;
}
