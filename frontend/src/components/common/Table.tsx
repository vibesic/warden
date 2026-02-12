import React from 'react';

export interface TableColumn<T> {
    header: string;
    className?: string; // Applied to both header and cell
    headerClassName?: string; // Applied only to header
    cellClassName?: string; // Applied only to cell
    cell: (item: T) => React.ReactNode; // Render function for the cell
}

interface TableProps<T> {
    data: T[];
    columns: TableColumn<T>[];
    keyExtractor: (item: T, index: number) => string | number;
    emptyMessage?: string;
    className?: string;
    rowClassName?: string;
    onRowClick?: (item: T) => void;
}

export const Table = <T,>({ 
    data, 
    columns, 
    keyExtractor, 
    emptyMessage = 'No data available',
    className = '',
    rowClassName = '',
    onRowClick
}: TableProps<T>) => {
    
    if (data.length === 0) {
        return (
            <div className="p-8 text-center text-gray-400 bg-white rounded-lg border border-dashed border-gray-200">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={`overflow-x-auto ${className}`}>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                        {columns.map((col, index) => (
                            <th 
                                key={index} 
                                className={`px-6 py-4 font-semibold ${col.headerClassName || ''} ${col.className || ''}`}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {data.map((item, index) => (
                        <tr 
                            key={keyExtractor(item, index)} 
                            className={`hover:bg-gray-50 transition-colors group ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName}`}
                            onClick={() => onRowClick && onRowClick(item)}
                        >
                            {columns.map((col, index) => (
                                <td 
                                    key={index} 
                                    className={`px-6 py-4 ${col.cellClassName || ''} ${col.className || ''}`}
                                >
                                    {col.cell(item)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
