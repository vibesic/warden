import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDanger = false,
    onConfirm,
    onCancel
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 opacity-100">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`p-3 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                    </div>
                    
                    <p className="text-gray-600 mb-6 leading-relaxed">
                        {message}
                    </p>
                    
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={onCancel}
                            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button 
                            onClick={onConfirm}
                            className={`px-6 py-2 text-white font-bold rounded-lg shadow-sm transition-all transform active:scale-95 ${
                                isDanger 
                                ? 'bg-red-600 hover:bg-red-700' 
                                : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
