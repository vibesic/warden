import React, { useState } from 'react';

interface StudentLoginProps {
  onLogin: (studentId: string, name: string, sessionCode: string) => void;
  onSwitchToTeacher: () => void;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({ onLogin, onSwitchToTeacher }) => {
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !name || !sessionCode) return;

    setLoading(true);
    setError('');

    try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const res = await fetch(`${API_URL}/api/session/${sessionCode}`);
        const data = await res.json();

        if (data.valid) {
            onLogin(studentId, name, sessionCode);
        } else {
            setError(data.reason || 'Invalid session code');
        }
    } catch (err) {
        console.error(err);
        setError('Failed to validate session. Please check connection.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Exam Student Login</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Student ID</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="S12345"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Session Code (PIN)</label>
            <input
              type="text"
              required
              maxLength={6}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border font-mono tracking-widest text-center text-lg"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value)}
              placeholder="000000"
            />
          </div>
          
          {error && <div className="text-red-500 text-sm text-center font-bold">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {loading ? 'Verifying...' : 'Enter Exam'}
          </button>
        </form>

        <div className="mt-4 text-center">
           <button onClick={onSwitchToTeacher} className="text-sm text-gray-500 hover:text-gray-700 underline">
               Are you a Teacher?
           </button>
        </div>
      </div>
    </div>
  );
};
