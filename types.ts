export interface Classroom {
  id: string;
  name: string;
  equipment?: string[];
}

export enum BookingType {
  ONE_TIME = 'One-time',
  RECURRING_WEEKLY = 'Weekly Recurring',
  RECURRING_WEEKDAY = 'Mon-Fri Recurring',
}

export interface Booking {
  id: string;
  classroomId: string;
  title: string;
  description?: string;
  organizer: string;
  startTime: Date;
  endTime: Date;
  type: BookingType;
  seriesId?: string; // Used to link recurring events
  color: string;
  
  // Auth fields
  userId?: string;     // The UID of the person who created it
  userEmail?: string;  // The email of the person who created it
}

export interface CalendarTimeSlot {
  hour: number;
  label: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export const HOURS_OF_OPERATION = {
  start: 7, // 7 AM
  end: 22,  // 10 PM
};