import React, { useState } from 'react';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Card } from './common/Card';
import { API_BASE_URL } from '../config/api';

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

  // Detect strictly Google Chrome (excluding Edge, Opera, Safari, Firefox)
  const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor) && !/Edg/.test(navigator.userAgent) && !/OPR/.test(navigator.userAgent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !name || !sessionCode) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/session/${sessionCode}`);
      const data = await res.json();

      if (data.valid) {
        onLogin(studentId, name, sessionCode);
      } else {
        setError(data.reason || 'Invalid session code');
      }
    } catch {
      setError('Failed to validate session. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" padding="lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Student Login</h1>

        {!isChrome && (
          <div className="mb-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded">
            <strong>Warning: Unsupported Browser</strong>
            <p className="mt-1 text-sm">
              Please use Google Chrome for this exam. Other browsers (like Safari) suspend background tabs and may cause you to be incorrectly marked as offline or disconnected.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="name"
            name="name"
            autoComplete="name"
            label="Full Name"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            id="studentId"
            name="studentId"
            autoComplete="username"
            label="Student ID"
            placeholder="12345"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))}
            required
            inputMode="numeric"
          />

          <Input
            id="sessionCode"
            name="sessionCode"
            autoComplete="off"
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
