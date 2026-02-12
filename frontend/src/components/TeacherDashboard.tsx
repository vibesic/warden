import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeacherSocket } from '../hooks/useTeacherSocket';
import { PlusCircle, Play, Clock, ChevronRight } from 'lucide-react';
import { ConfirmationModal } from './common/ConfirmationModal';
import { Header } from './layout/Header';
import { Table, TableColumn } from './common/Table';
import { Button } from './common/Button';
import { Card } from './common/Card';
import { StatusBadge } from './common/StatusBadge';

interface Props {
  onLogout: () => void;
}

export const TeacherDashboard: React.FC<Props> = ({ onLogout }) => {
  const { isConnected, activeSession, history, createSession, endSession } = useTeacherSocket();
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
        if (activeSession && activeSession.isActive) {
            endSession(); // End the session to logout students
        }
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

  const historyColumns: TableColumn<typeof history[0]>[] = [
      {
          header: 'Date',
          cell: (session) => (
              <span className="text-sm text-gray-600">
                  {new Date(session.createdAt).toLocaleDateString()} <span className="text-gray-400 mx-1">•</span> {new Date(session.createdAt).toLocaleTimeString()}
              </span>
          )
      },
      {
          header: 'Session Code',
          cell: (session) => <span className="font-mono font-medium text-gray-800">{session.code}</span>
      },
      {
          header: 'Status',
          cell: (session) => session.isActive ? (
              <StatusBadge status="active" pulse text="Active" />
          ) : (
              <StatusBadge status="inactive" text="Ended" />
          )
      },
      {
          header: 'Action',
          className: 'text-right',
          cell: (session) => (
              <Button 
                  variant="ghost"
                  onClick={() => navigate(`/teacher/session/${session.code}`)}
                  className="text-indigo-600 hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                  View <ChevronRight size={16} className="ml-1" />
              </Button>
          )
      }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8">
      <Header 
        title="Proctor Dashboard" 
        isConnected={isConnected} 
        onLogout={handleLogoutClick} 
      />

      <ConfirmationModal 
          isOpen={showLogoutModal}
          title="Active Session in Progress"
          message="You have an exam session currently running. Logging out will END the session and disconnect all students. Are you sure you want to end the session and logout?"
          confirmText="End Session & Logout"
          isDanger={true}
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutModal(false)}
      />

      <main className="max-w-5xl mx-auto space-y-8">
          
          {/* Active Session Card */}
          {activeSession ? (
              <Card className="border-indigo-100 overflow-hidden" padding="lg">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
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
                      
                      <Button 
                          onClick={() => navigate(`/teacher/session/${activeSession.code}`)}
                          className="w-full md:w-auto px-8 py-3 shadow-sm transform hover:-translate-y-0.5"
                      >
                          Resume Monitoring &rarr;
                      </Button>
                  </div>
              </Card>
          ) : (
              <Card className="border-dashed border-gray-300 flex flex-col items-center justify-center text-center" padding="lg">
                  <div className="mb-4 p-4 bg-gray-50 rounded-full text-gray-400 mx-auto">
                      <Clock size={40} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-700 mb-2">No Active Session</h2>
                  <p className="text-gray-500 mb-6 max-w-sm mx-auto">Ready to start a new exam? Generating a session code will allow students to connect.</p>
                  <Button 
                      onClick={handleCreateSession}
                      variant="secondary"
                      className="gap-2 px-6 py-3 mx-auto"
                      icon={<PlusCircle size={20} />}
                  >
                      Create New Session
                  </Button>
              </Card>
          )}

          {/* Recent Sessions */}
          <section>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">Recent History</h3>
              <Card className="border-gray-200 overflow-hidden" padding="none">
                  <Table 
                      data={history}
                      columns={historyColumns}
                      keyExtractor={(item) => item.id}
                      emptyMessage="No past sessions found."
                  />
              </Card>
          </section>
      </main>
    </div>
  );
};
