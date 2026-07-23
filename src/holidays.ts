export interface Holiday {
  date: string;       // YYYY-MM-DD
  name: string;
  emoji: string;
  type: 'gregorian' | 'lunar';
}

export interface HolidayMap {
  [date: string]: Holiday;
}

const HOLIDAY_DATA: Holiday[] = [
  // ===== Gregorian fixed holidays =====
  { date: '2025-01-01', name: '元旦', emoji: '🎉', type: 'gregorian' },
  { date: '2025-02-14', name: '情人节', emoji: '💕', type: 'gregorian' },
  { date: '2025-03-08', name: '妇女节', emoji: '👩', type: 'gregorian' },
  { date: '2025-04-01', name: '愚人节', emoji: '🃏', type: 'gregorian' },
  { date: '2025-04-04', name: '清明节', emoji: '🌿', type: 'gregorian' },
  { date: '2025-05-01', name: '劳动节', emoji: '🛠️', type: 'gregorian' },
  { date: '2025-05-04', name: '青年节', emoji: '🔥', type: 'gregorian' },
  { date: '2025-05-11', name: '母亲节', emoji: '🌸', type: 'gregorian' },
  { date: '2025-06-01', name: '儿童节', emoji: '🧒', type: 'gregorian' },
  { date: '2025-06-15', name: '父亲节', emoji: '👔', type: 'gregorian' },
  { date: '2025-07-01', name: '建党节', emoji: '🚩', type: 'gregorian' },
  { date: '2025-08-01', name: '建军节', emoji: '⭐', type: 'gregorian' },
  { date: '2025-09-10', name: '教师节', emoji: '📚', type: 'gregorian' },
  { date: '2025-10-01', name: '国庆节', emoji: '🇨🇳', type: 'gregorian' },
  { date: '2025-10-31', name: '万圣节', emoji: '🎃', type: 'gregorian' },
  { date: '2025-11-27', name: '感恩节', emoji: '🦃', type: 'gregorian' },
  { date: '2025-12-21', name: '冬至', emoji: '🥟', type: 'gregorian' },
  { date: '2025-12-25', name: '圣诞节', emoji: '🎄', type: 'gregorian' },

  { date: '2026-01-01', name: '元旦', emoji: '🎉', type: 'gregorian' },
  { date: '2026-02-14', name: '情人节', emoji: '💕', type: 'gregorian' },
  { date: '2026-03-08', name: '妇女节', emoji: '👩', type: 'gregorian' },
  { date: '2026-04-01', name: '愚人节', emoji: '🃏', type: 'gregorian' },
  { date: '2026-04-05', name: '清明节', emoji: '🌿', type: 'gregorian' },
  { date: '2026-05-01', name: '劳动节', emoji: '🛠️', type: 'gregorian' },
  { date: '2026-05-04', name: '青年节', emoji: '🔥', type: 'gregorian' },
  { date: '2026-05-10', name: '母亲节', emoji: '🌸', type: 'gregorian' },
  { date: '2026-06-01', name: '儿童节', emoji: '🧒', type: 'gregorian' },
  { date: '2026-06-21', name: '父亲节', emoji: '👔', type: 'gregorian' },
  { date: '2026-07-01', name: '建党节', emoji: '🚩', type: 'gregorian' },
  { date: '2026-08-01', name: '建军节', emoji: '⭐', type: 'gregorian' },
  { date: '2026-09-10', name: '教师节', emoji: '📚', type: 'gregorian' },
  { date: '2026-10-01', name: '国庆节', emoji: '🇨🇳', type: 'gregorian' },
  { date: '2026-10-31', name: '万圣节', emoji: '🎃', type: 'gregorian' },
  { date: '2026-11-26', name: '感恩节', emoji: '🦃', type: 'gregorian' },
  { date: '2026-12-21', name: '冬至', emoji: '🥟', type: 'gregorian' },
  { date: '2026-12-25', name: '圣诞节', emoji: '🎄', type: 'gregorian' },

  { date: '2027-01-01', name: '元旦', emoji: '🎉', type: 'gregorian' },
  { date: '2027-02-14', name: '情人节', emoji: '💕', type: 'gregorian' },
  { date: '2027-03-08', name: '妇女节', emoji: '👩', type: 'gregorian' },
  { date: '2027-04-01', name: '愚人节', emoji: '🃏', type: 'gregorian' },
  { date: '2027-04-05', name: '清明节', emoji: '🌿', type: 'gregorian' },
  { date: '2027-05-01', name: '劳动节', emoji: '🛠️', type: 'gregorian' },
  { date: '2027-05-04', name: '青年节', emoji: '🔥', type: 'gregorian' },
  { date: '2027-05-09', name: '母亲节', emoji: '🌸', type: 'gregorian' },
  { date: '2027-06-01', name: '儿童节', emoji: '🧒', type: 'gregorian' },
  { date: '2027-06-20', name: '父亲节', emoji: '👔', type: 'gregorian' },
  { date: '2027-07-01', name: '建党节', emoji: '🚩', type: 'gregorian' },
  { date: '2027-08-01', name: '建军节', emoji: '⭐', type: 'gregorian' },
  { date: '2027-09-10', name: '教师节', emoji: '📚', type: 'gregorian' },
  { date: '2027-10-01', name: '国庆节', emoji: '🇨🇳', type: 'gregorian' },
  { date: '2027-10-31', name: '万圣节', emoji: '🎃', type: 'gregorian' },
  { date: '2027-11-25', name: '感恩节', emoji: '🦃', type: 'gregorian' },
  { date: '2027-12-22', name: '冬至', emoji: '🥟', type: 'gregorian' },
  { date: '2027-12-25', name: '圣诞节', emoji: '🎄', type: 'gregorian' },

  // ===== Lunar-based holidays (2025 - 乙巳蛇年) =====
  { date: '2025-01-28', name: '除夕', emoji: '🧧', type: 'lunar' },
  { date: '2025-01-29', name: '春节', emoji: '🐍', type: 'lunar' },
  { date: '2025-02-12', name: '元宵节', emoji: '🏮', type: 'lunar' },
  { date: '2025-05-31', name: '端午节', emoji: '🐲', type: 'lunar' },
  { date: '2025-08-29', name: '七夕', emoji: '💫', type: 'lunar' },
  { date: '2025-10-06', name: '中秋节', emoji: '🌕', type: 'lunar' },
  { date: '2025-10-29', name: '重阳节', emoji: '🌿', type: 'lunar' },

  // Lunar-based holidays (2026 - 丙午马年)
  { date: '2026-02-16', name: '除夕', emoji: '🧧', type: 'lunar' },
  { date: '2026-02-17', name: '春节', emoji: '🐴', type: 'lunar' },
  { date: '2026-03-03', name: '元宵节', emoji: '🏮', type: 'lunar' },
  { date: '2026-06-19', name: '端午节', emoji: '🐲', type: 'lunar' },
  { date: '2026-08-13', name: '七夕', emoji: '💫', type: 'lunar' },
  { date: '2026-09-25', name: '中秋节', emoji: '🌕', type: 'lunar' },
  { date: '2026-10-18', name: '重阳节', emoji: '🌿', type: 'lunar' },

  // Lunar-based holidays (2027 - 丁未羊年)
  { date: '2027-02-05', name: '除夕', emoji: '🧧', type: 'lunar' },
  { date: '2027-02-06', name: '春节', emoji: '🐑', type: 'lunar' },
  { date: '2027-02-20', name: '元宵节', emoji: '🏮', type: 'lunar' },
  { date: '2027-06-09', name: '端午节', emoji: '🐲', type: 'lunar' },
  { date: '2027-08-27', name: '七夕', emoji: '💫', type: 'lunar' },
  { date: '2027-09-15', name: '中秋节', emoji: '🌕', type: 'lunar' },
  { date: '2027-10-08', name: '重阳节', emoji: '🌿', type: 'lunar' },
];

export function getHolidayMap(): HolidayMap {
  const map: HolidayMap = {};
  for (const h of HOLIDAY_DATA) {
    map[h.date] = h;
  }
  return map;
}

export function getHoliday(dateStr: string): Holiday | undefined {
  return getHolidayMap()[dateStr];
}

export function getHolidayDates(): Set<string> {
  return new Set(HOLIDAY_DATA.map((h) => h.date));
}
