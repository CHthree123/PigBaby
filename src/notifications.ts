import { LocalNotifications } from '@capacitor/local-notifications';
import type { Task } from './storage';

// Stable numeric notification id derived from task id (plugin requires integer ids)
export function notifIdForTask(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) {
    h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  }
  return h;
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

export async function scheduleTaskReminder(task: Pick<Task, 'id' | 'content' | 'reminder'>): Promise<void> {
  const at = parseReminder(task.reminder);
  if (!at || at.getTime() <= Date.now()) return;
  await LocalNotifications.schedule({
    notifications: [{
      id: notifIdForTask(task.id),
      title: '⏰ 任务提醒',
      body: task.content,
      schedule: { at },
    }],
  });
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: notifIdForTask(taskId) }] });
}

// Rebuild all pending reminders from scratch: used on app start and after edits
export async function resyncReminders(tasks: Task[]): Promise<void> {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }
  const now = Date.now();
  for (const t of tasks) {
    if (t.completed) continue;
    const at = parseReminder(t.reminder);
    if (!at || at.getTime() <= now) continue;
    try {
      await scheduleTaskReminder(t);
    } catch (e) {
      console.error('schedule reminder failed for task', t.id, e);
    }
  }
}
