import React from 'react';

interface FullScreenAlertProps {
    title: string;
    subtitle?: string;
    message?: string;
    variant?: 'danger' | 'info' | 'warning' | 'success';
    children?: React.ReactNode;
}

export const FullScreenAlert: React.FC<FullScreenAlertProps> = ({ 
    title, 
    subtitle, 
    message, 
    variant = 'danger', 
    children 
}) => {
    const variants = {
        danger: 'bg-red-600 text-white',
        info: 'bg-blue-600 text-white',
        warning: 'bg-yellow-500 text-white',
        success: 'bg-green-600 text-white'
    };

    return (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 text-center ${variants[variant]}`}>
            <h1 className="text-4xl md:text-6xl font-bold mb-4 animate-bounce">{title}</h1>
            {subtitle && <p className="text-xl md:text-3xl font-semibold mb-2">{subtitle}</p>}
            {message && <p className="mt-4 text-white/90 max-w-2xl text-lg">{message}</p>}
            
            <div className="mt-8">
                {children}
            </div>
        </div>
    );
};
