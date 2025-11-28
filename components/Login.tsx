import React from 'react';
import { BookOpen, User } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
  onGuestLogin: () => void;
  isLoading: boolean;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onGuestLogin, isLoading }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neu-base p-4">
      <div className="w-full max-w-md bg-neu-base rounded-3xl shadow-neu p-8 flex flex-col items-center text-center border border-white/20">
        
        <div className="p-4 bg-neu-base rounded-2xl shadow-neu mb-6">
          <BookOpen size={48} className="text-primary-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">Classroom Booking</h1>
        <p className="text-gray-500 mb-8">Sign in to manage schedules and book classrooms.</p>

        <div className="w-full space-y-4">
          <button
            onClick={onLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-neu-base text-gray-700 font-bold rounded-xl shadow-neu hover:text-primary-600 hover:shadow-neu-pressed active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span>Connecting...</span>
            ) : (
              <>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase">Or</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <button
            onClick={onGuestLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-neu-base text-gray-600 font-bold text-sm rounded-xl shadow-neu hover:text-gray-800 hover:shadow-neu-pressed active:scale-95 transition-all"
          >
            <User size={18} />
            <span>Continue as Guest</span>
          </button>
        </div>
      </div>
    </div>
  );
};
