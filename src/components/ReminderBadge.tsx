export default function ReminderBadge({ reminder }: { reminder?: string | null }) {
  if (!reminder) return null;
  return <span className="task-reminder-time">⏰ {reminder.slice(11)}</span>;
}
