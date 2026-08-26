import { LocalNotifications } from '@capacitor/local-notifications';
import type { Task } from './storage';

// Stable positive 31-bit notification id derived from task id. The plugin reads
// ids with getInt() on cancel/update, so keep them inside int range.
export function notifIdForTask(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) {
    h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  }
  return (h & 0x7fffffff) || 1;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const status = await LocalNotifications.checkPermissions();
  if (status.display === 'granted') return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

function parseReminder(reminder: string | null | undefined): Date | null {
  if (!reminder) return null;
  const at = new Date(reminder);
  if (isNaN(at.getTime())) return null;
  return at;
}

export type ReminderScheduleResult =
  | { status: 'scheduled' }
  | { status: 'inexact' } // exact-alarm permission missing, alarm may be delayed
  | { status: 'permission-needed' } // notifications disabled (POST_NOTIFICATIONS)
  | { status: 'failed'; message: string };

// Schedule one reminder and surface actionable status for the caller.
// On Android 12+ schedule() itself opens the "Alarms & reminders" screen when
// the exact-alarm permission is missing; if the user declines, the plugin falls
// back to an inexact alarm and resolves with a `warning`.
export async function scheduleTaskReminder(task: Pick<Task, 'id' | 'content' | 'reminder'>): Promise<ReminderScheduleResult> {
  const at = parseReminder(task.reminder);
  if (!at || at.getTime() <= Date.now()) return { status: 'scheduled' };
  try {
    const res = await LocalNotifications.schedule({
      notifications: [{
        id: notifIdForTask(task.id),
        title: '⏰ 任务提醒',
        body: task.content,
        schedule: { at },
      }],
    });
    if (res.warning) return { status: 'inexact' };
    return { status: 'scheduled' };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'NOTIFICATIONS_DISABLED') return { status: 'permission-needed' };
    return { status: 'failed', message: err.message || String(e) };
  }
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: notifIdForTask(taskId) }] });
}

// Open the Android 12+ "Alarms & reminders" special-access screen
export async function openExactAlarmSettings(): Promise<void> {
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    // user dismissed the settings screen
  }
}

// Rebuild all pending reminders from scratch: used on app start and after edits.
// Failures are logged; the caller decides whether to surface them.
export async function resyncReminders(tasks: Task[]): Promise<{ failed: number }> {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }
  let failed = 0;
  const now = Date.now();
  for (const t of tasks) {
    if (t.completed) continue;
    const at = parseReminder(t.reminder);
    if (!at || at.getTime() <= now) continue;
    const r = await scheduleTaskReminder(t);
    if (r.status === 'failed' || r.status === 'permission-needed') {
      failed += 1;
      console.error('reminder schedule failed for task', t.id, r);
    }
  }
  return { failed };
}
