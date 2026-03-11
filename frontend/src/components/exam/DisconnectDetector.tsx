import { useEffect, useRef, useState } from 'react';
import { useServiceWorker } from '../../hooks/useServiceWorker';
import { useContinuityClock } from '../../hooks/useContinuityClock';
import { readAllProbes, clearAllProbes } from '../../utils/probeStore';

interface Props {
    isConnected: boolean;
    sessionCode: string;
    reportViolation: (type: string, details: string, reason: string) => void;
}

/**
 * Effects-only component that detects disconnects and continuity gaps.
 * Renders nothing — purely handles violation logic that was previously
 * inlined in SecureExamMonitor.
 */
export const DisconnectDetector: React.FC<Props> = ({ isConnected, sessionCode, reportViolation }) => {
    const { requestProbe } = useServiceWorker();
    const { gap, clearGap } = useContinuityClock(sessionCode);

    const [lastDisconnectTime, setLastDisconnectTime] = useState<number | null>(null);
    const reconnectProbeRan = useRef(false);
    const socketReconnectHandled = useRef(false);
    const gapReported = useRef(false);

    // Detector #6: socket-level disconnect duration
    useEffect(() => {
        if (!isConnected && !lastDisconnectTime) {
            setLastDisconnectTime(Date.now());
            reconnectProbeRan.current = false;
            socketReconnectHandled.current = false;
        } else if (isConnected && lastDisconnectTime) {
            const duration = Date.now() - lastDisconnectTime;
            if (duration > 120_000) {
                const seconds = Math.round(duration / 1000);
                reportViolation('DISCONNECTION', `Client disconnected from exam server for ${seconds}s. Possible network change.`, 'PROLONGED_ABSENCE');
                socketReconnectHandled.current = true;
            }
            setLastDisconnectTime(null);

            if (!reconnectProbeRan.current) {
                reconnectProbeRan.current = true;
                void (async () => {
                    try {
                        await requestProbe();
                        const probes = await readAllProbes();
                        const reachable = probes.filter(p => p.reachable);
                        if (reachable.length > 0) {
                            const timestamps = reachable
                                .map(p => new Date(p.timestamp).toISOString())
                                .join(', ');
                            reportViolation(
                                'INTERNET_ACCESS',
                                `Service Worker detected internet access during disconnect gap at: ${timestamps}`,
                                'CLIENT_PROBE',
                            );
                        }
                        await clearAllProbes();
                    } catch {
                        // IndexedDB or SW unavailable
                    }
                })();
            }
        }
    }, [isConnected, lastDisconnectTime, reportViolation, requestProbe]);

    // Detector #7: Continuity clock gap
    useEffect(() => {
        if (!gap || gapReported.current || !isConnected) return;
        if (socketReconnectHandled.current) {
            clearGap();
            return;
        }
        gapReported.current = true;

        const seconds = Math.round(gap.durationMs / 1000);
        const networkInfo = gap.networkChanged
            ? ` Network fingerprint changed (${gap.previousNetwork?.effectiveType}/${gap.previousNetwork?.downlink}Mbps -> ${gap.currentNetwork?.effectiveType}/${gap.currentNetwork?.downlink}Mbps).`
            : '';

        reportViolation(
            'DISCONNECTION',
            `App was inactive for ${seconds}s (last alive: ${new Date(gap.lastAliveAt).toISOString()}).${networkInfo}`,
            'PROLONGED_ABSENCE',
        );
        clearGap();
    }, [gap, isConnected, reportViolation, clearGap]);

    return null;
};
