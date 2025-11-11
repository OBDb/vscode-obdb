import { Command, Signal } from '../types';

/**
 * Vehicle type classification
 */
export enum VehicleType {
  EV = 'EV',
  ICE = 'ICE',
  HYBRID = 'HYBRID',
  UNKNOWN = 'UNKNOWN'
}

/**
 * EV command patterns for detection
 */
const EV_COMMAND_PATTERNS = [
  'HVBAT_', 'BAT_SOC', 'CHRG_', 'HEV_', 'EHEV_',
  'ELECTRIC', 'BATTERY', 'PLUG', 'HYBRID', 'SOC', 'SOH',
  'KILOWATTHOUR', 'KWH', 'VOLT_BATTERY', 'AMP_BATTERY'
];

/**
 * EV signal name patterns for detection
 */
const EV_SIGNAL_PATTERNS = [
  'ischarging', 'pluggedin', 'stateofcharge', 'electricrange',
  'stateofhealth', 'batterytemperature', 'batteryvoltage',
  'chargingstate', 'hybridmode', 'electricmode'
];

/**
 * Model names that clearly indicate EV/Hybrid vehicles
 */
const EV_MODEL_INDICATORS = [
  'lightning', 'electric', 'hybrid', 'plug', 'ev', 'phev', 'bev',
  'e-tron', 'tesla', 'leaf', 'bolt', 'volt', 'prius', 'ioniq',
  'mustang-mach-e', 'rav4-hybrid', 'camry-hybrid'
];

/**
 * Model names that clearly indicate ICE vehicles
 */
const ICE_MODEL_INDICATORS = [
  'v6', 'v8', 'turbo', 'diesel', 'gas', 'gasoline', 'petrol'
];

/**
 * ICE command patterns including common OBD-II signal names
 */
const ICE_PATTERNS = [
  'FUEL', 'O2S', 'CAT', 'EVAP', 'EGR', 'MIS', 'HTR', 'SPARKADV', 'MAF', 'TP_', 'FRP', 'LONGFT', 'SHRTFT',
  'FUEL_RDY', 'FUEL_SUP', 'O2S_RDY', 'O2S_SUP', 'EGR_RDY', 'EGR_SUP', 'EVAP_RDY', 'EVAP_SUP',
  'MIS_RDY', 'MIS_SUP', 'HTR_RDY', 'HTR_SUP', 'FUELSYS', 'LOAD_PCT', 'RPM', 'BARO', 'CATEMP'
];

/**
 * Detects vehicle type (EV, ICE, HYBRID, or UNKNOWN) based on model name and command patterns.
 *
 * @param modelName The vehicle model name (e.g., "Ford-F-150-Lightning")
 * @param commands Array of commands from signalset
 * @returns Detected vehicle type
 */
