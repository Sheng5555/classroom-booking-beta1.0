import React from 'react';
import { 
  getWeekDays, 
  generateTimeSlots, 
  formatDateShort, 
  formatDateFull,
  formatTime 
} from '../utils/dateUtils';
import { HOURS_OF_OPERATION, Booking, Classroom } from '../types';
import { isSameDay, differenceInMinutes, isWeekend, setHours } from 'date-fns';
import { Clock, Users, MapPin } from 'lucide-react';

interface WeekCalendarProps {
  currentDate: Date;
  selectedClassroom: Classroom | undefined;
  bookings: Booking[];
  onSlotClick: (date: Date, hour: number) => void;
  onBookingClick: (booking: Booking) => void;
  onBookingMove: (bookingId: string, newStartTime: Date) => void;
  onBookingResize: (bookingId: string, newEndTime: Date) => void;
  isGuest?: boolean;
}

export const WeekCalendar: React.FC<WeekCalendarProps> = ({
  currentDate,
  selectedClassroom,
  bookings,
  onSlotClick,
  onBookingClick,
  onBookingMove,
  onBookingResize,
  isGuest = false,
}) => {
  const weekDays = getWeekDays(currentDate);
  const timeSlots = generateTimeSlots(HOURS_OF_OPERATION.start, HOURS_OF_OPERATION.end);

  const relevantBookings = bookings.filter(b => 
    b.classroomId === selectedClassroom?.id &&
    weekDays.some(day => isSameDay(day, b.startTime))
  );

  const getBookingStyles = (booking: Booking) => {
    const startHour = booking.startTime.getHours();
    const startMin = booking.startTime.getMinutes();
    const totalMinutesFromStartOfDay = (startHour - HOURS_OF_OPERATION.start) * 60 + startMin;
    
    // Row height = 80px (h-20)
    const rowHeight = 80;
    const top = (totalMinutesFromStartOfDay / 60) * rowHeight; 
    
    const duration = differenceInMinutes(booking.endTime, booking.startTime);
    const height = (duration / 60) * rowHeight;

    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };

  const isToday = (date: Date) => isSameDay(new Date(), date);

  // Resize State
  const [resizeState, setResizeState] = React.useState<{
    bookingId: string;
    originalEndTime: Date;
    startY: number;
  } | null>(null);
  
  const [tempResizeEndTime, setTempResizeEndTime] = React.useState<Date | null>(null);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, bookingId: string) => {
    if (isGuest) return;
    e.dataTransfer.setData('bookingId', bookingId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isGuest) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, day: Date) => {
    if (isGuest) return;
    e.preventDefault();
    const bookingId = e.dataTransfer.getData('bookingId');
    if (!bookingId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    
    // Calculate new start time based on drop Y position
    const rowHeight = 80; // 80px per hour
    const hoursFromStart = offsetY / rowHeight;
    const minutesFromStart = hoursFromStart * 60;
    
    // Snap to nearest 1 minute for precision
    const snappedMinutes = Math.round(minutesFromStart);
    
    const newStartTime = new Date(day);
    // Reset to start of operating hours then add minutes
    newStartTime.setHours(HOURS_OF_OPERATION.start, 0, 0, 0);
    newStartTime.setMinutes(snappedMinutes);
    
    onBookingMove(bookingId, newStartTime);
  };

  // Resize Handlers
  const handleResizeStart = (e: React.MouseEvent, booking: Booking) => {
    if (isGuest) return;
    e.stopPropagation(); // Prevent drag start
    e.preventDefault(); // Prevent selection
    setResizeState({
      bookingId: booking.id,
      originalEndTime: booking.endTime,
      startY: e.clientY,
    });
    setTempResizeEndTime(booking.endTime);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeState) return;

      const deltaY = e.clientY - resizeState.startY;
      const rowHeight = 80; // px per hour
      const minutesDelta = (deltaY / rowHeight) * 60;
      
      const newEndTime = new Date(resizeState.originalEndTime);
      newEndTime.setMinutes(newEndTime.getMinutes() + minutesDelta);

      // Clamp: Minimum 15 mins duration
      const booking = bookings.find(b => b.id === resizeState.bookingId);
      if (booking) {
         const minTime = new Date(booking.startTime);
         minTime.setMinutes(minTime.getMinutes() + 15);
         if (newEndTime < minTime) return; // Don't shrink below 15m

         // Clamp: Max end of day
         const maxTime = new Date(booking.startTime);
         maxTime.setHours(HOURS_OF_OPERATION.end, 0, 0, 0);
         if (newEndTime > maxTime) newEndTime.setTime(maxTime.getTime());

         setTempResizeEndTime(newEndTime);
      }
    };

    const handleMouseUp = () => {
      if (resizeState && tempResizeEndTime) {
         // Defensive check to prevent crash if prop is missing
         if (onBookingResize) {
             onBookingResize(resizeState.bookingId, tempResizeEndTime);
         }
      }
      setResizeState(null);
      setTempResizeEndTime(null);
    };

    if (resizeState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeState, tempResizeEndTime, bookings, onBookingResize]);


  if (!selectedClassroom) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-neu-base rounded-3xl shadow-neu-pressed m-4 border border-white/20">
        <MapPin size={64} className="mb-6 text-gray-300" />
        <p className="text-xl font-medium text-gray-500">Please select or create a classroom to view the schedule.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neu-base rounded-3xl shadow-neu overflow-hidden border border-white/40">
      
      {/* Unified Scroll Container */}
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        {/* Inner Wrapper to force min-width on Mobile */}
        <div className="min-w-[800px] relative">
          
          {/* Header Row: Days (Sticky Top) */}
          <div className="grid grid-cols-8 divide-x divide-gray-200/50 bg-neu-base sticky top-0 z-30 shadow-sm">
            {/* Top-Left Corner (Sticky Left + Top) */}
            <div className="p-4 flex items-center justify-center text-gray-400 font-bold sticky left-0 top-0 z-50 bg-neu-base shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
              <Clock size={20} />
            </div>
            
            {/* Day Headers */}
            {weekDays.map((day, idx) => {
              const isWknd = isWeekend(day);
              return (
                <div 
                  key={idx} 
                  className={`p-4 text-center transition-colors bg-neu-base z-30 ${isWknd ? 'bg-red-50/50' : ''}`}
                >
                  <div className={`text-xs font-bold uppercase mb-2 tracking-widest ${isToday(day) ? 'text-primary-600' : isWknd ? 'text-red-400' : 'text-gray-500'}`}>
                    {formatDateFull(day).split(',')[0]}
                  </div>
                  <div className={`
                    inline-flex items-center justify-center w-10 h-10 rounded-xl text-lg font-bold transition-all
                    ${isToday(day) ? 'bg-neu-base text-primary-600 shadow-neu' : 'text-gray-700'}
                  `}>
                    {formatDateShort(day)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body: Time Slots & Grid */}
          <div className="grid grid-cols-8 divide-x divide-gray-200/50">
            
            {/* Sidebar: Times (Sticky Left) */}
            <div className="col-span-1 bg-neu-base z-20 sticky left-0 shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
              {timeSlots.map((slot) => (
                <div key={slot.hour} className="h-20 border-b border-gray-200/50 text-xs font-medium text-gray-400 text-right pr-4 pt-2 relative">
                  <span className="-top-3 relative">{slot.label}</span>
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {weekDays.map((day, dayIdx) => {
              const isWknd = isWeekend(day);
              return (
                <div 
                  key={dayIdx} 
                  className={`relative col-span-1 ${isWknd ? 'bg-red-100/30' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                >
                  
                  {/* Grid Lines for rows */}
                  {timeSlots.map((slot) => (
                    <div 
                      key={slot.hour} 
                      className={`h-20 border-b border-gray-200/50 transition-colors cursor-pointer group relative
                         ${isWknd ? 'hover:bg-red-100/40' : 'hover:bg-white/40'}
                      `}
                      onClick={() => onSlotClick(day, slot.hour)}
                    >
                        {/* Add Hint on Hover */}
                        <div className="hidden group-hover:flex items-center justify-center h-full opacity-0 group-hover:opacity-40 transition-opacity text-gray-400">
                            <span className="text-3xl font-light">+</span>
                        </div>
                    </div>
                  ))}

                  {/* Bookings Overlay */}
                  {relevantBookings
                    .filter(b => isSameDay(b.startTime, day))
                    .map(booking => {
                      const isResizing = resizeState?.bookingId === booking.id;
                      const displayEndTime = isResizing && tempResizeEndTime ? tempResizeEndTime : booking.endTime;
                      // While resizing, use the temp time to calculate height
                      const style = isResizing 
                          ? getBookingStyles({ ...booking, endTime: displayEndTime }) 
                          : getBookingStyles(booking);
                      
                      const canInteract = !isGuest;

                      return (
                        <div
                          key={booking.id}
                          draggable={canInteract && !isResizing} // Disable drag while resizing
                          onDragStart={(e) => handleDragStart(e, booking.id)}
                          className={`absolute inset-x-1.5 p-2 rounded-lg border-l-[3px] text-xs shadow-sm hover:shadow-md transition-all z-10 overflow-hidden flex flex-col gap-0.5 ${booking.color} hover:brightness-95 active:scale-95 group
                            ${canInteract ? 'cursor-move' : 'cursor-default'}
                          `}
                          style={style}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBookingClick(booking);
                          }}
                          title={`${booking.title} (${formatTime(booking.startTime)} - ${formatTime(displayEndTime)})\n${canInteract ? 'Drag to move.' : ''}`}
                        >
                          <div className="font-bold truncate text-sm pointer-events-none">{booking.title}</div>
                          <div className="opacity-90 flex items-center gap-1 truncate text-[10px] font-medium pointer-events-none">
                              <span>{formatTime(booking.startTime)} - {formatTime(displayEndTime)}</span>
                          </div>
                          {booking.organizer && (
                              <div className="flex items-center gap-1 opacity-75 mt-auto pointer-events-none">
                                  <Users size={10} />
                                  <span className="truncate">{booking.organizer}</span>
                              </div>
                          )}
                          {booking.type !== 'One-time' && (
                              <div className="absolute top-1.5 right-1.5 opacity-60 pointer-events-none">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                              </div>
                          )}

                          {/* Resize Handle */}
                          {canInteract && (
                            <div 
                                className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex justify-center items-end opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/5"
                                onMouseDown={(e) => handleResizeStart(e, booking)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="w-8 h-1 bg-black/20 rounded-full mb-1"></div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  }
                  
                  {/* Current Time Indicator (Red Line) */}
                  {isToday(day) && (
                    <CurrentTimeIndicator />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const CurrentTimeIndicator = () => {
    const [top, setTop] = React.useState(0);
    const [visible, setVisible] = React.useState(true);

    React.useEffect(() => {
        const update = () => {
            const now = new Date();
            const hour = now.getHours();
            if (hour < HOURS_OF_OPERATION.start || hour >= HOURS_OF_OPERATION.end) {
                setVisible(false);
                return;
            }
            setVisible(true);
            const minutes = now.getMinutes();
            const totalMinutes = (hour - HOURS_OF_OPERATION.start) * 60 + minutes;
            // Matches row height 80
            setTop((totalMinutes / 60) * 80); 
        };
        update();
        const interval = setInterval(update, 60000); 
        return () => clearInterval(interval);
    }, []);

    if (!visible) return null;

    return (
        <div 
            className="absolute left-0 right-0 border-t-2 border-red-500 z-30 pointer-events-none flex items-center shadow-sm"
            style={{ top: `${top}px` }}
        >
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shadow-sm"></div>
        </div>
    );
}
