import { Booking, Classroom } from '../types';
import { db } from './firebase';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// Collection References
const COLLECTIONS = {
  CLASSROOMS: 'classrooms',
  BOOKINGS: 'bookings',
};

// --- Helper Functions ---

// Robust Date Converter
const toDate = (val: any): Date => {
  if (!val) return new Date(); 
  if (val instanceof firebase.firestore.Timestamp) return val.toDate();
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'seconds' in val) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
};

// Convert Firestore Document to Classroom Object
const convertDocToClassroom = (doc: any): Classroom => {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    equipment: data.equipment || [],
  };
};

// Convert Firestore Document to Booking Object
const convertDocToBooking = (doc: any): Booking => {
  const data = doc.data();
  return {
    id: doc.id,
    classroomId: data.classroomId,
    title: data.title,
    description: data.description,
    organizer: data.organizer,
    startTime: toDate(data.startTime),
    endTime: toDate(data.endTime),
    type: data.type,
    seriesId: data.seriesId,
    color: data.color,
    userId: data.userId,
    userEmail: data.userEmail,
  };
};

export const api = {
  // --- Classrooms ---
  
  async fetchClassrooms(): Promise<Classroom[]> {
    const snapshot = await db.collection(COLLECTIONS.CLASSROOMS).get();
    return snapshot.docs.map(convertDocToClassroom);
  },

  async addClassroom(classroom: Classroom): Promise<Classroom> {
    await db.collection(COLLECTIONS.CLASSROOMS).doc(classroom.id).set({
      name: classroom.name,
      equipment: classroom.equipment || []
    });
    return classroom;
  },

  async updateClassroom(classroom: Classroom): Promise<Classroom> {
    await db.collection(COLLECTIONS.CLASSROOMS).doc(classroom.id).update({
      name: classroom.name,
      equipment: classroom.equipment || []
    });
    return classroom;
  },

  async deleteClassroom(id: string): Promise<void> {
    const batch = db.batch();
    const classroomRef = db.collection(COLLECTIONS.CLASSROOMS).doc(id);
    batch.delete(classroomRef);

    const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
      .where("classroomId", "==", id)
      .get();
    
    snapshot.forEach((doc: any) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  },

  // --- Bookings ---

  async fetchBookings(): Promise<Booking[]> {
    const snapshot = await db.collection(COLLECTIONS.BOOKINGS).get();
    return snapshot.docs.map(convertDocToBooking);
  },

  async createBookings(newBookings: Booking[]): Promise<Booking[]> {
    const batch = db.batch();

    newBookings.forEach((booking) => {
      const docRef = db.collection(COLLECTIONS.BOOKINGS).doc(booking.id);
      
      const bookingData = {
        ...booking,
        startTime: firebase.firestore.Timestamp.fromDate(booking.startTime),
        endTime: firebase.firestore.Timestamp.fromDate(booking.endTime),
      };
      
      // Clean up undefined
      if (booking.seriesId === undefined) delete (bookingData as any).seriesId;
      if (booking.description === undefined) delete (bookingData as any).description;
      if (booking.userId === undefined) delete (bookingData as any).userId;
      if (booking.userEmail === undefined) delete (bookingData as any).userEmail;

      batch.set(docRef, bookingData);
    });

    await batch.commit();
    return newBookings;
  },

  async updateBooking(booking: Booking): Promise<Booking> {
    const docRef = db.collection(COLLECTIONS.BOOKINGS).doc(booking.id);
    
    const updateData: any = {
      title: booking.title,
      organizer: booking.organizer,
      type: booking.type,
      startTime: firebase.firestore.Timestamp.fromDate(booking.startTime),
      endTime: firebase.firestore.Timestamp.fromDate(booking.endTime),
      color: booking.color,
    };

    if (booking.seriesId) updateData.seriesId = booking.seriesId;
    if (booking.description) updateData.description = booking.description;
    // We generally don't update userId/userEmail to prevent hijacking

    await docRef.update(updateData);
    return booking;
  },

  async deleteBooking(id: string): Promise<void> {
    await db.collection(COLLECTIONS.BOOKINGS).doc(id).delete();
  },

  async deleteBookingSeries(seriesId: string): Promise<void> {
    const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
      .where("seriesId", "==", seriesId)
      .get();

    const batch = db.batch();
    snapshot.forEach((doc: any) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }
};
