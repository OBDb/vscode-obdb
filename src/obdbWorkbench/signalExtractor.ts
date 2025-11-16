import { Signal } from '../types';

/**
 * Extract signals from a command object
 */
export function extractSignals(command: any): Signal[] {
  // Extract signals from command parameters or signals
  return command.signals ? command.signals.map((signal: any) => {
    // Extract bitOffset and bitLength from fmt if available
    const bitOffset = signal.fmt?.bix ?? 0;
    const bitLength = signal.fmt?.len ?? 8;

    return {
      id: signal.id || 'unknown',
      name: signal.name || signal.id || 'Unknown',
      path: signal.path,
      suggestedMetric: signal.suggestedMetric,
      bitOffset,
      bitLength
    };
  }) : command.parameters?.map((param: any) => ({
    id: param.id || 'unknown',
    name: param.name || param.id || 'Unknown',
    path: param.path,
    suggestedMetric: param.suggestedMetric,
    bitOffset: param.bitOffset || 0,
    bitLength: param.bitLength || 8
  })) || [];
}

/**
 * Create a mapping of individual bits to their corresponding signals
 */
export function createBitToSignalMap(signals: Signal[]): { [key: number]: Signal } {
  const bitToSignalMap: { [key: number]: Signal } = {};

  signals.forEach(signal => {
    const bitOffset = signal.bitOffset;
    const bitLength = signal.bitLength;

    for (let i = 0; i < bitLength; i++) {
      bitToSignalMap[bitOffset + i] = signal;
    }
  });

  return bitToSignalMap;
}

/**
 * Generate a color map for signals
 */
export function generateSignalColors(signals: Signal[]): { [key: string]: string } {
  const signalColors: { [key: string]: string } = {};
  const tempIds = signals.map(s => s.id);
  const uniqueSignalIds = Array.from(new Set(tempIds));

  uniqueSignalIds.forEach((id, index) => {
    // Use a predefined color palette
    const hue = (index * 137.5) % 360; // Use golden ratio approximation for good distribution
    signalColors[id] = `hsl(${Math.floor(hue)}, 70%, 60%)`;
  });

  return signalColors;
}

/**
 * Get unique signals for the legend (removing duplicates by ID)
 */
export function getUniqueSignals(signals: Signal[]): Signal[] {
  return Array.from(
    new Map(signals.map(signal => [signal.id, signal])).values()
  );
}