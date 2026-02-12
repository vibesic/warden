import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface HeaderProps {
    title: string;
    isConnected: boolean;
    onLogout: () => void;
    onBack?: () => void;
    showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
    title, 
    isConnected, 
    onLogout, 
    onBack, 
    showBack = false 
}) => {
    return (
        <header className="flex justify-between items-center bg-white p-4 shadow-sm border-b border-gray-200 sticky top-0 z-30">
            <div className="flex items-center gap-4">
                {showBack && onBack && (
                    <button 
                        onClick={onBack} 
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                        title="Back"
                    >
                        <ArrowLeft size={20} />
                    </button>
                )}
                <h1 className="text-xl font-bold text-gray-800">{title}</h1>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
                    <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-xs font-semibold text-gray-600">
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>

                <button 
                     onClick={onLogout} 
                     className="text-sm font-medium text-red-600 hover:text-red-700 px-4 py-2 hover:bg-red-50 rounded-lg transition-colors"
                 >
                     Logout
                 </button>
            </div>
        </header>
    );
};
