/**
 * VSCode-independent utilities for working with command IDs
 * Can be used by both the VSCode extension and CLI tools
 */

import { Filter, Parameter, CarProtocolStrategy } from '../types';

export const ID_PROPERTY_DIVIDER = '|';

/**
 * Formats header value as string based on protocol strategy and value
 */
function formatHeaderAsString(header: number, carProtocolStrategy?: CarProtocolStrategy): string {
  if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_11bit) {
    return header.toString(16).toUpperCase().padStart(3, '0');
  } else if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_29bit) {
    return header.toString(16).toUpperCase().padStart(4, '0');
  } else if (carProtocolStrategy === CarProtocolStrategy.iso9141_2) {
    return header.toString(16).toUpperCase().padStart(4, '0');
  } else if (header <= 0xFFF) {
    return header.toString(16).toUpperCase().padStart(3, '0');
  } else {
    return header.toString(16).toUpperCase().padStart(4, '0');
  }
}

/**
 * Formats receive address as string based on protocol strategy and mask
 */
function formatReceiveAddressAsString(
  receiveAddress?: number,
  receiveMask?: number,
  carProtocolStrategy?: CarProtocolStrategy
): string | undefined {
  if (receiveAddress === undefined) {
    return undefined;
  }

  if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_11bit) {
    return receiveAddress.toString(16).toUpperCase().padStart(3, '0');
  } else if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_29bit) {
    if ((receiveMask || 0) <= 0xFF) {
      return receiveAddress.toString(16).toUpperCase().padStart(2, '0');
    } else if ((receiveMask || 0) <= 0xFFFF) {
      return receiveAddress.toString(16).toUpperCase().padStart(4, '0');
    } else {
      return receiveAddress.toString(16).toUpperCase().padStart(6, '0');
    }
  } else if (carProtocolStrategy === CarProtocolStrategy.iso9141_2) {
    return receiveAddress.toString(16).toUpperCase().padStart(2, '0');
  } else if ((receiveMask || 0) <= 0xFF) {
    return receiveAddress.toString(16).toUpperCase().padStart(2, '0');
  } else if ((receiveMask || 0) <= 0xFFF) {
    return receiveAddress.toString(16).toUpperCase().padStart(3, '0');
  } else {
    return receiveAddress.toString(16).toUpperCase().padStart(4, '0');
  }
}

/**
 * Converts a filter object to an ID string representation
 */
export function filterToIDString(filter: Filter): string {
  const stringParts: string[] = [];

  if (filter.from !== undefined && filter.to !== undefined && filter.from < filter.to) {
    stringParts.push(String(filter.from) + "-" + String(filter.to));
  } else {
    if (filter.from !== undefined) {
      stringParts.push(String(filter.from) + "-");
    }
    if (filter.to !== undefined) {
      stringParts.push("-" + String(filter.to));
    }
  }

  if (filter.years && filter.years.length > 0) {
    const sortedYears = [...filter.years].sort((a, b) => a - b);
    stringParts.push(...sortedYears.map(year => String(year)));
  }

  return stringParts.join(';');
}

/**
 * Formats additional properties for the command ID
 */
function formatPropertiesForID(
  filter?: Filter,
  timeout?: number,
  extendedAddress?: number,
  testerAddress?: number,
  forceFlowControlResponse: boolean = false,
  carProtocolStrategy?: CarProtocolStrategy,
  canPriority?: number,
  diagnosticLevelIn?: number,
  diagnosticLevelOut?: number
): string {
  const parts: string[] = [];

  if (timeout !== undefined) {
    parts.push(`t=${timeout.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (extendedAddress !== undefined) {
    parts.push(`e=${extendedAddress.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (testerAddress !== undefined) {
    parts.push(`ta=${testerAddress.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (forceFlowControlResponse) {
    parts.push('fc=1');
  }

  if (carProtocolStrategy === CarProtocolStrategy.iso9141_2) {
    parts.push('p=9141-2');
  }

  if (canPriority !== undefined) {
    parts.push(`c=${canPriority.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (filter) {
    parts.push('f=' + filterToIDString(filter));
  }

  if (diagnosticLevelIn !== undefined) {
    parts.push(`dil=${diagnosticLevelIn.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (diagnosticLevelOut !== undefined) {
    parts.push(`dout=${diagnosticLevelOut.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  return parts.join(',');
}

/**
 * Creates a command ID from individual components
 */
export function createCommandID(
  headerAsString: string,
  receiveAddressAsString?: string,
  parameter?: Parameter,
  filter?: Filter,
  timeout?: number,
  extendedAddress?: number,
  testerAddress?: number,
  forceFlowControlResponse: boolean = false,
  carProtocolStrategy?: CarProtocolStrategy,
  canPriority?: number,
  diagnosticLevelIn?: number,
  diagnosticLevelOut?: number
): string {
  let id = headerAsString + '.';

  if (receiveAddressAsString) {
    id += receiveAddressAsString + '.';
  }

  if (parameter) {
    id += parameter.asMessage;
  }

  // Add additional properties in a compact format
  const propertiesString = formatPropertiesForID(
    filter,
    timeout,
    extendedAddress,
    testerAddress,
    forceFlowControlResponse,
    carProtocolStrategy,
    canPriority,
    diagnosticLevelIn,
    diagnosticLevelOut
  );

  if (propertiesString.length > 0) {
    id += ID_PROPERTY_DIVIDER + propertiesString;
  }

  return id;
}

/**
 * Generates a command ID from a command definition object using the correct coding keys
 */
export function generateCommandIdFromDefinition(command: any): string {
  // Extract header - convert to number if it's a string
  const headerValue = typeof command.hdr === 'string'
    ? parseInt(command.hdr, 16)
    : (command.hdr || 0x7E0);

  // Extract receive address
  const receiveAddress = command.rax;
  const receiveMask = command.receive?.mask || command.receiveAddressMask;

  // Extract car protocol strategy
  const carProtocolStrategy = command.proto as CarProtocolStrategy;

  // Format header and receive address
  const headerAsString = formatHeaderAsString(headerValue, carProtocolStrategy);
  const receiveAddressAsString = formatReceiveAddressAsString(
    receiveAddress,
    receiveMask,
    carProtocolStrategy
  );

  // Create parameter object from "cmd" key
  let parameter: Parameter | undefined;
  if (command.cmd !== undefined) {
    let cmdMessage: string;
    if (typeof command.cmd === 'object') {
      if (Object.keys(command.cmd).length === 1) {
        const key = Object.keys(command.cmd)[0];
        const value = command.cmd[key];
        cmdMessage = `${key}${value}`;
      } else {
        cmdMessage = JSON.stringify(command.cmd).replace(/[:\s"{}]/g, '');
      }
    } else {
      cmdMessage = String(command.cmd).replace(/[:\s]/g, '');
    }
    parameter = { asMessage: cmdMessage };
  }

  // Extract other properties using correct coding keys
  const filter = command.filter as Filter;
  const timeout = command.tmo;
  const extendedAddress = command.eax;
  const testerAddress = command.tst;
  const forceFlowControlResponse = command.fcm1 || false;
  const canPriority = command.pri;
  const diagnosticLevelIn = command.din;
  const diagnosticLevelOut = command.dout;

  return createCommandID(
    headerAsString,
    receiveAddressAsString,
    parameter,
    filter,
    timeout,
    extendedAddress,
    testerAddress,
    forceFlowControlResponse,
    carProtocolStrategy,
    canPriority,
    diagnosticLevelIn,
    diagnosticLevelOut
  );
}
