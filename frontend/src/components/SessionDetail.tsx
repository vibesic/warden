import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTeacherSocket, Violation } from '../hooks/useTeacherSocket';
import { AlertTriangle, Wifi, WifiOff, ArrowLeft } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

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
        navigate('/teacher/login');
    };

    const onlineCount = sortedStudents.filter(s => s.isOnline).length;

    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-8">
            <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4">
                   <button 
                       onClick={() => navigate('/teacher')} 
                       className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                       title="Back to Dashboard"
                   >
                       <ArrowLeft size={20} />
                   </button>
                   <h1 className="text-xl font-bold text-gray-800">Session Monitor</h1>
                </div>
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
                message="You have an exam session currently running. Logging out will not stop the session, but you will stop monitoring students. Are you sure you want to logout?"
                confirmText="Logout"
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
                            Waiting for students to join...
                        </div>
                    )}
                </div>
            </section>

            {selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
                        <header className="p-4 border-b flex justify-between items-center bg-red-50">
                            <h3 className="font-bold text-red-800 flex items-center gap-2">
                                <AlertTriangle size={20} />
                                Violation Log: {selectedStudent.name}
                            </h3>
                            <button 
                                onClick={() => setSelectedStudent(null)}
                                className="text-gray-500 hover:text-gray-700 p-1 hover:bg-black/5 rounded"
                            >
                                ✕
                            </button>
                        </header>
                        
                        <div className="p-0 overflow-y-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Time</th>
                                        <th className="px-4 py-3 font-medium">Type</th>
                                        <th className="px-4 py-3 font-medium">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {selectedStudent.violations.map((v, i) => (
                                        <tr key={i} className="hover:bg-red-50/30">
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                {new Date(v.timestamp).toLocaleTimeString()}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-red-600">
                                                {v.type.replace(/_/g, ' ')}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                {v.details || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="p-4 border-t bg-gray-50 text-right">
                            <button 
                                onClick={() => setSelectedStudent(null)}
                                className="px-4 py-2 bg-white border border-gray-300 rounded text-sm font-medium hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
