import { Preferences } from '@capacitor/preferences';

export interface Record {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  note: string;
  date: string;    // YYYY-MM-DD
  month: string;   // YYYY-MM
}

export interface AppData {
  monthlyBudget: number;
  records: Record[];
}

const STORAGE_KEY = 'pigbaby_data';

export async function loadData(): Promise<AppData> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) {
    return { monthlyBudget: 3000, records: [] };
  }
  return JSON.parse(value) as AppData;
}

export async function saveData(data: AppData): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(data) });
}

export async function exportData(): Promise<void> {
  const data = await loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pigbaby-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
