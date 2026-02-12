import React, { useState } from 'react';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Card } from './common/Card';

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" padding="lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Exam Student Login</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          
          <Input
            label="Student ID"
            placeholder="12345"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))}
            required
            inputMode="numeric"
          />

          <Input
            label="Session Code"
            placeholder="000000"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            required
            className="font-mono tracking-widest text-center text-lg"
            inputMode="numeric"
          />
          
          {error && <div className="text-red-500 text-sm text-center font-bold">{error}</div>}

          <Button
            type="submit"
            isLoading={loading}
            className="w-full"
          >
            {loading ? 'Verifying...' : 'Enter Exam'}
          </Button>
        </form>

        <div className="mt-6 text-center">
           <Button variant="link" onClick={onSwitchToTeacher}>
               Are you a Teacher?
           </Button>
        </div>
      </Card>
    </div>
  );
};
