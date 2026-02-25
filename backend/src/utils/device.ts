/**
 * Device information parser.
 * Extracts device type, OS, and browser from User-Agent strings.
 */
import { UAParser } from 'ua-parser-js';

export interface DeviceInfo {
  deviceType: string;   // desktop | mobile | tablet
  deviceOs: string;     // e.g. "Windows 10", "Android 14", "iOS 17"
  deviceBrowser: string; // e.g. "Chrome 120", "Safari 17"
}

/**
 * Parse a User-Agent string into structured device info.
 */
export const parseDeviceInfo = (userAgent: string | undefined): DeviceInfo => {
  if (!userAgent) {
    return { deviceType: 'unknown', deviceOs: 'Unknown', deviceBrowser: 'Unknown' };
  }

  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  const deviceType = device.type === 'mobile' ? 'mobile'
    : device.type === 'tablet' ? 'tablet'
      : 'desktop';

  const deviceOs = [os.name, os.version].filter(Boolean).join(' ') || 'Unknown';
  const deviceBrowser = [browser.name, browser.version?.split('.')[0]].filter(Boolean).join(' ') || 'Unknown';

  return { deviceType, deviceOs, deviceBrowser };
};