export function detectVehicleType(modelName: string, commands: Command[]): VehicleType {
  const modelNameLower = modelName.toLowerCase();

  // Check model name for clear EV indicators
  for (const indicator of EV_MODEL_INDICATORS) {
    if (modelNameLower.includes(indicator)) {
      console.log(`Vehicle type detected as EV based on model name indicator: '${indicator}'`);
      return VehicleType.EV;
    }
  }

  // Check model name for clear ICE indicators
  for (const indicator of ICE_MODEL_INDICATORS) {
    if (modelNameLower.includes(indicator)) {
      console.log(`Vehicle type detected as ICE based on model name indicator: '${indicator}'`);
      return VehicleType.ICE;
    }
  }

  // Analyze command patterns if model name is ambiguous
  let evCommandCount = 0;
  let iceCommandCount = 0;
  const totalCommands = commands.length;

  for (const command of commands) {
    // Build text to check from command properties
    const commandText = buildCommandTextForAnalysis(command);
    const signalText = buildSignalTextForAnalysis(command.signals || []);
    const allText = (commandText + ' ' + signalText).toUpperCase();

    // Check for EV patterns
    let foundEv = false;
    for (const pattern of EV_COMMAND_PATTERNS) {
      if (allText.includes(pattern.toUpperCase())) {
        evCommandCount++;
        foundEv = true;
        break;
      }
    }

    // Also check signal names (lowercase comparison for camelCase signals)
    if (!foundEv) {
      const allTextLower = allText.toLowerCase();
      for (const pattern of EV_SIGNAL_PATTERNS) {
        if (allTextLower.includes(pattern.toLowerCase())) {
          evCommandCount++;
          foundEv = true;
          break;
        }
      }
    }

    // Check for ICE-specific patterns (avoid double counting)
    if (!foundEv) {
      for (const pattern of ICE_PATTERNS) {
        if (allText.includes(pattern.toUpperCase())) {
          iceCommandCount++;
          break;
        }
      }
    }
  }

  // Decision logic based on command analysis
  if (totalCommands === 0) {
    console.warn('No commands found for vehicle type detection. Defaulting to UNKNOWN.');
    return VehicleType.UNKNOWN;
  }

  const evRatio = evCommandCount / totalCommands;
  const iceRatio = iceCommandCount / totalCommands;

  console.log(`Command analysis: ${evCommandCount} EV commands, ${iceCommandCount} ICE commands out of ${totalCommands} total`);

  // If significant EV commands present, classify as EV or HYBRID
  if (evRatio > 0.1) { // More than 10% EV commands
    if (iceRatio > 0.1) { // Also has ICE commands
      console.log(`Vehicle type detected as HYBRID (EV ratio: ${evRatio.toFixed(2)}, ICE ratio: ${iceRatio.toFixed(2)})`);
      return VehicleType.HYBRID;
    } else {
      console.log(`Vehicle type detected as EV (EV ratio: ${evRatio.toFixed(2)})`);
      return VehicleType.EV;
    }
  } else if (iceRatio > 0.05) { // More than 5% ICE commands and no significant EV
    console.log(`Vehicle type detected as ICE (ICE ratio: ${iceRatio.toFixed(2)})`);
    return VehicleType.ICE;
  } else {
    console.log('Vehicle type could not be determined from command patterns. Defaulting to UNKNOWN.');
    return VehicleType.UNKNOWN;
  }
}

/**
 * Determines if an EV-related command should be filtered out for ICE vehicles.
 *
 * @param command The command to check
 * @param vehicleType Detected vehicle type
 * @returns True if command should be filtered out, False otherwise
 */
export function shouldFilterEvCommand(command: Command, vehicleType: VehicleType): boolean {
  if (vehicleType === VehicleType.EV || vehicleType === VehicleType.HYBRID || vehicleType === VehicleType.UNKNOWN) {
    return false; // Don't filter for EV/Hybrid vehicles or when uncertain
  }

  // For ICE vehicles, check if command contains EV patterns
  const commandText = buildCommandTextForAnalysis(command).toUpperCase();
  const signalText = buildSignalTextForAnalysis(command.signals || []);

  // Check command patterns
  for (const pattern of EV_COMMAND_PATTERNS) {
    if (commandText.includes(pattern.toUpperCase()) || signalText.toUpperCase().includes(pattern.toUpperCase())) {
      console.log(`Filtering EV command for ICE vehicle: ${commandText} (pattern: ${pattern})`);
      return true;
    }
  }

  // Check signal patterns (case-insensitive for camelCase signals)
  const signalTextLower = signalText.toLowerCase();
  for (const pattern of EV_SIGNAL_PATTERNS) {
    if (signalTextLower.includes(pattern.toLowerCase())) {
      console.log(`Filtering EV signal for ICE vehicle: ${signalText} (pattern: ${pattern})`);
      return true;
    }
  }

  return false;
}

/**
 * Builds command text for pattern analysis
 */
function buildCommandTextForAnalysis(command: Command): string {
  const parts: string[] = [];

  if (command.hdr) {
    parts.push(command.hdr);
  }

  if (command.cmd) {
    if (typeof command.cmd === 'object') {
      parts.push(JSON.stringify(command.cmd));
    } else {
      parts.push(String(command.cmd));
    }
  }

  if (command.rax) {
    parts.push(command.rax);
  }

  return parts.join('_');
}

/**
 * Builds signal text for pattern analysis
 */
function buildSignalTextForAnalysis(signals: any[]): string {
  const signalNames: string[] = [];

  for (const signal of signals) {
    if (signal && typeof signal === 'object') {
      if (signal.id) {
        signalNames.push(signal.id);
      }
      if (signal.name) {
        signalNames.push(signal.name);
      }
    }
  }

  return signalNames.join(' ');
}
