import type { RunPlan } from './types';

const KEY = 'topopace_plans';

function loadAll(): RunPlan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveAll(plans: RunPlan[]): void {
  localStorage.setItem(KEY, JSON.stringify(plans));
}

export const PlanStore = {
  list(): RunPlan[] {
    return loadAll();
  },

  get(id: string): RunPlan | undefined {
    return loadAll().find(p => p.id === id);
  },

  save(plan: RunPlan): void {
    const plans = loadAll();
    const idx = plans.findIndex(p => p.id === plan.id);
    if (idx >= 0) plans[idx] = plan;
    else plans.push(plan);
    saveAll(plans);
  },

  delete(id: string): void {
    saveAll(loadAll().filter(p => p.id !== id));
  },
};
