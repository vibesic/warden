import React from 'react';

interface StatusBadgeProps {
    status: 'active' | 'inactive' | 'online' | 'offline' | 'warning' | 'error' | 'success';
    text?: string;
    pulse?: boolean;
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
    status, 
    text, 
    pulse = false, 
    className = '' 
}) => {
    
    const variants = {
        active: 'bg-green-100 text-green-700',
        success: 'bg-green-50 text-green-700 border border-green-100',
        online: 'bg-green-500', // Dot only usually, but handled below
        inactive: 'bg-gray-100 text-gray-600',
        offline: 'bg-gray-400',
        warning: 'bg-yellow-100 text-yellow-700',
        error: 'bg-red-100 text-red-700'
    };
    
    const dotColors = {
        active: 'bg-green-500',
        success: 'bg-green-500',
        online: 'bg-green-500',
        inactive: 'bg-gray-400',
        offline: 'bg-gray-400',
        warning: 'bg-yellow-500',
        error: 'bg-red-500'
    };

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${variants[status]} ${className}`}>
            {pulse && (
                <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status]} animate-pulse`}></span>
            )}
            {!pulse && (status === 'online' || status === 'offline') && (
                <span className={`w-2 h-2 rounded-full ${dotColors[status]}`}></span>
            )}
            
            {text || status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};
