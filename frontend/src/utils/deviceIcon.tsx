import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

export const getDeviceIcon = (deviceType?: string, size: number = 14): React.ReactElement => {
  switch (deviceType) {
    case 'mobile': return <Smartphone size={size} />;
    case 'tablet': return <Tablet size={size} />;
    default: return <Monitor size={size} />;
  }
};
