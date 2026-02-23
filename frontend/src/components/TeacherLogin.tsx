import React, { useState } from 'react';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Card } from './common/Card';
import { API_BASE_URL } from '../config/api';

interface TeacherLoginProps {
  onLogin: () => void;
  onSwitchToStudent: () => void;
}

export const TeacherLogin: React.FC<TeacherLoginProps> = ({ onLogin, onSwitchToStudent }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('teacherToken', data.token);
        onLogin();
      } else {
        setError(data.message || 'Invalid password');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-t-4 border-t-indigo-600" padding="lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Teacher Login</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            error={error}
          />

          <Button type="submit" className="w-full" isLoading={loading}>
            {loading ? 'Authenticating...' : 'Access Dashboard'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Button variant="link" onClick={onSwitchToStudent}>
            Back to Student Login
          </Button>
        </div>
      </Card>
    </div>
  );
};
