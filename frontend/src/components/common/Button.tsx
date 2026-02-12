import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'link';
    isLoading?: boolean;
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, 
    variant = 'primary', 
    isLoading = false, 
    icon,
    className = '',
    disabled,
    ...props 
}) => {
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
        primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm focus:ring-indigo-500 border border-transparent",
        secondary: "bg-gray-800 hover:bg-gray-900 text-white shadow-sm focus:ring-gray-500 border border-transparent",
        danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500 border border-transparent",
        outline: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-sm focus:ring-indigo-500",
        ghost: "bg-transparent hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-transparent",
        link: "bg-transparent text-gray-500 hover:text-gray-700 underline p-0 h-auto border-none shadow-none hover:bg-transparent"
    };
    
    const sizes = "px-4 py-2 text-sm";
    
    return (
        <button 
            className={`${baseStyles} ${variants[variant]} ${variant !== 'link' ? sizes : ''} ${className}`}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {!isLoading && icon && <span className="mr-2">{icon}</span>}
            {children}
        </button>
    );
};
