import React, { useState, useEffect } from 'react';
import { 
  addWeeks, 
  setHours, 
  format,
  differenceInMinutes,
  addMinutes
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
  ShieldAlert
} from 'lucide-react';

import { WeekCalendar } from './components/WeekCalendar';
import { Modal } from './components/ui/Modal';
import { BookingForm } from './components/BookingForm';
import { ClassroomManager } from './components/ClassroomManager';
import { Login } from './components/Login';
import { Booking, Classroom, BookingType, UserProfile } from './types';
import { generateRecurringBookings, isOverlap, formatMonthYear } from './utils/dateUtils';
import { api } from './services/api';
import { auth, googleProvider } from './services/firebase';
import firebase from 'firebase/compat/app';

// --- CONFIGURATION ---

// 1. ADMINS: These emails have full access.
const ADMIN_EMAILS = [
  'shenglanko@wagor.tc.edu.tw', 
  'karencheng@wagor.tc.edu.tw',
  'sandy@wagor.tc.edu.tw', 
  'torreswang@wagor.tc.edu.tw',
];

// 2. DOMAIN RESTRICTION:
const ALLOWED_DOMAIN = 'wagor.tc.edu.tw'; 

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
  
  // Modals
  const [isClassroomModalOpen, setIsClassroomModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  
  // Booking Form State
  const [editingBooking, setEditingBooking] = useState<Booking | undefined>(undefined);
  const [newBookingParams, setNewBookingParams] = useState<{ date: Date, time: Date } | undefined>(undefined);
  const [isOverlapWarning, setIsOverlapWarning] = useState(false);

  // Derived
  const selectedClassroom = classrooms.find(c => c.id === selectedClassroomId);
  
  // Check Admin Role (Case Insensitive)
  const isAdmin = isGuest ? false : (currentUser?.email ? ADMIN_EMAILS.map(e => e.toLowerCase()).includes(currentUser.email.toLowerCase()) : false);

  // Helper: Check Permissions
  const checkUserPermissions = (user: firebase.User | null): boolean => {
    if (!user || !user.email) return false;

    const userEmail = user.email.toLowerCase();
    const isAdminUser = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail);

    // If Admin, always allow
    if (isAdminUser) return true;

    // If Domain Restriction is active
    if (ALLOWED_DOMAIN) {
      const requiredDomain = '@' + ALLOWED_DOMAIN.toLowerCase();
      if (!userEmail.endsWith(requiredDomain)) {
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
           setIsAccessDenied(true);
           setCurrentUser({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL
           });
           setIsAuthLoading(false);
           return;
        }

        setIsAccessDenied(false);
        setCurrentUser({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        });
        setIsGuest(false);
        loadData();
      } else {
        if (!isGuest) {
          setCurrentUser(null);
          setIsAccessDenied(false);
          setBookings([]);
          setClassrooms([]);
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [isGuest]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedClassrooms, fetchedBookings] = await Promise.all([
        api.fetchClassrooms(),
        api.fetchBookings()
      ]);
      
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

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    try {
      if (window.location.protocol === 'file:') {
        alert("Authentication Error: You are running this file directly from your computer (file://).\n\nFirebase Auth requires a web server.");
        return;
      }
      
      if (isLoginLoading) return;
      setIsLoginLoading(true);
      
      const result = await auth.signInWithPopup(googleProvider);
      
      // IMMEDIATE SECURITY CHECK
      if (result.user) {
        const isAllowed = checkUserPermissions(result.user);
        if (!isAllowed) {
          setIsAccessDenied(true);
          // Don't alert here, let the UI handle it
        }
      }
      
    } catch (error: any) {
      console.error("Login initiation failed", error);
      alert(`Login failed: ${error.message}`);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleGuestLogin = () => {
    setIsGuest(true);
    setIsAccessDenied(false);
    setCurrentUser({
      uid: 'guest-' + Math.random().toString(36).substr(2, 9),
      email: 'guest@demo.com',
      displayName: 'Guest User',
      photoURL: null
    });
    loadData();
  };

  const handleLogout = async () => {
    if (isGuest) {
      setIsGuest(false);
      setCurrentUser(null);
      setIsAccessDenied(false);
    } else {
      await auth.signOut();
      setCurrentUser(null);
      setIsAccessDenied(false);
    }
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
    window.print();
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
      alert("Guest accounts are Read-Only. Please Sign In to create bookings.");
      return;
    }
    setEditingBooking(undefined);
    const time = setHours(date, hour);
    time.setMinutes(0);
    setNewBookingParams({ date, time });
    setIsBookingModalOpen(true);
  };

  const handleBookingClick = (booking: Booking) => {
    setEditingBooking(booking);
    setNewBookingParams(undefined);
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

  const checkConflictInApp = (start: Date, end: Date, excludeId?: string) => {
    if (!selectedClassroom) return false;
    return isOverlap(start, end, selectedClassroomId, bookings, excludeId);
  };

  const handleSaveBooking = async (data: Partial<Booking>, recurrenceEnd?: Date) => {
    if (!currentUser) return;

    const baseBooking: Omit<Booking, 'id'> = {
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

    if (data.type !== BookingType.ONE_TIME && recurrenceEnd) {
       newBookingsToAdd = generateRecurringBookings(baseBooking, recurrenceEnd, data.type!);
    } else {
       newBookingsToAdd = [{
         ...baseBooking,
         id: editingBooking?.id || crypto.randomUUID(),
         seriesId: data.type === BookingType.ONE_TIME ? undefined : editingBooking?.seriesId,
       }];
    }

    try {
      if (editingBooking) {
          if (newBookingsToAdd.length > 1) {
            await api.createBookings(newBookingsToAdd);
            setBookings(prev => {
               const others = prev.filter(b => b.id !== editingBooking.id);
               return [...others, ...newBookingsToAdd];
            });
          } else {
             await api.updateBooking(newBookingsToAdd[0]);
             setBookings(prev => prev.map(b => b.id === editingBooking.id ? newBookingsToAdd[0] : b));
          }
      } else {
          await api.createBookings(newBookingsToAdd);
          setBookings(prev => [...prev, ...newBookingsToAdd]);
      }
      setIsBookingModalOpen(false);
    } catch (e) {
      alert("Failed to save booking.");
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

  // --- RENDERING ---

  if (isAuthLoading) {
     return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neu-base text-gray-500 gap-4">
        <Loader2 className="animate-spin text-primary-500" size={48} />
      </div>
    );
  }

  // >>> ACCESS DENIED SCREEN <<<
  if (isAccessDenied) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neu-base p-6">
        <div className="bg-neu-base rounded-3xl shadow-neu-pressed p-8 max-w-md w-full text-center border-l-4 border-red-500 flex flex-col items-center">
          <div className="p-4 bg-red-50 rounded-full mb-6 text-red-500 shadow-inner">
             <ShieldAlert size={48} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-6">
            You are logged in as <strong>{currentUser?.email}</strong>.
          </p>
          <p className="text-sm text-gray-400 mb-8 bg-gray-100 p-4 rounded-xl">
            This system is restricted to users with <br/>
            <strong className="text-gray-600">@{ALLOWED_DOMAIN}</strong> emails.
          </p>
          <button 
            onClick={handleLogout}
            className="px-6 py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg hover:bg-red-600 transition-all w-full flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Login Screen
  if (!currentUser) {
    return (
      <Login 
        onLogin={handleLogin} 
        onGuestLogin={handleGuestLogin}
        isLoading={isLoginLoading} 
      />
    );
  }

  // Loading Data Screen
  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neu-base text-gray-500 gap-4">
        <Loader2 className="animate-spin text-primary-500" size={48} />
        <p className="text-lg font-medium animate-pulse">Loading schedule...</p>
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="flex flex-col h-full bg-neu-base text-slate-700 font-sans">
      {/* Header */}
      <header className="bg-neu-base z-30 px-8 py-4 flex flex-col md:flex-row items-center justify-between no-print h-auto md:h-20 shrink-0 shadow-sm relative gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 w-full md:w-auto">
          <div className="flex items-center gap-3 text-gray-700">
            <div className="p-2 bg-neu-base rounded-xl shadow-neu">
               <BookOpen size={24} className="text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-800">Classroom Booking</h1>
          </div>
          <div className="h-px w-full md:h-10 md:w-px bg-gray-300/50 shadow-[1px_0_0_#fff]"></div>
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

      {/* Print Header */}
      <div className="hidden print-only p-6 border-b border-gray-300">
         <h1 className="text-3xl font-bold mb-4">Classroom Booking Schedule</h1>
         <div className="flex justify-between items-end border-t border-gray-200 pt-4">
            <div><p className="text-sm text-gray-500 uppercase">Classroom</p><p className="text-2xl font-bold">{selectedClassroom?.name}</p></div>
            <div className="text-right"><p className="text-sm text-gray-500 uppercase">Period</p><p className="text-xl font-semibold">{formatMonthYear(currentDate)}</p></div>
         </div>
      </div>

      {/* Main Content */}
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

      {/* Modals */}
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
    </div>
  );
};

export default App;
