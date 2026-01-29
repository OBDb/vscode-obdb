/**
 * Mapping of signal patterns to suggested metrics
 */
export interface MetricPattern {
  idPattern?: RegExp;
  namePattern?: RegExp;
  excludeNamePattern?: RegExp;
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
    description: 'Vehicle speed',
    excludeNamePattern: /wheel/i
  },

  // Odometer patterns
  {
    idPattern: /ODO(_|$)/i,
    namePattern: /odometer/i,
    suggestedMetric: 'odometer',
    description: 'Odometer'
  },

  // Fuel level patterns
  {
    idPattern: /_FLI(_|$)/i,
    namePattern: /^fuel\s+level$/i,
    suggestedMetric: 'fuelTankLevel',
    description: 'Fuel tank level'
  },

  // Engine coolant temperature patterns
  {
    idPattern: /ECT(_|$)|ENG.*COOLANT.*TEMP/i,
    namePattern: /engine\s+coolant\s+temp/i,
    suggestedMetric: 'engineCoolantTemperature',
    description: 'Engine coolant temperature'
  },

  // Engine load patterns
  {
    idPattern: /ENG.*LOAD|ENGINE.*LOAD/i,
    namePattern: /engine\s+load/i,
    suggestedMetric: 'engineLoad',
    description: 'Engine load'
  },

  // Fuel trim patterns
  {
    idPattern: /STFT|SHORT.*TERM.*FUEL.*TRIM/i,
    namePattern: /short\s+term\s+fuel\s+trim/i,
    suggestedMetric: 'shortTermFuelTrim',
    description: 'Short term fuel trim'
  },

  // Mass air flow patterns
  {
    idPattern: /MAF(_|$)|MASS.*AIR.*FLOW/i,
    namePattern: /mass\s+air\s+flow/i,
    suggestedMetric: 'massAirFlow',
    description: 'Mass air flow'
  },

  // Engine oil temperature patterns
  {
    idPattern: /EOT(_|$)|ENG.*OIL.*TEMP|ENGINE.*OIL.*TEMP/i,
    namePattern: /engine\s+oil\s+temp/i,
    suggestedMetric: 'engineOilTemperature',
    description: 'Engine oil temperature'
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

  // Traction battery capacity (HV battery energy in kWh)
  {
    idPattern: /HV.*BAT.*KWH|HV.*BAT.*ENERGY|HV.*BAT.*CAPACITY|TRACTION.*BAT.*CAPACITY/i,
    namePattern: /hv\s+battery\s+energy|high\s+voltage\s+battery\s+energy|traction\s+battery\s+capacity|hv\s+battery\s+capacity/i,
    suggestedMetric: 'tractionBatteryCapacity',
    description: 'Traction battery capacity'
  },

  // Traction battery current (HV battery current)
  {
    idPattern: /HV.*BAT.*_A$|HV.*BAT.*CURRENT|HV.*BAT.*AMPS|TRACTION.*BAT.*CURRENT|BATTERY_CURRENT/i,
    namePattern: /hv\s+battery\s+current|high\s+voltage\s+battery\s+current|traction\s+battery\s+current|battery\s+current/i,
    suggestedMetric: 'tractionBatteryCurrent',
    description: 'Traction battery current'
  },

  // Traction battery voltage (HV battery) - exclude minimum/maximum/module voltages
  {
    idPattern: /HV.*BAT.*VOLT|TRACTION.*BAT.*VOLT|HIGH.*VOLT.*BAT.*VOLT/i,
    namePattern: /high\s+voltage\s+battery.*voltage|traction\s+battery.*voltage|hv\s+battery.*voltage/i,
    suggestedMetric: 'tractionBatteryVoltage',
    description: 'Traction battery voltage',
    excludeNamePattern: /minimum|maximum|min|max|module/i
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

    // Check if name matches exclusion pattern
    if (pattern.excludeNamePattern && pattern.excludeNamePattern.test(signalName)) {
      continue; // Skip this pattern if the name matches the exclusion
    }

    if (idMatches || nameMatches) {
      return pattern;
    }
  }

  return null;
}
