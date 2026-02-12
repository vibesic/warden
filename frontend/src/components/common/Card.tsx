import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    footer?: React.ReactNode;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ 
    children, 
    className = '', 
    title, 
    subtitle,
    footer,
    padding = 'md'
}) => {
    const paddings = {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8'
    };

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
            {(title || subtitle) && (
                <div className={`border-b border-gray-100 px-6 py-4`}>
                    {title && <h3 className="text-lg font-bold text-gray-800">{title}</h3>}
                    {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
                </div>
            )}
            
            <div className={paddings[padding]}>
                {children}
            </div>

            {footer && (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                    {footer}
                </div>
            )}
        </div>
    );
};
