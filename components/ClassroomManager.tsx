import React, { useState } from 'react';
import { Classroom } from '../types';
import { Trash2, Plus, Edit2, Save, X, Check, AlertTriangle } from 'lucide-react';

interface ClassroomManagerProps {
  classrooms: Classroom[];
  onAdd: (c: Classroom) => void;
  onUpdate: (c: Classroom) => void;
  onDelete: (id: string) => void;
}

export const ClassroomManager: React.FC<ClassroomManagerProps> = ({
  classrooms,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      const classroom = classrooms.find(c => c.id === editingId);
      if (classroom) {
        onUpdate({ ...classroom, name });
      }
      setEditingId(null);
    } else {
      onAdd({
        id: crypto.randomUUID(),
        name,
      });
    }
    setName('');
  };

  const handleEdit = (c: Classroom) => {
    setEditingId(c.id);
    setName(c.name);
    setDeleteConfirmId(null); // Clear any pending delete
  };

  const initiateDelete = (id: string) => {
    setDeleteConfirmId(id);
    setEditingId(null); // Cancel any pending edit
  };

  const confirmDelete = (id: string) => {
    onDelete(id);
    setDeleteConfirmId(null);
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="p-6 rounded-xl shadow-neu-pressed bg-neu-base space-y-4">
        <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wider">
          {editingId ? 'Edit Classroom' : 'Add New Classroom'}
        </h4>
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-neu-base border-none rounded-xl shadow-neu-pressed text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 placeholder-gray-400"
              placeholder="e.g. Room 101"
              required
            />
          </div>
          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded-xl shadow-neu hover:text-gray-800 transition-all active:shadow-neu-pressed"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2 bg-neu-base text-primary-600 font-bold text-sm rounded-xl shadow-neu hover:text-primary-700 transition-all active:shadow-neu-pressed active:scale-95"
            >
              {editingId ? <><Save size={18} /> Update</> : <><Plus size={18} /> Add</>}
            </button>
          </div>
        </div>
      </form>

      <div className="space-y-4">
        <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wider px-2">Existing Classrooms</h4>
        {classrooms.length === 0 && (
          <p className="text-sm text-gray-400 italic px-2">No classrooms added yet.</p>
        )}
        <ul className="space-y-3">
          {classrooms.map((c) => (
            <li key={c.id} className="flex flex-col sm:flex-row justify-between items-center p-4 bg-neu-base rounded-xl shadow-neu min-h-[72px]">
              
              {deleteConfirmId === c.id ? (
                // Delete Confirmation View
                <div className="w-full flex items-center justify-between animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle size={20} />
                    <span className="font-bold text-sm">Delete "{c.name}" and all bookings?</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => cancelDelete()}
                      className="p-2 text-gray-500 rounded-lg shadow-neu hover:shadow-neu-pressed transition-all"
                      title="Cancel"
                    >
                      <X size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(c.id)}
                      className="px-4 py-2 bg-red-50 text-red-600 font-bold text-xs uppercase rounded-lg shadow-neu hover:bg-red-100 active:shadow-neu-pressed transition-all"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              ) : (
                // Normal View
                <>
                  <span className="font-semibold text-gray-700 text-lg w-full sm:w-auto text-center sm:text-left mb-2 sm:mb-0">{c.name}</span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(c)}
                      className="p-2 text-blue-600 rounded-lg shadow-neu hover:shadow-neu-pressed transition-all active:scale-95"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => initiateDelete(c.id)}
                      className="p-2 text-red-500 rounded-lg shadow-neu hover:shadow-neu-pressed transition-all active:scale-95"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
