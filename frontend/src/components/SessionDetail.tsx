import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTeacherSocket, Violation } from '../hooks/useTeacherSocket';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { ConfirmationModal } from './common/ConfirmationModal';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Header } from './layout/Header';
import { Table, TableColumn } from './common/Table';

export const SessionDetail: React.FC = () => {
    const { sessionCode } = useParams<{ sessionCode: string }>();
    const navigate = useNavigate();
    const { isConnected, students, activeSession, endSession } = useTeacherSocket(sessionCode);
    const [selectedStudent, setSelectedStudent] = useState<{ name: string, violations: Violation[] } | null>(null);
    const [showEndSessionModal, setShowEndSessionModal] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const sortedStudents = Object.values(students).sort((a, b) => a.studentId.localeCompare(b.studentId));

    const handleEndSessionClick = () => {
        setShowEndSessionModal(true);
    };

    const confirmEndSession = () => {
        endSession();
        setShowEndSessionModal(false);
        navigate('/teacher');
    };

    const handleLogoutClick = () => {
        if (activeSession?.isActive) {
            setShowLogoutModal(true);
        } else {
            navigate('/teacher/login');
        }
    };

    const confirmLogout = () => {
        if (activeSession?.isActive) {
            endSession(); // End session on logout
        }
        navigate('/teacher/login');
    };

    const onlineCount = sortedStudents.filter(s => s.isOnline).length;

    const violationColumns: TableColumn<Violation>[] = [
        {
            header: 'Time',
            className: 'px-4 py-3 whitespace-nowrap text-gray-600',
            cell: (v) => new Date(v.timestamp).toLocaleTimeString()
        },
        {
            header: 'Type',
            className: 'px-4 py-3 font-bold text-red-600',
            cell: (v) => v.type.replace(/_/g, ' ')
        },
        {
            header: 'Details',
            className: 'px-4 py-3 text-gray-700',
            cell: (v) => v.details || '-'
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
             <Header
                title={activeSession?.isActive ? 'Session Monitor' : 'Session History'}
                isConnected={isConnected}
                onLogout={handleLogoutClick}
                showBack={true}
                onBack={() => navigate('/teacher')}
            />

            <div className="p-6 md:p-8 flex-1 w-full max-w-7xl mx-auto">

            <ConfirmationModal 
                isOpen={showEndSessionModal}
                title="End Exam Session?"
                message="Are you sure you want to end this session? All currently connected students will be disconnected immediately and cannot rejoin."
                confirmText="End Session"
                isDanger={true}
                onConfirm={confirmEndSession}
                onCancel={() => setShowEndSessionModal(false)}
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

            <section className="bg-white p-6 rounded shadow mb-8 flex justify-between items-center">
                <div>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Session Code</h2>
                    <div className="text-4xl font-mono font-bold text-indigo-900 mt-1 tracking-widest">{sessionCode}</div>
                </div>
                {activeSession?.isActive && (
                    <button 
                        onClick={handleEndSessionClick}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded shadow transition-colors"
                    >
                        End Session
                    </button>
                )}
                {!activeSession?.isActive && activeSession && (
                     <div className="text-red-600 font-bold border border-red-200 bg-red-50 px-4 py-2 rounded">
                         Session Ended
                     </div>
                )}
            </section>

            <section>
                <div className="flex justify-between items-center mb-4 px-6">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                        Connected Students ({onlineCount} out of {sortedStudents.length})
                    </h2>
                    <div className="flex gap-4 text-sm items-center">
                         <div className="flex items-center gap-1">
                             <Wifi size={16} className="text-green-500" /> <span className="text-xs text-gray-500">Online</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <WifiOff size={16} className="text-gray-400" /> <span className="text-xs text-gray-500">Offline</span>
                         </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedStudents.map(student => (
                        <div key={student.studentId} className={`relative p-5 rounded-lg border-2 transition-all ${
                            student.isOnline ? 'bg-white border-green-100 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-75'
                        }`}>
                            <div className="flex justify-between items-start">
                                {/* Name (Top Left) */}
                                <h3 className="font-bold text-gray-800 text-lg truncate pr-2" title={student.name}>{student.name || 'Unknown'}</h3>
                                
                                {/* Wifi Symbol (Top Right) */}
                                <div className={`${student.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                                    {student.isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
                                </div>
                            </div>
                            
                            <div className="flex items-end justify-between mt-1">
                                {/* Student ID (Bottom Left) */}
                                <p className="text-sm font-mono font-bold text-gray-500">{student.studentId}</p>
                                
                                {/* Violation Count (Bottom Right) */}
                                {student.violations.length > 0 ? (
                                    <button 
                                        onClick={() => setSelectedStudent({ name: student.name || student.studentId, violations: student.violations })}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors border border-red-200"
                                    >
                                        <AlertTriangle size={14} />
                                        <span className="text-xs font-bold">{student.violations.length} Violations</span>
                                    </button>
                                ) : (
                                    <div className="h-6"></div> /* Spacer to keep height consistent if no violations */
                                )}
                            </div>
                        </div>
                    ))}
                    
                    {sortedStudents.length === 0 && (
                        <div className="col-span-full py-12 text-center bg-white rounded border border-dashed border-gray-300 text-gray-400">
                            {activeSession?.isActive ? 'Waiting for students to join...' : 'No data recorded for this session.'}
                        </div>
                    )}
                </div>
            </section>

            {selectedStudent && (
                <Modal
                    isOpen={!!selectedStudent}
                    onClose={() => setSelectedStudent(null)}
                    title={`Violation Log: ${selectedStudent.name}`}
                    size="lg"
                    headerClassName="bg-red-50 text-red-800"
                    footer={<Button onClick={() => setSelectedStudent(null)} variant="secondary">Close</Button>}
                >
                    <Table 
                        data={selectedStudent.violations}
                        columns={violationColumns}
                        keyExtractor={(_, index) => index}
                        emptyMessage="No violations recorded."
                        className="w-full text-sm text-left"
                        rowClassName="hover:bg-red-50/30"
                    />
                </Modal>
            )}
         </div>
        </div>
    );
};
