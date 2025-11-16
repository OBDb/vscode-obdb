import * as vscode from 'vscode';

// Car protocol strategy enum
export enum CarProtocolStrategy {
  iso15765_4_11bit = 'iso15765_4_11bit',
  iso15765_4_29bit = 'iso15765_4_29bit',
  iso9141_2 = 'iso9141_2'
}

// Filter interface for command filtering
export interface Filter {
  from?: number;
  to?: number;
  years?: number[];
}

// Parameter interface for command parameters
export interface Parameter {
  asMessage: string;
}

// Command signal information
export interface Signal {
  id: string;
  name: string;
  path?: string;
  suggestedMetric?: string;
  bitOffset: number;
  bitLength: number;
}

// Command structure from JSON files with correct coding keys
export interface Command {
  hdr?: string;           // header
  cmd?: any;              // parameter
  rax?: string;           // receiveAddress
  eax?: number;           // extendedAddress
  tst?: number;           // testerAddress
  fcm1?: boolean;         // forceFlowControlResponse
  proto?: CarProtocolStrategy; // carProtocolStrategy
  tmo?: number;           // timeout
  pri?: number;           // canPriority
  signals?: any[];
  freq?: number;          // updateFrequency
  dbg?: boolean;          // debug
  filter?: Filter;
  dbgfilter?: Filter;     // debugFilter

  // Legacy/alternative property names for backward compatibility
  description?: string;
  parameters?: any[];
  receive?: {
    address: number;
    mask: number;
  };
  receiveAddress?: number;
  receiveAddressMask?: number;
  timeout?: number;
  extendedAddress?: number;
  testerAddress?: number;
  forceFlowControlResponse?: boolean;
  carProtocolStrategy?: CarProtocolStrategy;
  canPriority?: number;
}

// Result of command position check
export interface CommandPositionResult {
  isCommand: boolean;
  commandObject?: Command;
  range?: vscode.Range;
}

// Cache entry structure
export interface CacheEntry {
  image: string;
  timestamp: number;
}