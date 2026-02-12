import React, { useState } from 'react';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Card } from './common/Card';

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

          <Button type="submit" className="w-full">
            Access Dashboard
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
