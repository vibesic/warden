import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    closeOnBackdropClick?: boolean;
    headerClassName?: string;
    bodyClassName?: string;
    footerClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'md',
    closeOnBackdropClick = true,
    headerClassName = '',
    bodyClassName = '',
    footerClassName = ''
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.body.style.overflow = 'unset';
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    const sizes = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-2xl',
        full: 'max-w-full m-4'
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div 
                ref={modalRef}
                className={`bg-white rounded-xl shadow-2xl w-full ${sizes[size]} flex flex-col overflow-hidden max-h-[90vh] transform transition-all scale-100 opacity-100`}
                role="dialog"
                aria-modal="true"
            >
                <header className={`p-4 border-b border-gray-100 flex justify-between items-center ${headerClassName}`}>
                        <div className="text-lg font-bold text-gray-800">{title}</div>
                        <button 
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors"
                            aria-label="Close"
                        >
                            <X size={20} />
                        </button>
                    </header>
                
                <div className={`p-6 overflow-y-auto ${bodyClassName}`}>
                    {children}
                </div>
                
                {footer && (
                    <div className={`p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 ${footerClassName}`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
