import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeacherSocket } from '../hooks/useTeacherSocket';
import { PlusCircle, Play, Clock, ChevronRight } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

interface Props {
  onLogout: () => void;
}

export const TeacherDashboard: React.FC<Props> = ({ onLogout }) => {
  const { isConnected, activeSession, history, createSession } = useTeacherSocket();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogoutClick = () => {
      if (activeSession && activeSession.isActive) {
          setShowLogoutModal(true);
      } else {
          onLogout();
      }
  };

  const confirmLogout = () => {
        setShowLogoutModal(false);
        onLogout();
  };

  // If an active session is detected, simple redirection is risky as it might auto-redirect on login.
  // Instead we show a prominent "Resume" card.
  
  const handleCreateSession = () => {
      createSession();
      // We rely on the activeSession state update to show the resume button, 
      // or we can add a listener for 'dashboard:session_created' specifically if we want auto-redirect.
      // For now, the UI update is sufficient.
  };

  useEffect(() => {
      if (activeSession) {
          // Optional: Auto redirect if we know it was just created?
          // Since we can't easily distinguish 'just created' vs 'already active upon login' without more state,
          // we'll stick to the UI card.
      }
  }, [activeSession]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8">
      <header className="mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">Proctor Dashboard</h1>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
               <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
               <span className="text-xs font-semibold text-gray-600">{isConnected ? 'Connected' : 'Disconnected'}</span>
           </div>
           
           <button 
             onClick={handleLogoutClick}
             className="text-sm font-medium text-red-600 hover:text-red-700 px-4 py-2 hover:bg-red-50 rounded-lg transition-colors"
           >
             Logout
           </button>
        </div>
      </header>

      <ConfirmationModal 
          isOpen={showLogoutModal}
          title="Active Session in Progress"
          message="You have an exam session currently running. Logging out will not stop the session, but you will stop monitoring students. Are you sure you want to logout?"
          confirmText="Logout"
          isDanger={true}
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutModal(false)}
      />

      <main className="max-w-5xl mx-auto space-y-8">
          
          {/* Active Session Card */}
          {activeSession ? (
              <div className="bg-white rounded-xl shadow-sm border border-indigo-100 overflow-hidden">
                  <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                              <Play size={32} fill="currentColor" />
                          </div>
                          <div>
                              <h2 className="text-lg font-bold text-gray-800">Exam Session in Progress</h2>
                              <p className="text-gray-500 text-sm mb-1">Session Code</p>
                              <p className="text-3xl font-mono font-bold text-indigo-600 tracking-wider hover:scale-105 transition-transform origin-left cursor-default">
                                  {activeSession.code}
                              </p>
                              <p className="text-xs text-gray-400 mt-2">
                                  Started: {new Date(activeSession.createdAt).toLocaleTimeString()}
                              </p>
                          </div>
                      </div>
                      
                      <button 
                          onClick={() => navigate(`/teacher/session/${activeSession.code}`)}
                          className="w-full md:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-all transform hover:-translate-y-0.5"
                      >
                          Resume Monitoring &rarr;
                      </button>
                  </div>
              </div>
          ) : (
              <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-300 p-8 flex flex-col items-center justify-center text-center">
                  <div className="mb-4 p-4 bg-gray-50 rounded-full text-gray-400">
                      <Clock size={40} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-700 mb-2">No Active Session</h2>
                  <p className="text-gray-500 mb-6 max-w-sm">Ready to start a new exam? Generating a session code will allow students to connect.</p>
                  <button 
                      onClick={handleCreateSession}
                      className="flex items-center gap-2 px-6 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-lg shadow transition-colors"
                  >
                      <PlusCircle size={20} />
                      Create New Session
                  </button>
              </div>
          )}

          {/* Recent Sessions */}
          <section>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">Recent History</h3>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {history.length === 0 ? (
                      <div className="p-8 text-center text-gray-400">No past sessions found.</div>
                  ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                                    <th className="px-6 py-4 font-semibold">Date</th>
                                    <th className="px-6 py-4 font-semibold">Session Code</th>
                                    <th className="px-6 py-4 font-semibold">Status</th>
                                    <th className="px-6 py-4 font-semibold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {history.map(session => (
                                    <tr key={session.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {new Date(session.createdAt).toLocaleDateString()} <span className="text-gray-400 mx-1">•</span> {new Date(session.createdAt).toLocaleTimeString()}
                                        </td>
                                        <td className="px-6 py-4 font-mono font-medium text-gray-800">
                                            {session.code}
                                        </td>
                                        <td className="px-6 py-4">
                                            {session.isActive ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                    Ended
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => navigate(`/teacher/session/${session.code}`)}
                                                className="text-indigo-600 hover:text-indigo-800 font-medium text-sm inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                View <ChevronRight size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                      </div>
                  )}
              </div>
          </section>
      </main>
    </div>
  );
};
