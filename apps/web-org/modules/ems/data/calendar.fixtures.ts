import { CalendarDayItem, MonthCalendarData } from '../types/calendar.types';

// Generate August 2026 Calendar Grid (42 cells: 6 weeks x 7 days)
const generateAugust2026Days = (): CalendarDayItem[] => {
  const days: CalendarDayItem[] = [];

  // July padding (Sun Jul 26 - Fri Jul 31)
  for (let i = 26; i <= 31; i++) {
    days.push({
      date: `2026-07-${i}`,
      dayNumber: i,
      isCurrentMonth: false,
      dayStatus: 'EMPTY',
    });
  }

  // August 1 to 31
  for (let day = 1; day <= 31; day++) {
    const dayStr = day.toString().padStart(2, '0');
    const date = `2026-08-${dayStr}`;
    const dayOfWeek = (day + 5) % 7; // Aug 1 is Saturday (index 6)

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = day === 25;

    if (day === 15) {
      // Independence Day
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        dayStatus: 'HOLIDAY',
        holidayName: 'Independence Day',
        shiftName: 'General Shift',
      });
    } else if (day === 26) {
      // Onam
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        dayStatus: 'HOLIDAY',
        holidayName: 'Onam (Restricted holiday)',
        isRestrictedHoliday: true,
        shiftName: 'General Shift',
      });
    } else if (isWeekend) {
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        dayStatus: 'WEEKEND',
        shiftName: 'General Shift',
      });
    } else if (day < 25) {
      // Past working days
      const hoursMap: Record<number, string> = {
        3: '08:15 Hrs',
        4: '08:08 Hrs',
        5: '08:21 Hrs',
        6: '08:13 Hrs',
        7: '08:10 Hrs',
        10: '08:30 Hrs',
        11: '08:12 Hrs',
        12: '08:05 Hrs',
        13: '08:45 Hrs',
        14: '08:20 Hrs',
        17: '08:18 Hrs',
        18: '08:09 Hrs',
        19: '08:14 Hrs',
        20: '08:25 Hrs',
        21: '08:11 Hrs',
        24: '08:48 Hrs',
      };
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        dayStatus: 'PRESENT',
        hoursLabel: hoursMap[day] || '08:00 Hrs',
        shiftName: 'General Shift',
        punches: [
          { type: 'IN', time: '09:47 AM', source: 'NATIVE' },
          { type: 'OUT', time: '06:35 PM', source: 'NATIVE' },
        ],
      });
    } else if (isToday) {
      // Today (Aug 25)
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: true,
        dayStatus: 'PRESENT',
        hoursLabel: '03:53 Hrs',
        shiftName: 'General Shift',
        punches: [{ type: 'IN', time: '09:43 AM', source: 'NATIVE' }],
      });
    } else {
      // Upcoming future days
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        dayStatus: 'UPCOMING',
        shiftName: 'General Shift',
      });
    }
  }

  // September padding (Tue Sep 1 - Sat Sep 5)
  for (let i = 1; i <= 5; i++) {
    days.push({
      date: `2026-09-0${i}`,
      dayNumber: i,
      isCurrentMonth: false,
      dayStatus: 'EMPTY',
    });
  }

  return days;
};

export const mockAugustCalendar: MonthCalendarData = {
  monthName: 'Aug 2026',
  year: 2026,
  month: 8,
  days: generateAugust2026Days(),
};
