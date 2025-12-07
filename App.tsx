import React, { useState, useEffect } from 'react';
import { 
  addWeeks, 
  format,
  differenceInMinutes,
  addMinutes,
  addDays,
  isWeekend
} from 'date-fns';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Printer, 
  BookOpen,
  Loader2,
  LogOut,
  User as UserIcon,
  ShieldAlert,
  Filter,
  RefreshCw,
  CalendarRange,
  FileText
} from 'lucide-react';

import { WeekCalendar } from './components/WeekCalendar';
import { Modal } from './components/ui/Modal';
import { BookingForm } from './components/BookingForm';
import { ClassroomManager } from './components/ClassroomManager';
import { Login } from './components/Login';
import { Booking, Classroom, BookingType, UserProfile } from './types';
import { generateRecurringBookings, isOverlap, findOverlappingBooking, formatMonthYear, getWeeksInRange } from './utils/dateUtils';
import { api } from './services/api';
import { auth, googleProvider } from './services/firebase';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

// --- CONFIGURATION ---

// 1. ADMINS: These emails have full access.
const ADMIN_EMAILS = [
  'shenglanko@wagor.tc.edu.tw', 
  'karencheng@wagor.tc.edu.tw',
  'sandy@wagor.tc.edu.tw', 
  'torreswang@wagor.tc.edu.tw',
];

