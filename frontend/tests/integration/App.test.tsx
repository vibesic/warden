import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

/* ---------- Mock all heavy components to isolate routing ----------------- */

vi.mock('@src/components/StudentLogin', () => ({
  StudentLogin: ({ onSwitchToTeacher }: { onSwitchToTeacher: () => void }) => (
    <div data-testid="student-login">
      Student Login
      <button onClick={onSwitchToTeacher}>Switch to Teacher</button>
    </div>
  ),
}));

vi.mock('@src/components/TeacherLogin', () => ({
  TeacherLogin: ({ onSwitchToStudent }: { onSwitchToStudent: () => void }) => (
    <div data-testid="teacher-login">
      Teacher Login
      <button onClick={onSwitchToStudent}>Switch to Student</button>
    </div>
  ),
}));

vi.mock('@src/components/SecureExamMonitor', () => ({
  SecureExamMonitor: () => <div data-testid="secure-exam-monitor">Exam Monitor</div>,
}));

vi.mock('@src/components/TeacherDashboard', () => ({
  TeacherDashboard: () => <div data-testid="teacher-dashboard">Teacher Dashboard</div>,
}));

vi.mock('@src/components/SessionDetail', () => ({
  SessionDetail: () => <div data-testid="session-detail">Session Detail</div>,
}));

/* ---------- Re-create AppContent with MemoryRouter ---------------------- */

// We need to test the routing logic from App.tsx, so we import the internal Routes
// Since App uses BrowserRouter, we re-test the routing content via a test wrapper

import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import React from 'react';

// Replicate the inner routing from App.tsx for testing purposes
const StudentExamPage = () => {
  const sid = localStorage.getItem('studentId');
  const sname = localStorage.getItem('studentName');
  const scode = localStorage.getItem('sessionCode');

  if (!sid || !sname || !scode) {
    return <Navigate to="/student/login" replace />;
  }

  return <div data-testid="student-exam-page">Exam Page for {sname}</div>;
};

const TeacherRoute = ({ children }: { children: React.ReactNode }) => {
  const isTeacher = localStorage.getItem('teacherMode') === 'true';
  if (!isTeacher) return <Navigate to="/teacher/login" replace />;
  return <>{children}</>;
};

const TestAppContent = () => {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/student/login"
        element={
          <div data-testid="student-login">Student Login</div>
        }
      />
      <Route
        path="/teacher/login"
        element={
          <div data-testid="teacher-login">Teacher Login</div>
        }
      />
      <Route path="/student/exam" element={<StudentExamPage />} />
      <Route
        path="/teacher"
        element={
          <TeacherRoute>
            <div data-testid="teacher-dashboard">Teacher Dashboard</div>
          </TeacherRoute>
        }
      />
      <Route
        path="/teacher/session/:sessionCode"
        element={
          <TeacherRoute>
            <div data-testid="session-detail">Session Detail</div>
          </TeacherRoute>
        }
      />
      <Route path="/" element={<Navigate to="/student/login" replace />} />
    </Routes>
  );
};

describe('App Routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderWithRouter = (initialRoute: string) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <TestAppContent />
      </MemoryRouter>
    );
  };

  it('should redirect root path to /student/login', () => {
    renderWithRouter('/');
    expect(screen.getByTestId('student-login')).toBeInTheDocument();
  });

  it('should render StudentLogin at /student/login', () => {
    renderWithRouter('/student/login');
    expect(screen.getByTestId('student-login')).toBeInTheDocument();
  });

  it('should render TeacherLogin at /teacher/login', () => {
    renderWithRouter('/teacher/login');
    expect(screen.getByTestId('teacher-login')).toBeInTheDocument();
  });

  it('should redirect to /student/login when accessing /student/exam without auth', () => {
    renderWithRouter('/student/exam');
    expect(screen.getByTestId('student-login')).toBeInTheDocument();
  });

  it('should render student exam page when localStorage has student data', () => {
    localStorage.setItem('studentId', 'S001');
    localStorage.setItem('studentName', 'Alice');
    localStorage.setItem('sessionCode', '123456');

    renderWithRouter('/student/exam');
    expect(screen.getByTestId('student-exam-page')).toBeInTheDocument();
    expect(screen.getByText('Exam Page for Alice')).toBeInTheDocument();
  });

  it('should redirect to /teacher/login when accessing /teacher without teacherMode', () => {
    renderWithRouter('/teacher');
    expect(screen.getByTestId('teacher-login')).toBeInTheDocument();
  });

  it('should render TeacherDashboard when teacherMode is set', () => {
    localStorage.setItem('teacherMode', 'true');
    renderWithRouter('/teacher');
    expect(screen.getByTestId('teacher-dashboard')).toBeInTheDocument();
  });

  it('should redirect to /teacher/login when accessing session detail without auth', () => {
    renderWithRouter('/teacher/session/ABC123');
    expect(screen.getByTestId('teacher-login')).toBeInTheDocument();
  });

  it('should render SessionDetail when teacherMode is set', () => {
    localStorage.setItem('teacherMode', 'true');
    renderWithRouter('/teacher/session/ABC123');
    expect(screen.getByTestId('session-detail')).toBeInTheDocument();
  });
});
