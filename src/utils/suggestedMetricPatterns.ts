/**
 * Mapping of signal patterns to suggested metrics
 */
export interface MetricPattern {
  idPattern?: RegExp;
  namePattern?: RegExp;
  suggestedMetric: string;
  description: string;
}

/**
 * Common patterns for detecting which suggestedMetric should be added
 */
export const METRIC_PATTERNS: MetricPattern[] = [
  // Tire pressure patterns
  {
    idPattern: /TP_FL|TIRE.*PRESSURE.*FL|FL.*TIRE.*PRESSURE/i,
    namePattern: /front\s+left\s+tire\s+pressure/i,
    suggestedMetric: 'frontLeftTirePressure',
    description: 'Front left tire pressure'
  },
  {
    idPattern: /TP_FR|TIRE.*PRESSURE.*FR|FR.*TIRE.*PRESSURE/i,
    namePattern: /front\s+right\s+tire\s+pressure/i,
    suggestedMetric: 'frontRightTirePressure',
    description: 'Front right tire pressure'
  },
  {
    idPattern: /TP_RL|TIRE.*PRESSURE.*RL|RL.*TIRE.*PRESSURE/i,
    namePattern: /rear\s+left\s+tire\s+pressure/i,
    suggestedMetric: 'rearLeftTirePressure',
    description: 'Rear left tire pressure'
  },
  {
    idPattern: /TP_RR|TIRE.*PRESSURE.*RR|RR.*TIRE.*PRESSURE/i,
    namePattern: /rear\s+right\s+tire\s+pressure/i,
    suggestedMetric: 'rearRightTirePressure',
    description: 'Rear right tire pressure'
  },

  // Tire temperature patterns
  {
    idPattern: /TT_FL|TIRE.*TEMP.*FL|FL.*TIRE.*TEMP/i,
    namePattern: /front\s+left\s+tire\s+temp/i,
    suggestedMetric: 'frontLeftTireTemperature',
    description: 'Front left tire temperature'
  },
  {
    idPattern: /TT_FR|TIRE.*TEMP.*FR|FR.*TIRE.*TEMP/i,
    namePattern: /front\s+right\s+tire\s+temp/i,
    suggestedMetric: 'frontRightTireTemperature',
    description: 'Front right tire temperature'
  },
  {
    idPattern: /TT_RL|TIRE.*TEMP.*RL|RL.*TIRE.*TEMP/i,
    namePattern: /rear\s+left\s+tire\s+temp/i,
    suggestedMetric: 'rearLeftTireTemperature',
    description: 'Rear left tire temperature'
  },
  {
    idPattern: /TT_RR|TIRE.*TEMP.*RR|RR.*TIRE.*TEMP/i,
    namePattern: /rear\s+right\s+tire\s+temp/i,
    suggestedMetric: 'rearRightTireTemperature',
    description: 'Rear right tire temperature'
  },

  // Speed patterns
  {
    idPattern: /_?VSS(_|$)/i,
    namePattern: /vehicle\s+speed|^speed$/i,
    suggestedMetric: 'speed',
    description: 'Vehicle speed'
  },

  // Odometer patterns
  {
    idPattern: /ODO(_|$)/i,
    namePattern: /odometer/i,
    suggestedMetric: 'odometer',
    description: 'Odometer'
  },

  // State of charge patterns
  {
    idPattern: /_?SOC(_|$)|STATE.*CHARGE/i,
    namePattern: /state\s+of\s+charge|battery.*charge.*%|soc/i,
    suggestedMetric: 'stateOfCharge',
    description: 'Battery state of charge'
  },

  // State of health patterns
  {
    idPattern: /_?SOH(_|$)|STATE.*HEALTH/i,
    namePattern: /state\s+of\s+health|battery.*health/i,
    suggestedMetric: 'stateOfHealth',
    description: 'Battery state of health'
  },

  // Traction battery voltage (HV battery)
  {
    idPattern: /HV.*BAT.*VOLT|TRACTION.*BAT.*VOLT|HIGH.*VOLT.*BAT.*VOLT/i,
    namePattern: /high\s+voltage\s+battery.*voltage|traction\s+battery.*voltage|hv\s+battery.*voltage/i,
    suggestedMetric: 'tractionBatteryVoltage',
    description: 'Traction battery voltage'
  },

  // Starter battery voltage (12V / Aux battery)
  {
    idPattern: /12V_V|AUX.*BAT.*VOLT|AUXIL.*BAT.*VOLT/i,
    namePattern: /auxiliary\s+battery\s+voltage|12v.*voltage|starter\s+battery/i,
    suggestedMetric: 'starterBatteryVoltage',
    description: 'Starter battery voltage'
  },

  // Charging status
  {
    idPattern: /HV_CHARGING|IS_CHARGING|CHARGING_STATUS/i,
    namePattern: /charging\?|is\s+charging|charging\s+status/i,
    suggestedMetric: 'isCharging',
    description: 'Charging status'
  },
];

/**
 * Find a suggested metric for a signal based on its ID and name
 */
export function findSuggestedMetric(signalId: string, signalName: string): MetricPattern | null {
  for (const pattern of METRIC_PATTERNS) {
    const idMatches = pattern.idPattern ? pattern.idPattern.test(signalId) : false;
    const nameMatches = pattern.namePattern ? pattern.namePattern.test(signalName) : false;

    if (idMatches || nameMatches) {
      return pattern;
    }
  }

  return null;
}
