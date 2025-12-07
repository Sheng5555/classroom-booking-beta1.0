import React, { useState, useEffect, useMemo } from 'react';
import { Booking, BookingType, HOURS_OF_OPERATION, UserProfile } from '../types';
import { format, addMinutes, addMonths } from 'date-fns';
import { Trash2, AlertTriangle, Save, Calendar, Check, ChevronDown, Lock, Layers, Copy } from 'lucide-react';

interface BookingFormProps {
  initialDate?: Date;
  initialStartTime?: Date;
  existingBooking?: Booking;
  classroomId: string;
  onSave: (bookingData: Partial<Booking>, recurrenceEnd?: Date, updateScope?: 'single' | 'series') => void;
  onDelete: (id: string, deleteSeries: boolean) => void;
  isOverlapWarning: boolean;
  setIsOverlapWarning: (val: boolean) => void;
  checkConflict: (start: Date, end: Date, excludeId?: string, excludeSeriesId?: string) => boolean;
  
  // Auth Props
  currentUser: UserProfile;
  isAdmin: boolean;
  isGuest?: boolean;
  
  // Recurrence Fix
  initialRecurrenceEndDate?: Date;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  initialDate,
  initialStartTime,
  existingBooking,
  classroomId,
  onSave,
  onDelete,
  checkConflict,
  currentUser,
  isAdmin,
  isGuest = false,
  initialRecurrenceEndDate
}) => {
  // --- PERMISSION LOGIC ---
  const isOwner = existingBooking ? existingBooking.userId === currentUser.uid : true;
  const canEdit = isAdmin || isOwner;
  const isReadOnly = isGuest || (existingBooking && !canEdit);
  const isRecurringInstance = !!(existingBooking && existingBooking.seriesId);

  // Default states
  const [title, setTitle] = useState(existingBooking?.title || '');
  const [organizer, setOrganizer] = useState(existingBooking?.organizer || currentUser.displayName || '');
  const [bookingType, setBookingType] = useState<BookingType>(existingBooking?.type || BookingType.ONE_TIME);
  const [date, setDate] = useState(format(existingBooking?.startTime || initialDate || new Date(), 'yyyy-MM-dd'));
  
  // Update Scope State (Default to series if recurring, otherwise single)
  const [updateScope, setUpdateScope] = useState<'single' | 'series'>('series');
  
  // Time state handling
  const getDefaultStart = () => {
    if (initialStartTime) return initialStartTime;
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  };

  const defaultStart = existingBooking?.startTime || getDefaultStart();
  const [startTime, setStartTime] = useState(format(defaultStart, 'HH:mm'));
  const [endTime, setEndTime] = useState(format(existingBooking?.endTime || addMinutes(defaultStart, 60), 'HH:mm'));
  
  // Initialize recurrence end date: prefer passed initial value, otherwise default to 1 month ahead
  const [recurrenceEnd, setRecurrenceEnd] = useState(() => {
    if (initialRecurrenceEndDate) {
      return format(initialRecurrenceEndDate, 'yyyy-MM-dd');
    }
    return format(addMonths(new Date(date), 1), 'yyyy-MM-dd');
  });

  // Update recurrence end if date changes and it wasn't pre-filled by an existing series
  useEffect(() => {
    if (!existingBooking && !initialRecurrenceEndDate) {
       setRecurrenceEnd(format(addMonths(new Date(date), 1), 'yyyy-MM-dd'));
    }
  }, [date, existingBooking, initialRecurrenceEndDate]);

  const [error, setError] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteConfirmType, setDeleteConfirmType] = useState<'single' | 'series' | null>(null);

  // Generate 1-minute interval time options
  const timeOptions = useMemo(() => {
    const options = [];
    const startHour = HOURS_OF_OPERATION.start;
    const endHour = HOURS_OF_OPERATION.end;
    
    const baseDate = new Date();
    
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 1) {
        if (hour === endHour && minute > 0) continue;
        
        baseDate.setHours(hour, minute, 0, 0);
        options.push({
          value: format(baseDate, 'HH:mm'),
          label: format(baseDate, 'h:mm a')
        });
      }
    }
    return options;
  }, []);

  // Helper to construct Date objects from state
  const getStartEndDateObjects = () => {
    const s = new Date(`${date}T${startTime}`);
    const e = new Date(`${date}T${endTime}`);
    return { s, e };
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) return;
    
    setError(null);

    const { s, e } = getStartEndDateObjects();

    if (s >= e) {
      setError("End time must be after start time.");
      return;
    }

    // SCOPED CONFLICT CHECK
    // If scope is 'single', we only exclude this specific ID.
    // If scope is 'series', we exclude the entire series ID.
    const excludeId = updateScope === 'single' ? existingBooking?.id : undefined;
    const excludeSeriesId = updateScope === 'series' ? existingBooking?.seriesId : undefined;

    const hasConflict = checkConflict(
      s, 
      e, 
      excludeId, 
      excludeSeriesId
    );

    if (hasConflict) {
      setError("Warning: This time slot overlaps with an existing booking.");
      return; 
    }

    const recurrenceEndDate = bookingType !== BookingType.ONE_TIME 
      ? new Date(recurrenceEnd) 
      : undefined;

    if (recurrenceEndDate && recurrenceEndDate <= s) {
        setError("Recurrence end date must be after the start date.");
        return;
    }

    onSave({
      title,
      organizer,
      type: bookingType,
      startTime: s,
      endTime: e,
      classroomId,
      color: existingBooking?.color || getRandomColor(),
    }, recurrenceEndDate, updateScope);
  };

  const handlePreDelete = (type: 'single' | 'series') => {
    setDeleteConfirmType(type);
  };

  const cancelDelete = () => {
    setDeleteConfirmType(null);
  };

  const confirmDelete = () => {
    if (existingBooking && deleteConfirmType) {
      onDelete(existingBooking.id, deleteConfirmType === 'series');
    }
  };

  // Conflict check effect for real-time feedback
  useEffect(() => {
    const { s, e } = getStartEndDateObjects();
    if (s < e) {
       // Scope logic for real-time check too
       const excludeId = updateScope === 'single' ? existingBooking?.id : undefined;
       const excludeSeriesId = updateScope === 'series' ? existingBooking?.seriesId : undefined;
       
       const conflict = checkConflict(
         s, 
         e, 
         excludeId, 
         excludeSeriesId
       );
       if (conflict) setError("This slot is already booked!");
       else setError(null);
    }
  }, [date, startTime, endTime, checkConflict, existingBooking, updateScope]);

  const inputClass = `w-full px-4 py-2.5 bg-neu-base rounded-xl shadow-neu-pressed outline-none focus:ring-1 focus:ring-primary-400 text-sm transition-all ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`;
  const labelClass = "block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide";

  return (
    <div className="space-y-6">
      {/* Read Only Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-xl shadow-neu-pressed flex items-center gap-3 text-sm border-l-4 border-amber-500">
          <Lock size={18} />
          <div>
            <p className="font-bold">{isGuest ? "Guest Mode (Read Only)" : "View Only"}</p>
            <p className="text-xs opacity-80">{isGuest ? "Please Sign In to edit." : "You can only edit bookings you created."}</p>
            {existingBooking?.userEmail && !isGuest && (
               <p className="text-xs mt-1">Created by: {existingBooking.userEmail}</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl shadow-neu-pressed flex items-start gap-2 text-sm border-l-4 border-red-500">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className={labelClass}>Event Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder="e.g. Math 101"
          required
          disabled={isReadOnly}
        />
      </div>

      <div>
        <label className={labelClass}>Organizer / Teacher</label>
        <input
          type="text"
          value={organizer}
          onChange={(e) => setOrganizer(e.target.value)}
          className={inputClass}
          placeholder="e.g. Mr. Smith"
          disabled={isReadOnly}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
            required
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <div className="relative">
            <select
              value={bookingType}
              onChange={(e) => setBookingType(e.target.value as BookingType)}
              className={`${inputClass} appearance-none ${!isReadOnly ? 'cursor-pointer' : ''}`}
              disabled={isReadOnly}
            >
              <option value={BookingType.ONE_TIME}>One-time</option>
              <option value={BookingType.RECURRING_WEEKLY}>Weekly (Same Day)</option>
              <option value={BookingType.RECURRING_WEEKDAY}>Mon-Fri (Weekday)</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className={labelClass}>Start Time</label>
          <div className="relative">
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${inputClass} appearance-none ${!isReadOnly ? 'cursor-pointer' : ''}`}
              required
              disabled={isReadOnly}
            >
              {timeOptions.map((opt) => (
                <option key={`start-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass}>End Time</label>
          <div className="relative">
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${inputClass} appearance-none ${!isReadOnly ? 'cursor-pointer' : ''}`}
              required
              disabled={isReadOnly}
            >
              {timeOptions.map((opt) => (
                <option key={`end-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* RECURRENCE END DATE */}
      {bookingType !== BookingType.ONE_TIME && (
        <div className="p-4 rounded-xl shadow-neu-pressed bg-neu-base/50">
          <div className="flex items-center gap-2 mb-2 text-primary-600">
            <Calendar size={16} />
            <label className="text-xs font-bold uppercase">Recurrence End Date</label>
          </div>
          <input
            type="date"
            value={recurrenceEnd}
            onChange={(e) => setRecurrenceEnd(e.target.value)}
            className={inputClass}
            min={date}
            required
            disabled={isReadOnly}
          />
        </div>
      )}

      {/* UPDATE SCOPE SELECTOR (For recurring instances) */}
      {!isReadOnly && isRecurringInstance && (
        <div className="p-4 rounded-xl shadow-neu bg-neu-base/50 border border-white/40">
           <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 block">Update Options</label>
           <div className="flex flex-col sm:flex-row gap-4">
              <label className={`flex-1 relative cursor-pointer group`}>
                 <input 
                   type="radio" 
                   name="updateScope" 
                   className="peer sr-only" 
                   checked={updateScope === 'single'}
                   onChange={() => setUpdateScope('single')}
                 />
                 <div className="p-3 rounded-xl border-2 border-transparent bg-neu-base shadow-neu-sm peer-checked:border-primary-500 peer-checked:text-primary-700 transition-all text-gray-600 flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-gray-400 peer-checked:border-primary-500 peer-checked:bg-primary-500 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 peer-checked:opacity-100"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold flex items-center gap-2"><Copy size={14}/> This Event Only</span>
                    </div>
                 </div>
              </label>

              <label className={`flex-1 relative cursor-pointer group`}>
                 <input 
                   type="radio" 
                   name="updateScope" 
                   className="peer sr-only" 
                   checked={updateScope === 'series'}
                   onChange={() => setUpdateScope('series')}
                 />
                 <div className="p-3 rounded-xl border-2 border-transparent bg-neu-base shadow-neu-sm peer-checked:border-primary-500 peer-checked:text-primary-700 transition-all text-gray-600 flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-gray-400 peer-checked:border-primary-500 peer-checked:bg-primary-500 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 peer-checked:opacity-100"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold flex items-center gap-2"><Layers size={14}/> Entire Series</span>
                    </div>
                 </div>
              </label>
           </div>
        </div>
      )}

      {/* Actions */}
      {!isReadOnly && (
        <div className="flex flex-col gap-4 pt-6 border-t border-gray-200/50">
          {/* Delete Confirmation UI */}
          {deleteConfirmType ? (
             <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3 text-red-700">
                  <AlertTriangle size={20} />
                  <span className="font-bold text-sm">
                    {deleteConfirmType === 'series' 
                      ? "Delete the entire recurring series?" 
                      : "Delete this specific booking?"}
                  </span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                   <button
                      type="button"
                      onClick={cancelDelete}
                      className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 text-gray-600 font-bold text-xs uppercase rounded-lg shadow-sm hover:bg-gray-50 transition-all"
                    >
                      Cancel
                   </button>
                   <button
                      type="button"
                      onClick={confirmDelete}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-bold text-xs uppercase rounded-lg shadow-md hover:bg-red-700 active:scale-95 transition-all"
                    >
                      <Check size={14} /> Confirm
                   </button>
                </div>
             </div>
          ) : (
            <div className="flex gap-4">
              {existingBooking && (
                <div className="flex gap-3 mr-auto">
                   {existingBooking.seriesId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePreDelete('single')}
                          className="px-4 py-2 text-red-600 rounded-xl shadow-neu hover:text-red-700 active:shadow-neu-pressed active:scale-95 text-xs font-bold uppercase transition-all"
                        >
                         Delete This
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreDelete('series')}
                          className="px-4 py-2 text-red-600 rounded-xl shadow-neu hover:text-red-700 active:shadow-neu-pressed active:scale-95 text-xs font-bold uppercase transition-all"
                        >
                         Delete Series
                        </button>
                      </>
                   ) : (
                      <button
                        type="button"
                        onClick={() => handlePreDelete('single')}
                        className="flex items-center gap-2 px-4 py-2 text-red-600 rounded-xl shadow-neu hover:text-red-700 active:shadow-neu-pressed active:scale-95 text-xs font-bold uppercase transition-all"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                   )}
                </div>
              )}
              
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!!error}
                className={`ml-auto flex items-center gap-2 px-6 py-3 rounded-xl shadow-neu font-bold text-sm tracking-wide transition-all active:scale-95 active:shadow-neu-pressed
                  ${error 
                    ? 'text-gray-400 cursor-not-allowed' 
                    : 'text-primary-600 hover:text-primary-700'}
                `}
              >
                <Save size={18} />
                {existingBooking ? 'Update' : 'Create'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const getRandomColor = () => {
  const colors = [
    'bg-blue-200/50 border-l-4 border-blue-400 text-blue-900',
    'bg-emerald-200/50 border-l-4 border-emerald-400 text-emerald-900',
    'bg-purple-200/50 border-l-4 border-purple-400 text-purple-900',
    'bg-amber-200/50 border-l-4 border-amber-400 text-amber-900',
    'bg-rose-200/50 border-l-4 border-rose-400 text-rose-900',
    'bg-indigo-200/50 border-l-4 border-indigo-400 text-indigo-900',
    'bg-cyan-200/50 border-l-4 border-cyan-400 text-cyan-900',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};
