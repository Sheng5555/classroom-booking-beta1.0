import { 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  addWeeks, 
  isSameDay, 
  addMinutes,
  isBefore,
  addDays,
  isWeekend
} from 'date-fns';

import { Booking, BookingType } from '../types';

// Local implementation of startOfWeek (Monday start) since import is failing
const getStartOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day === 0 ? 6 : day - 1);
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const getWeekDays = (date: Date) => {
  const start = getStartOfWeek(date);
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

export const formatTime = (date: Date) => format(date, 'h:mm a');
export const formatDateShort = (date: Date) => format(date, 'd');
export const formatDateFull = (date: Date) => format(date, 'EEEE, MMM d');
export const formatMonthYear = (date: Date) => format(date, 'MMMM yyyy');

export const isOverlap = (
  newStart: Date, 
  newEnd: Date, 
  classroomId: string, 
  existingBookings: Booking[],
  excludeBookingId?: string,
  excludeSeriesId?: string
): boolean => {
  return existingBookings.some(b => {
    if (b.classroomId !== classroomId) return false;
    
    // If excluding a specific ID (update single)
    if (excludeBookingId && b.id === excludeBookingId) return false;
    
    // If excluding a whole series (update series)
    if (excludeSeriesId && b.seriesId === excludeSeriesId) return false;
    
    // Custom overlap check to ensure exclusive boundaries (e.g. 10:00-11:00 and 11:00-12:00 do NOT overlap)
    // Overlap exists if (StartA < EndB) and (EndA > StartB)
    return newStart < b.endTime && newEnd > b.startTime;
  });
};

// Returns the actual booking object that conflicts, or undefined
export const findOverlappingBooking = (
  newStart: Date, 
  newEnd: Date, 
  classroomId: string, 
  existingBookings: Booking[],
  excludeBookingId?: string,
  excludeSeriesId?: string
): Booking | undefined => {
  return existingBookings.find(b => {
    if (b.classroomId !== classroomId) return false;
    
    if (excludeBookingId && b.id === excludeBookingId) return false;
    if (excludeSeriesId && b.seriesId === excludeSeriesId) return false;
    
    return newStart < b.endTime && newEnd > b.startTime;
  });
};

export const generateTimeSlots = (startHour: number, endHour: number) => {
  const slots = [];
  for (let i = startHour; i < endHour; i++) {
    const d = new Date();
    d.setHours(i, 0, 0, 0);
    slots.push({ hour: i, label: format(d, 'h aa') });
  }
  return slots;
};

// Generate recurring instances
export const generateRecurringBookings = (
  baseBooking: Omit<Booking, 'id'>, 
  recurrenceEndDate: Date,
  type: BookingType
): Booking[] => {
  const bookings: Booking[] = [];
  const seriesId = crypto.randomUUID();
  
  // Ensure we start fresh with date objects to avoid reference issues
  let currentStart = new Date(baseBooking.startTime);
  let currentEnd = new Date(baseBooking.endTime);
  
  // Safety break to prevent infinite loops
  let safety = 0;
  
  // Include the end date in the check (add 1 day to ensure inequality works for same day)
  const endLimit = addDays(recurrenceEndDate, 1);

  while (isBefore(currentStart, endLimit) && safety < 365) {
    let shouldAdd = false;

    if (type === BookingType.RECURRING_WEEKLY) {
      // Logic handled by loop increment below
      shouldAdd = true;
    } else if (type === BookingType.RECURRING_WEEKDAY) {
      if (!isWeekend(currentStart)) {
        shouldAdd = true;
      }
    }

    if (shouldAdd) {
      bookings.push({
        ...baseBooking,
        id: crypto.randomUUID(),
        seriesId,
        startTime: new Date(currentStart),
        endTime: new Date(currentEnd),
        type,
      });
    }

    // Increment logic
    if (type === BookingType.RECURRING_WEEKLY) {
      currentStart = addWeeks(currentStart, 1);
      currentEnd = addWeeks(currentEnd, 1);
    } else if (type === BookingType.RECURRING_WEEKDAY) {
      currentStart = addDays(currentStart, 1);
      currentEnd = addDays(currentEnd, 1);
    } else {
      // Should not happen for one-time calling this function
      break;
    }
    
    safety++;
  }
  
  return bookings;
};
