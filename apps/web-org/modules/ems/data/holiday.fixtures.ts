import { HolidayItem } from '../types/holiday.types';

export const mockUpcomingHolidays: HolidayItem[] = [
  {
    id: 'hol_1',
    name: 'Onam',
    holidayDate: '26-Aug-2026',
    dayOfWeek: 'Wednesday',
    isOptional: true, // Restricted holiday
  },
  {
    id: 'hol_2',
    name: 'Ganesh Chaturthi/Vinayaka Chaturthi',
    holidayDate: '14-Sep-2026',
    dayOfWeek: 'Monday',
    isOptional: false,
  },
  {
    id: 'hol_3',
    name: 'Mahatma Gandhi Jayanti',
    holidayDate: '02-Oct-2026',
    dayOfWeek: 'Friday',
    isOptional: false,
  },
];
