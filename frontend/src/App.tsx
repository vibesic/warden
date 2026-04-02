import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom';
import { API_BASE_URL } from './config/api';

const SecureExamMonitor = React.lazy(() =>
    import('./components/SecureExamMonitor').then(m => ({ default: m.SecureExamMonitor }))
);
const TeacherDashboard = React.lazy(() =>
    import('./components/TeacherDashboard').then(m => ({ default: m.TeacherDashboard }))
);
const SessionDetail = React.lazy(() =>
    import('./components/SessionDetail').then(m => ({ default: m.SessionDetail }))
);
const StudentLogin = React.lazy(() =>
    import('./components/StudentLogin').then(m => ({ default: m.StudentLogin }))
);
const TeacherLogin = React.lazy(() =>
    import('./components/TeacherLogin').then(m => ({ default: m.TeacherLogin }))
);

const LazyFallback: React.FC = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500 text-sm">Loading...</div>
    </div>
);

// Wrapper for Student Exam View
const isValidSessionCode = (code: string): boolean => /^\d{6}$/.test(code);

const StudentExamPage = () => {
    const navigate = useNavigate();
    const sid = localStorage.getItem('studentId');
    const sname = localStorage.getItem('studentName');
    const scode = localStorage.getItem('sessionCode');

    if (!sid || !sname || !scode || !isValidSessionCode(scode)) {
        return <Navigate to="/student/login" replace />;
    }

    const logout = () => {
        localStorage.clear();
        navigate('/student/login');
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <header className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Exam Portal</h1>
                    <p className="text-gray-600">Welcome, {sname} ({sid})</p>
                    <p className="text-sm text-gray-500 mt-1">Session: <span className="font-mono bg-gray-200 px-1 rounded">{scode}</span></p>
                </div>
                <button
                    onClick={logout}
                    className="px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                    Logout
                </button>
            </header>

            <SecureExamMonitor
                studentId={sid}
                studentName={sname}
                sessionCode={scode}
                onLogout={logout}
            />

            <main className="bg-white p-6 rounded shadow-lg max-w-4xl mx-auto mt-8">
                <h2 className="text-xl font-bold mb-4">Exam Instructions</h2>
                <ul className="list-disc pl-5 space-y-2 mb-6 text-gray-700">
                    <li>You may open VS Code and your project folder.</li>
                    <li>Maintain connection to the Exam Wi-Fi at all times.</li>
                    <li>Do not attempt to access the internet via any other means.</li>
                    <li>Keep this browser tab open.</li>
                </ul>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded text-blue-800">
                    <strong>Download Starter Code:</strong> <span className="font-mono">npm install</span> has been pre-run on your machine.
                </div>
            </main>
        </div>
    );
};

// Wrapper for Teacher Views — validates token on mount
const TeacherRoute = () => {
    const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');

    useEffect(() => {
        const isTeacher = sessionStorage.getItem('teacherMode') === 'true';
        const token = sessionStorage.getItem('teacherToken');
        if (!isTeacher || !token) {
            setStatus('invalid');
            return;
        }

        const abortController = new AbortController();

        fetch(`${API_BASE_URL}/api/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: abortController.signal,
        })
            .then(res => {
                if (res.ok) {
                    setStatus('valid');
                } else {
                    sessionStorage.removeItem('teacherMode');
                    sessionStorage.removeItem('teacherToken');
                    setStatus('invalid');
                }
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                // Network error — allow through, socket will handle auth
                setStatus('valid');
            });

        return () => {
            abortController.abort();
        };
    }, []);

    if (status === 'checking') return null;
    if (status === 'invalid') return <Navigate to="/teacher/login" replace />;
    return <Outlet />;
};

const AppContent = () => {
    const navigate = useNavigate();

    // Auth Handlers
    const handleStudentLogin = (sid: string, sname: string, code: string) => {
        localStorage.setItem('studentId', sid);
        localStorage.setItem('studentName', sname);
        localStorage.setItem('sessionCode', code);
        navigate('/student/exam');
    };

    const handleTeacherLogin = () => {
        sessionStorage.setItem('teacherMode', 'true');
        navigate('/teacher');
    };

    const teacherLogout = () => {
        sessionStorage.removeItem('teacherMode');
        sessionStorage.removeItem('teacherToken');
        navigate('/teacher/login');
    };

    return (
        <Suspense fallback={<LazyFallback />}>
            <Routes>
                <Route path="/student/login" element={
                    <StudentLogin
                        onLogin={handleStudentLogin}
                        onSwitchToTeacher={() => navigate('/teacher/login')}
                    />
                } />

                <Route path="/teacher/login" element={
                    <TeacherLogin
                        onLogin={handleTeacherLogin}
                        onSwitchToStudent={() => navigate('/student/login')}
                    />
                } />

                <Route path="/student/exam" element={<StudentExamPage />} />

                <Route element={<TeacherRoute />}>
                    <Route path="/teacher" element={
                        <TeacherDashboard onLogout={teacherLogout} />
                    } />

                    <Route path="/teacher/session/:sessionCode" element={
                        <SessionDetail />
                    } />
                </Route>

                <Route path="/" element={<Navigate to="/student/login" replace />} />
            </Routes>
        </Suspense>
    );
};

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    );
};

export { App };
