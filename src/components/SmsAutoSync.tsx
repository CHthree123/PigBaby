import { useEffect, useRef } from 'react';
import { Preferences } from '@capacitor/preferences';
import type { Transaction } from '../storage';
import { SmsReader, buildTransactions, isNative } from '../smsAuto';

const ENABLE_KEY = 'pigbaby_sms_auto';

interface Props {
  records: Transaction[];
  onImported: (transactions: Transaction[], added: number) => Promise<void>;
}

// Invisible engine: while SMS auto-accounting is enabled, polls the native
// queue every 10s (captures SMS received while the app was closed). Stays
// mounted on the accounting page; the settings UI lives in the Profile page.
export default function SmsAutoSync({ records, onImported }: Props) {
  const recordsRef = useRef(records);
  useEffect(() => { recordsRef.current = records; }, [records]);
  const onImportedRef = useRef(onImported);
  useEffect(() => { onImportedRef.current = onImported; }, [onImported]);

  useEffect(() => {
    if (!isNative) return;
    let stopped = false;
    const pull = async () => {
      if (stopped) return;
      try {
        const { value } = await Preferences.get({ key: ENABLE_KEY });
        if (value !== '1') return;
        const { records: pending } = await SmsReader.syncPending();
        if (pending.length > 0) {
          const { transactions, added } = buildTransactions(pending, recordsRef.current);
          if (added > 0) await onImportedRef.current(transactions, added);
        }
      } catch {
        // transient native error: keep polling
      }
    };
    pull();
    const timer = setInterval(pull, 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  return null;
}