// 2. DOMAIN RESTRICTION:
// Add domains to this array. Users must match one of these domains (unless they are admin).
const ALLOWED_DOMAINS = [
  'wagor.tc.edu.tw',
  'gmail.com', // Example: Add more domains here
]; 

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  
  // SECURITY STATE
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  
  // --- App State ---
  const [isLoading, setIsLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  
  // --- Data Period State ---
  // Default: Sept 1st of current year to Dec 31st of current year
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 8, 1); // Month is 0-indexed (8 = Sept)
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 11, 31); // 11 = Dec
  });
  const [isPeriodSelectorOpen, setIsPeriodSelectorOpen] = useState(false);
  
  // Modals
  const [isClassroomModalOpen, setIsClassroomModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  
  // PRINT MODAL STATE
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [showPrintRange, setShowPrintRange] = useState(false);
  const [printStartDate, setPrintStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [printEndDate, setPrintEndDate] = useState(format(addWeeks(new Date(), 4), 'yyyy-MM-dd'));
  const [weeksToPrint, setWeeksToPrint] = useState<Date[]>([]);
  
  // Booking Form State
  const [editingBooking, setEditingBooking] = useState<Booking | undefined>(undefined);
  const [newBookingParams, setNewBookingParams] = useState<{ date: Date, time: Date } | undefined>(undefined);
  const [initialRecurrenceEndDate, setInitialRecurrenceEndDate] = useState<Date | undefined>(undefined);
  const [isOverlapWarning, setIsOverlapWarning] = useState(false);

  // Derived
  const selectedClassroom = classrooms.find(c => c.id === selectedClassroomId);
  
  // Check Admin Role (Case Insensitive)
  const isAdmin = isGuest ? false : (currentUser?.email ? ADMIN_EMAILS.map(e => e.toLowerCase()).includes(currentUser.email.toLowerCase()) : false);

  // Helper: Check Permissions
  const checkUserPermissions = (user: firebase.User | null): boolean => {
    if (!user) return false;
    
    // Allow Guests (Anonymous users)
    if (user.isAnonymous) return true;

    if (!user.email) return false;

    const userEmail = user.email.toLowerCase();
    const isAdminUser = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail);

    // If Admin, always allow
    if (isAdminUser) return true;

    // If Domain Restriction is active
    if (ALLOWED_DOMAINS.length > 0) {
      // Check if email ends with any of the allowed domains
      const hasValidDomain = ALLOWED_DOMAINS.some(domain => 
        userEmail.endsWith('@' + domain.toLowerCase())
      );
      
      if (!hasValidDomain) {
        return false;
      }
    }
    
    return true;
  };

  // --- Auth Effect ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // PERMISSION CHECK
        const isAllowed = checkUserPermissions(user);

        if (!isAllowed) {
           // IMMEDIATE BOUNCE
           await auth.signOut();
           setIsAccessDenied(true);
           setCurrentUser(null);
           setIsAuthLoading(false);
           alert(`Access Denied: You must use an email from one of the following domains: ${ALLOWED_DOMAINS.map(d => '@' + d).join(', ')}`);
           return;
        }

        setIsAccessDenied(false);
        
        if (user.isAnonymous) {
          setIsGuest(true);
          setCurrentUser({
            uid: user.uid,
            email: 'Guest',
            displayName: 'Guest User',
            photoURL: null
          });
        } else {
          setIsGuest(false);
          setCurrentUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL
          });
        }
        // Load data is triggered by effect below when period changes or user changes
      } else {
        // Logged out
        setCurrentUser(null);
        setIsGuest(false);
        setIsAccessDenied(false);
        setBookings([]);
        setClassrooms([]);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Data Loading Effect ---
  // Reloads when User OR Period changes
  useEffect(() => {
    if (currentUser && !isAccessDenied) {
      loadData();
    }
  }, [currentUser, periodStart, periodEnd, isAccessDenied]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch Classrooms (always all)
      const fetchedClassrooms = await api.fetchClassrooms();
      
      // Fetch Bookings (filtered by period)
      // We set the time to start of day for start date, and end of day for end date
      const startQuery = new Date(periodStart); startQuery.setHours(0,0,0,0);
      const endQuery = new Date(periodEnd); endQuery.setHours(23,59,59,999);
      
      const fetchedBookings = await api.fetchBookings(startQuery, endQuery);
      
      setClassrooms(fetchedClassrooms);
      setBookings(fetchedBookings);
      
      if (fetchedClassrooms.length > 0 && !selectedClassroomId) {
        setSelectedClassroomId(fetchedClassrooms[0].id);
      }
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      if (window.location.protocol === 'file:') {
        alert("Authentication Error: You are running this file directly from your computer (file://).\n\nFirebase Auth requires a web server.");
        return;
      }
      
      if (isLoginLoading) return;
      setIsLoginLoading(true);
      
      // Force persistence to LOCAL before signing in
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      
      const result = await auth.signInWithPopup(googleProvider);
      
      // IMMEDIATE SECURITY CHECK AFTER POPUP
      if (result.user) {
        const isAllowed = checkUserPermissions(result.user);
        if (!isAllowed) {
          await auth.signOut(); // Kick them out immediately
          alert(`Access Denied: You must use an email from one of the following domains: ${ALLOWED_DOMAINS.map(d => '@' + d).join(', ')}`);
          return;
        }
      }
      
    } catch (error: any) {
      console.error("Login initiation failed", error);
      if (error.code === 'auth/operation-not-supported-in-this-environment') {
        alert("Login Error: Your browser environment (preview/file) does not support Google Sign-In.\n\nPlease deploy to Netlify or run 'npm run dev' locally.");
      } else if (error.code === 'auth/unauthorized-domain') {
        alert(`Configuration Error: The domain "${window.location.hostname}" is not authorized.\n\nGo to Firebase Console -> Authentication -> Settings -> Authorized Domains and add: ${window.location.hostname}`);
      } else {
        alert(`Login failed: ${error.message}`);
      }
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (isLoginLoading) return;
    setIsLoginLoading(true);
    try {
      // Use REAL anonymous auth so Firestore rules work
      await auth.signInAnonymously();
    } catch (error: any) {
      console.error("Guest login failed", error);
      alert("Guest login failed. Please ensure 'Anonymous' is enabled in Firebase Console -> Authentication -> Sign-in method.");
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    // State clearing is handled by onAuthStateChanged
  };

  // --- Handlers ---
  const handlePrevWeek = () => setCurrentDate(addWeeks(currentDate, -1));
  const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const handleJumpToday = () => setCurrentDate(new Date());
  
  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setCurrentDate(new Date(e.target.value));
    }
  };

  const handlePrint = () => {
    setShowPrintRange(false); // Reset UI
    setIsPrintModalOpen(true);
  };

  const handleConfirmPrint = (mode: 'current' | 'range') => {
    setIsPrintModalOpen(false); // Close modal FIRST to prevent blocking
    
    if (mode === 'current') {
      // Wait for modal exit animation/unmount before printing
      setTimeout(() => {
         window.print();
      }, 500);
    } else {
      // Range Mode
      const start = new Date(printStartDate);
      const end = new Date(printEndDate);
      const weeks = getWeeksInRange(start, end);
      setWeeksToPrint(weeks);
      
      // Allow render to update -> Toggle CSS -> Print -> Cleanup
      setTimeout(() => {
         document.body.classList.add('print-mode-range');
         window.print();
         document.body.classList.remove('print-mode-range');
         setWeeksToPrint([]);
      }, 500);
    }
  };

  // --- CRUD Classroom ---
  const handleAddClassroom = async (c: Classroom) => {
    if (!isAdmin) return;
    try {
      const newClassroom = await api.addClassroom(c);
      setClassrooms(prev => [...prev, newClassroom]);
      if (classrooms.length === 0) setSelectedClassroomId(newClassroom.id);
    } catch (e) {
      alert("Failed to add classroom.");
    }
  };

  const handleUpdateClassroom = async (c: Classroom) => {
    if (!isAdmin) return;
    try {
      const updated = await api.updateClassroom(c);
      setClassrooms(prev => prev.map(item => item.id === updated.id ? updated : item));
    } catch (e) {
      alert("Failed to update classroom.");
    }
  };

  const handleDeleteClassroom = async (id: string) => {
    if (!isAdmin) return;
    try {
      await api.deleteClassroom(id);
      const remaining = classrooms.filter(c => c.id !== id);
      setClassrooms(remaining);
      setBookings(prev => prev.filter(b => b.classroomId !== id));
      
      if (selectedClassroomId === id) {
        setSelectedClassroomId(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (e) {
      alert("Failed to delete classroom.");
    }
  };

  // --- Booking Interaction ---
  const handleSlotClick = (date: Date, hour: number) => {
    if (isGuest) {
      alert("Guest accounts are Read-Only. Please Sign In with Google to create bookings.");
      return;
    }
    
    // Period check
    if (date < periodStart || date > periodEnd) {
       alert(`You are viewing a date outside your Active Period (${format(periodStart, 'MMM d')} - ${format(periodEnd, 'MMM d')}).\n\nPlease update the period in settings to book this date.`);
       return;
    }

    setEditingBooking(undefined);
    setInitialRecurrenceEndDate(undefined);
    const time = new Date(date);
    time.setHours(hour, 0, 0, 0);
    setNewBookingParams({ date, time });
    setIsBookingModalOpen(true);
  };

  const handleBookingClick = (booking: Booking) => {
    setEditingBooking(booking);
    setNewBookingParams(undefined);
    
    // Calculate the end date of the series to pre-fill the form
    if (booking.seriesId) {
       const seriesBookings = bookings.filter(b => b.seriesId === booking.seriesId);
       if (seriesBookings.length > 0) {
          // Find the max end time
          const maxEnd = seriesBookings.reduce((max, b) => b.endTime > max ? b.endTime : max, seriesBookings[0].endTime);
          setInitialRecurrenceEndDate(maxEnd);
       } else {
          setInitialRecurrenceEndDate(undefined);
       }
    } else {
       setInitialRecurrenceEndDate(undefined);
    }
    
    setIsBookingModalOpen(true);
  };

  const handleBookingMove = async (bookingId: string, newStartTime: Date) => {
    if (isGuest) return;
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    if (!isAdmin && booking.userId !== currentUser?.uid) {
      alert("You can only move your own bookings.");
      return;
    }

    const durationMinutes = differenceInMinutes(booking.endTime, booking.startTime);
    const newEndTime = addMinutes(newStartTime, durationMinutes);
    const conflict = isOverlap(newStartTime, newEndTime, booking.classroomId, bookings, booking.id);
    
    if (conflict) {
      alert("Cannot move booking here: Overlaps with existing booking.");
      return;
    }

    const originalBookings = [...bookings];
    const updatedBooking = { ...booking, startTime: newStartTime, endTime: newEndTime };
    setBookings(prev => prev.map(b => b.id === bookingId ? updatedBooking : b));

    try {
      await api.updateBooking(updatedBooking);
    } catch (e) {
      setBookings(originalBookings);
      alert("Failed to move booking.");
    }
  };

  const handleBookingResize = async (bookingId: string, newEndTime: Date) => {
    if (isGuest) return;
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    if (!isAdmin && booking.userId !== currentUser?.uid) {
      alert("You can only resize your own bookings.");
      return;
    }

    const conflict = isOverlap(booking.startTime, newEndTime, booking.classroomId, bookings, booking.id);
    if (conflict) {
      alert("Cannot resize booking: Overlaps with existing booking.");
      return;
    }

    const originalBookings = [...bookings];
    const updatedBooking = { ...booking, endTime: newEndTime };
    setBookings(prev => prev.map(b => b.id === bookingId ? updatedBooking : b));

    try {
      await api.updateBooking(updatedBooking);
    } catch (e) {
      setBookings(originalBookings);
      alert("Failed to resize booking.");
    }
  };

  const checkConflictInApp = (start: Date, end: Date, excludeId?: string, excludeSeriesId?: string): Booking | null => {
    if (!selectedClassroom) return null;
    return findOverlappingBooking(start, end, selectedClassroomId, bookings, excludeId, excludeSeriesId) || null;
  };

  const handleSaveBooking = async (data: Partial<Booking>, recurrenceEnd?: Date, updateScope: 'single' | 'series' = 'series') => {
    if (!currentUser) return;
    
    // Period Warning for new bookings
    if (data.startTime && (data.startTime < periodStart || data.startTime > periodEnd)) {
        if (!confirm("This booking is outside your currently active Period. It will be saved but won't be visible until you change the period settings. Continue?")) {
            return;
        }
    }

    let baseBooking: Omit<Booking, 'id'> = {
      title: data.title!,
      description: data.description,
      organizer: data.organizer!,
      startTime: data.startTime!,
      endTime: data.endTime!,
      classroomId: selectedClassroomId,
      type: data.type!,
      color: data.color!,
      seriesId: data.seriesId, 
      userId: currentUser.uid, 
      userEmail: currentUser.email || 'Unknown',
    };

    let newBookingsToAdd: Booking[] = [];

    // RECURRENCE LOGIC
    if (data.type !== BookingType.ONE_TIME && recurrenceEnd) {
       
       // TIME SHIFT / BACKTRACKING LOGIC:
       if (editingBooking && editingBooking.seriesId && updateScope === 'series') {
          const seriesBookings = bookings.filter(b => b.seriesId === editingBooking.seriesId);
          seriesBookings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
          const index = seriesBookings.findIndex(b => b.id === editingBooking.id);
          
          if (index !== -1 && seriesBookings.length > 0) {
             let newSeriesStart = new Date(baseBooking.startTime);
             let newSeriesEnd = new Date(baseBooking.endTime);

             if (data.type === BookingType.RECURRING_WEEKLY) {
                 newSeriesStart = addWeeks(newSeriesStart, -index);
                 newSeriesEnd = addWeeks(newSeriesEnd, -index);
             } else if (data.type === BookingType.RECURRING_WEEKDAY) {
                 let count = 0;
                 while (count < index) {
                     newSeriesStart = addDays(newSeriesStart, -1);
                     newSeriesEnd = addDays(newSeriesEnd, -1);
                     if (!isWeekend(newSeriesStart)) {
                         count++;
                     }
                 }
             }
             
             baseBooking.startTime = newSeriesStart;
             baseBooking.endTime = newSeriesEnd;
          }
       }
       
       if (updateScope === 'series' || !editingBooking) {
           newBookingsToAdd = generateRecurringBookings(baseBooking, recurrenceEnd, data.type!);
       } else {
           newBookingsToAdd = []; 
       }
    } else {
       // One-time
       newBookingsToAdd = [{
         ...baseBooking,
         id: editingBooking?.id || crypto.randomUUID(),
         seriesId: data.type === BookingType.ONE_TIME ? undefined : editingBooking?.seriesId,
       }];
    }

    // --- BATCH CONFLICT CHECK ---
    for (const nb of newBookingsToAdd) {
        // Only check conflicts if the generated booking is within the loaded period
        // Otherwise we don't have the data to check against anyway
        if (nb.startTime >= periodStart && nb.startTime <= periodEnd) {
            const conflict = findOverlappingBooking(
                nb.startTime, 
                nb.endTime, 
                selectedClassroomId, 
                bookings, 
                editingBooking?.id, 
                (editingBooking && updateScope === 'series') ? editingBooking.seriesId : undefined 
            );

            if (conflict) {
                alert(
                  `Conflict detected on ${format(nb.startTime, 'MMM d, yyyy')} at ${format(nb.startTime, 'h:mm a')}.\n\n` +
                  `Overlaps with: ${conflict.title}\n` + 
                  `Time: ${format(conflict.startTime, 'h:mm a')} - ${format(conflict.endTime, 'h:mm a')}`
                );
                return;
            }
        }
    }

    try {
      if (editingBooking) {
          const isSeriesUpdate = (newBookingsToAdd.length > 1) && (updateScope === 'series');
          
          if (isSeriesUpdate) {
            if (editingBooking.seriesId) {
                await api.deleteBookingSeries(editingBooking.seriesId);
                setBookings(prev => prev.filter(b => b.seriesId !== editingBooking.seriesId));
            } else {
                await api.deleteBooking(editingBooking.id);
                setBookings(prev => prev.filter(b => b.id !== editingBooking.id));
            }
            
            await api.createBookings(newBookingsToAdd);
            setBookings(prev => [...prev, ...newBookingsToAdd]);

          } else {
             const updatedInstance = {
                 ...baseBooking,
                 id: editingBooking.id,
                 seriesId: editingBooking.seriesId 
             };
             
             await api.updateBooking(updatedInstance);
             setBookings(prev => prev.map(b => b.id === editingBooking.id ? updatedInstance : b));
          }

      } else {
          await api.createBookings(newBookingsToAdd);
          // Only add to local state if it falls within the period
          const visibleNewBookings = newBookingsToAdd.filter(b => b.startTime >= periodStart && b.startTime <= periodEnd);
          setBookings(prev => [...prev, ...visibleNewBookings]);
      }
      setIsBookingModalOpen(false);
    } catch (e) {
      alert("Failed to save booking.");
      console.error(e);
    }
  };

  const handleDeleteBooking = async (id: string, deleteSeries: boolean) => {
    try {
      if (deleteSeries) {
        const booking = bookings.find(b => b.id === id);
        if (booking && booking.seriesId) {
          await api.deleteBookingSeries(booking.seriesId);
          setBookings(prev => prev.filter(b => b.seriesId !== booking.seriesId));
        }
      } else {
        await api.deleteBooking(id);
        setBookings(prev => prev.filter(b => b.id !== id));
      }
      setIsBookingModalOpen(false);
    } catch (e) {
      alert("Failed to delete booking.");
    }
  };

  if (isAuthLoading) {
     return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neu-base text-gray-500 gap-4">
        <Loader2 className="animate-spin text-primary-500" size={48} />
      </div>
    );
  }

  if (isAccessDenied) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neu-base p-6">
        <div className="bg-neu-base rounded-3xl shadow-neu-pressed p-8 max-w-md w-full text-center border-l-4 border-red-500 flex flex-col items-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-6">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Login 
        onLogin={handleLogin} 
        onGuestLogin={handleGuestLogin}
        isLoading={isLoginLoading} 
      />
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neu-base text-gray-500 gap-4">
        <Loader2 className="animate-spin text-primary-500" size={48} />
        <p className="text-lg font-medium animate-pulse">Loading schedule...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neu-base text-slate-700 font-sans">
      <header className="bg-neu-base z-[60] px-8 py-4 flex flex-col md:flex-row items-center justify-between no-print h-auto md:h-20 shrink-0 shadow-sm relative gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 w-full md:w-auto">
          <div className="flex items-center gap-3 text-gray-700">
            <div className="p-2 bg-neu-base rounded-xl shadow-neu">
               <BookOpen size={24} className="text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-800">Classroom Booking</h1>
          </div>
          <div className="h-px w-full md:h-10 md:w-px bg-gray-300/50 shadow-[1px_0_0_#fff]"></div>
          
          {/* Period Selector Toggle */}
          <div className="relative z-[60]">
             <button 
                onClick={() => setIsPeriodSelectorOpen(!isPeriodSelectorOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${isPeriodSelectorOpen ? 'bg-primary-100 text-primary-700 shadow-neu-pressed' : 'bg-neu-base shadow-neu text-gray-600 hover:text-primary-600'}`}
                title="Set the active date range for checking conflicts and loading data. Bookings outside this range are hidden."
             >
                <Filter size={16} />
                <span className="hidden sm:inline">Active Period</span>
             </button>
             
             {isPeriodSelectorOpen && (
                <div className="absolute top-12 left-0 bg-neu-base p-4 rounded-xl shadow-neu z-[100] w-64 border border-white/40 animate-in fade-in zoom-in-95 duration-200">
                   <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Conflict Detection Range</h4>
                   <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-400 font-bold block mb-1">Start Date</label>
                        <input 
                           type="date" 
                           value={format(periodStart, 'yyyy-MM-dd')}
                           onChange={(e) => e.target.value && setPeriodStart(new Date(e.target.value))}
                           className="w-full px-3 py-2 bg-neu-base rounded-lg shadow-neu-pressed text-sm outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 font-bold block mb-1">End Date</label>
                        <input 
                           type="date" 
                           value={format(periodEnd, 'yyyy-MM-dd')}
                           onChange={(e) => e.target.value && setPeriodEnd(new Date(e.target.value))}
                           className="w-full px-3 py-2 bg-neu-base rounded-lg shadow-neu-pressed text-sm outline-none focus:ring-1 focus:ring-primary-400"
                        />
                      </div>
                      <button 
                         onClick={() => setIsPeriodSelectorOpen(false)}
                         className="w-full py-2 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 text-xs font-bold uppercase mt-2 flex items-center justify-center gap-2"
                      >
                         <RefreshCw size={12} /> Apply & Reload
                      </button>
                   </div>
                </div>
             )}
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-center">
             <button onClick={handlePrevWeek} className="w-10 h-10 flex items-center justify-center rounded-xl bg-neu-base shadow-neu text-gray-600 hover:text-primary-600 active:shadow-neu-pressed transition-all"><ChevronLeft size={20} /></button>
             <div className="flex flex-col items-center min-w-[160px] px-4 py-2 bg-neu-base rounded-xl shadow-neu-pressed">
                <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{formatMonthYear(currentDate)}</span>
                <span className="text-xs text-primary-600 font-medium">Week {format(currentDate, 'w')}</span>
             </div>
             <button onClick={handleNextWeek} className="w-10 h-10 flex items-center justify-center rounded-xl bg-neu-base shadow-neu text-gray-600 hover:text-primary-600 active:shadow-neu-pressed transition-all"><ChevronRight size={20} /></button>
             <button onClick={handleJumpToday} className="hidden sm:block ml-4 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 bg-neu-base rounded-xl shadow-neu hover:text-primary-600 active:shadow-neu-pressed transition-all">This Week</button>
             <div className="relative ml-2">
                <input type="date" className="w-10 h-10 opacity-0 absolute inset-0 cursor-pointer z-10" onChange={handleDatePick} />
                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-neu-base shadow-neu text-gray-500 hover:text-primary-600 active:shadow-neu-pressed transition-all"><Calendar size={18} /></button>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="relative flex-1 md:flex-none">
            <select value={selectedClassroomId} onChange={(e) => setSelectedClassroomId(e.target.value)} className="appearance-none pl-5 pr-10 py-2.5 bg-neu-base rounded-xl shadow-neu-pressed text-sm font-bold text-gray-700 outline-none focus:ring-1 focus:ring-primary-400 w-full md:min-w-[200px] cursor-pointer">
              {classrooms.length === 0 && <option value="">No Classrooms</option>}
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"><ChevronLeft size={16} className="-rotate-90" /></div>
          </div>

          <div className="flex gap-4">
            {isAdmin && (
              <button onClick={() => setIsClassroomModalOpen(true)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-neu-base shadow-neu text-gray-500 hover:text-gray-800 active:shadow-neu-pressed transition-all" title="Manage Classrooms (Admin)"><Settings size={20} /></button>
            )}
            <button onClick={handlePrint} className="w-10 h-10 flex sm:w-auto sm:px-5 sm:py-2.5 items-center justify-center gap-2 bg-neu-base text-gray-700 text-sm font-bold rounded-xl shadow-neu hover:text-primary-600 active:shadow-neu-pressed transition-all" title="Print Schedule">
                <Printer size={18} /><span className="hidden sm:inline">Print</span>
            </button>
            <div className="group relative flex items-center justify-center" title={currentUser.displayName || currentUser.email || 'User'}>
               <div className="w-10 h-10 flex items-center justify-center rounded-full bg-neu-base shadow-neu overflow-hidden border-2 border-transparent hover:border-white/50 transition-all">
                 {currentUser.photoURL ? <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" /> : <UserIcon size={20} className="text-gray-500" />}
               </div>
               <div className="absolute right-0 top-12 w-auto whitespace-nowrap bg-gray-800 text-white text-xs rounded px-2 py-1 hidden group-hover:block z-50 shadow-lg">{currentUser.email} {isAdmin ? '(Admin)' : ''}</div>
            </div>
            <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center rounded-xl bg-neu-base shadow-neu text-red-500 hover:text-red-600 active:shadow-neu-pressed transition-all" title="Sign Out"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <div className="hidden print-only p-6 border-b border-gray-300">
         <h1 className="text-3xl font-bold mb-4">Classroom Booking Schedule</h1>
         <div className="flex justify-between items-end border-t border-gray-200 pt-4">
            <div><p className="text-sm text-gray-500 uppercase">Classroom</p><p className="text-2xl font-bold">{selectedClassroom?.name}</p></div>
            <div className="text-right"><p className="text-sm text-gray-500 uppercase">Period</p><p className="text-xl font-semibold">{formatMonthYear(currentDate)}</p></div>
         </div>
      </div>

      <main className="flex-1 overflow-hidden p-2 sm:p-6 md:p-8 print:p-0 print:overflow-visible print:h-auto print:block">
        <WeekCalendar 
          currentDate={currentDate}
          selectedClassroom={selectedClassroom}
          bookings={bookings}
          onSlotClick={handleSlotClick}
          onBookingClick={handleBookingClick}
          onBookingMove={handleBookingMove}
          onBookingResize={handleBookingResize}
          isGuest={isGuest}
        />
      </main>

      <Modal isOpen={isBookingModalOpen} onClose={() => setIsBookingModalOpen(false)} title={editingBooking ? "Edit Booking" : "New Booking"}>
        <BookingForm
          initialDate={newBookingParams?.date}
          initialStartTime={newBookingParams?.time}
          existingBooking={editingBooking}
          classroomId={selectedClassroomId}
          onSave={handleSaveBooking}
          onDelete={handleDeleteBooking}
          checkConflict={checkConflictInApp}
          isOverlapWarning={isOverlapWarning}
          setIsOverlapWarning={setIsOverlapWarning}
          currentUser={currentUser}
          isAdmin={isAdmin}
          isGuest={isGuest}
          initialRecurrenceEndDate={initialRecurrenceEndDate}
        />
      </Modal>

      <Modal isOpen={isClassroomModalOpen} onClose={() => setIsClassroomModalOpen(false)} title="Manage Classrooms">
        <ClassroomManager 
          classrooms={classrooms}
          onAdd={handleAddClassroom}
          onUpdate={handleUpdateClassroom}
          onDelete={handleDeleteClassroom}
        />
      </Modal>

      {/* PRINT OPTIONS MODAL */}
      <Modal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} title="Print Schedule">
         <div className="space-y-6">
            <div className="p-4 bg-neu-base rounded-xl shadow-neu-pressed">
               <h4 className="font-bold text-gray-600 mb-4 uppercase text-xs tracking-wide">Quick Print</h4>
               <button 
                   onClick={() => handleConfirmPrint('current')}
                   className="w-full py-4 bg-primary-600 text-white font-bold rounded-xl shadow-md hover:bg-primary-700 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                   <FileText size={20} /> Print Current Week
                </button>
            </div>

            <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase font-bold">Advanced Options</span>
                <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <div className="p-4 bg-neu-base rounded-xl shadow-neu-pressed">
               <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-gray-600 uppercase text-xs tracking-wide">Print Date Range</h4>
                  {!showPrintRange && (
                     <button 
                        onClick={() => setShowPrintRange(true)}
                        className="text-primary-600 text-xs font-bold hover:underline"
                     >
                        Configure...
                     </button>
                  )}
               </div>

               {showPrintRange && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                     <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                           <label className="text-xs text-gray-400 font-bold block mb-1">Start Date</label>
                           <input 
                              type="date" 
                              value={printStartDate} 
                              onChange={(e) => setPrintStartDate(e.target.value)}
                              className="w-full px-3 py-2 bg-neu-base rounded-lg shadow-neu-pressed text-sm outline-none focus:ring-1 focus:ring-primary-400"
                           />
                        </div>
                        <div>
                           <label className="text-xs text-gray-400 font-bold block mb-1">End Date</label>
                           <input 
                              type="date" 
                              value={printEndDate} 
                              onChange={(e) => setPrintEndDate(e.target.value)}
                              className="w-full px-3 py-2 bg-neu-base rounded-lg shadow-neu-pressed text-sm outline-none focus:ring-1 focus:ring-primary-400"
                           />
                        </div>
                     </div>
                     <button 
                        onClick={() => handleConfirmPrint('range')}
                        className="w-full py-3 bg-neu-base text-gray-700 border border-gray-300 font-bold rounded-xl shadow-sm hover:text-primary-600 hover:border-primary-400 transition-all flex items-center justify-center gap-2"
                     >
                        <CalendarRange size={18} /> Print Range
                     </button>
                  </div>
               )}
            </div>
         </div>
      </Modal>

      {/* HIDDEN PRINT CONTAINER FOR RANGE PRINTING */}
      <div id="print-container">
         {weeksToPrint.map((weekDate, index) => (
             <div key={index} className="break-after-page min-h-screen">
                 <div className="p-6 border-b border-gray-300 mb-4">
                    <h1 className="text-3xl font-bold mb-2">Classroom Booking Schedule</h1>
                    <div className="flex justify-between items-end border-t border-gray-200 pt-4">
                        <div><p className="text-sm text-gray-500 uppercase">Classroom</p><p className="text-2xl font-bold">{selectedClassroom?.name}</p></div>
                        <div className="text-right"><p className="text-sm text-gray-500 uppercase">Week Of</p><p className="text-xl font-semibold">{format(weekDate, 'MMM d, yyyy')}</p></div>
                    </div>
                 </div>
                 <div className="print-scale-down">
                    <WeekCalendar 
                        currentDate={weekDate}
                        selectedClassroom={selectedClassroom}
                        bookings={bookings}
                        onSlotClick={() => {}}
                        onBookingClick={() => {}}
                        onBookingMove={() => {}}
                        onBookingResize={() => {}}
                        isGuest={true} // Read only for print
                    />
                 </div>
             </div>
         ))}
      </div>

    </div>
  );
};

export default App;
