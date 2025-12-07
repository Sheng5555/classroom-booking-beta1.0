import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-neu-base/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neu-base rounded-2xl shadow-neu w-full max-w-lg overflow-hidden transform transition-all scale-100 border border-white/20 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200/50 shrink-0">
          <h3 className="text-xl font-bold text-gray-700 tracking-tight">{title}</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-primary-600 w-8 h-8 flex items-center justify-center rounded-full shadow-neu hover:shadow-neu-pressed transition-all active:scale-95"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
