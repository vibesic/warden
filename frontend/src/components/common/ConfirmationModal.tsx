import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

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
    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={
                <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        <AlertTriangle size={24} />
                    </div>
                    <span>{title}</span>
                </div>
            }
            size="md"
            footer={
                <>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-6 py-2 text-white font-bold rounded-lg shadow-sm transition-all transform active:scale-95 ${isDanger
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                    >
                        {confirmText}
                    </button>
                </>
            }
        >
            <p className="text-gray-600 leading-relaxed">
                {message}
            </p>
        </Modal>
    );
};
