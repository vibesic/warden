import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    className?: string; // Additional classes for the input element itself
    containerClassName?: string; // Container classes
}

export const Input: React.FC<InputProps> = ({ 
    label, 
    error, 
    className = '', 
    containerClassName = '',
    id,
    ...props 
}) => {
    // Generate a random ID if none provided, to link label and input accessibility
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    return (
        <div className={`space-y-1 ${containerClassName}`}>
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <input
                id={inputId}
                className={`
                    block w-full rounded-md border-gray-300 shadow-sm 
                    focus:border-indigo-500 focus:ring-indigo-500 
                    disabled:bg-gray-100 disabled:text-gray-500
                    p-2 border transition-colors
                    ${error ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500' : ''}
                    ${className}
                `}
                aria-invalid={!!error}
                aria-describedby={error ? `${inputId}-error` : undefined}
                {...props}
            />
            {error && (
                <p className="text-sm text-red-600" id={`${inputId}-error`}>
                    {error}
                </p>
            )}
        </div>
    );
};
