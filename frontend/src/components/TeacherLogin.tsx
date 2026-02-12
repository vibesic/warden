import React, { useState } from 'react';

interface TeacherLoginProps {
  onLogin: () => void;
  onSwitchToStudent: () => void;
}

export const TeacherLogin: React.FC<TeacherLoginProps> = ({ onLogin, onSwitchToStudent }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin' || password === 'teacher') {
        onLogin();
    } else {
        setError('Invalid password');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md border-t-4 border-indigo-600">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Teacher Login</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Access Dashboard
          </button>
        </form>

        <div className="mt-4 text-center">
           <button onClick={onSwitchToStudent} className="text-sm text-gray-500 hover:text-gray-700 underline">
               Back to Student Login
           </button>
        </div>
      </div>
    </div>
  );
};
