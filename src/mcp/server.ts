#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { CommandSupportCache } from '../caches/commands/commandSupportCache';
import {
  loadSignalset,
  listSignalsets,
  validateSignalset,
  findCommandById
} from './signalset-loader';
import {
  getSupport,
  getBatchSupport,
  getCommandsForYear,
  getSupportMatrix,
  formatSupportInfo
} from './support-query';
import {
  searchSignals,
  findSignalById,
  getSignalStats,
  getUniquePaths,
  getUniqueMetrics,
  formatSignalResults
} from './signal-search';

// Get workspace root from environment variable or command line arg
const WORKSPACE_ROOT = process.env.OBDB_WORKSPACE_ROOT || process.argv[2] || process.cwd();

// Create shared cache instance
const cache = new CommandSupportCache();

// Create MCP server
const server = new Server(
  {
    name: 'obdb-signalsets',
    version: '1.0.0'
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
);

/**
 * List available resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const signalsets = await listSignalsets(WORKSPACE_ROOT);

  return {
    resources: [
      {
        uri: 'obdb://signalsets',
        name: 'All Signalsets',
        description: 'List of all available signalsets in the workspace',
        mimeType: 'application/json'
      },
      ...signalsets.map(ss => ({
        uri: `obdb://signalset/${ss.name}`,
        name: `Signalset: ${ss.name}`,
        description: `${ss.commandCount} commands, ${ss.signalCount} signals`,
        mimeType: 'application/json'
      })),
      {
        uri: 'obdb://support/matrix',
        name: 'Support Matrix',
        description: 'Complete command support matrix across all model years',
        mimeType: 'application/json'
      }
    ]
  };
});

/**
 * Read a specific resource
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === 'obdb://signalsets') {
    const signalsets = await listSignalsets(WORKSPACE_ROOT);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(signalsets, null, 2)
        }
      ]
    };
  }

  if (uri.startsWith('obdb://signalset/')) {
    const name = uri.replace('obdb://signalset/', '');
    const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${name}.json`);

    try {
      const signalset = await loadSignalset(signalsetPath);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(signalset, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Signalset not found: ${name}`
      );
    }
  }

  if (uri === 'obdb://support/matrix') {
    const matrix = await getSupportMatrix(WORKSPACE_ROOT, cache);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(matrix, null, 2)
        }
      ]
    };
  }

  throw new McpError(
    ErrorCode.InvalidRequest,
    `Unknown resource: ${uri}`
  );
});

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_signalsets',
        description: 'List all available signalsets in the workspace',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_signalset',
        description: 'Get a specific signalset by name',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the signalset (e.g., "default", "2015-2018")'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'search_signals',
        description: 'Search for signals matching criteria (pattern, path, metric, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            signalset: {
              type: 'string',
              description: 'Name of the signalset to search'
            },
            pattern: {
              type: 'string',
              description: 'Regex pattern to match signal ID or name'
            },
            path: {
              type: 'string',
              description: 'Filter by signal path'
            },
            metric: {
              type: 'string',
              description: 'Filter by suggested metric'
            },
            commandId: {
              type: 'string',
              description: 'Filter by command ID'
            },
            includeDetails: {
              type: 'boolean',
              description: 'Include full signal details in output'
            }
          },
          required: ['signalset']
        }
      },
      {
        name: 'get_signal',
        description: 'Get a specific signal by ID',
        inputSchema: {
          type: 'object',
          properties: {
            signalset: {
              type: 'string',
              description: 'Name of the signalset'
            },
            signalId: {
              type: 'string',
              description: 'The signal ID to find'
            }
          },
          required: ['signalset', 'signalId']
        }
      },
      {
        name: 'get_command_support',
        description: 'Get which model years support a specific command',
        inputSchema: {
          type: 'object',
          properties: {
            commandId: {
              type: 'string',
              description: 'The command ID (e.g., "7E0.221100" or "7E0.7E8.221100")'
            }
          },
          required: ['commandId']
        }
      },
      {
        name: 'get_commands_for_year',
        description: 'Get all commands supported in a specific model year',
        inputSchema: {
          type: 'object',
          properties: {
            year: {
              type: 'string',
              description: 'The model year (e.g., "2020")'
            }
          },
          required: ['year']
        }
      },
      {
        name: 'validate_signalset',
        description: 'Validate a signalset for common issues (duplicate IDs, bit overlaps, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the signalset to validate'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'get_signal_stats',
        description: 'Get statistics about signals in a signalset',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the signalset'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'get_unique_paths',
        description: 'Get all unique signal paths in a signalset',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the signalset'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'get_unique_metrics',
        description: 'Get all unique suggested metrics in a signalset',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the signalset'
            }
          },
          required: ['name']
        }
      }
    ]
  };
});

/**
 * Handle tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_signalsets': {
        const signalsets = await listSignalsets(WORKSPACE_ROOT);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(signalsets, null, 2)
            }
          ]
        };
      }

      case 'get_signalset': {
        if (!args || typeof args.name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'name parameter is required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.name}.json`);
        const signalset = await loadSignalset(signalsetPath);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(signalset, null, 2)
            }
          ]
        };
      }

      case 'search_signals': {
        if (!args || typeof args.signalset !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'signalset parameter is required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.signalset}.json`);
        const signalset = await loadSignalset(signalsetPath);

        const results = searchSignals(signalset, {
          pattern: args.pattern as string | undefined,
          path: args.path as string | undefined,
          metric: args.metric as string | undefined,
          commandId: args.commandId as string | undefined
        });

        const formatted = formatSignalResults(results, args.includeDetails as boolean || false);

        return {
          content: [
            {
              type: 'text',
              text: formatted
            }
          ]
        };
      }

      case 'get_signal': {
        if (!args || typeof args.signalset !== 'string' || typeof args.signalId !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'signalset and signalId parameters are required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.signalset}.json`);
        const signalset = await loadSignalset(signalsetPath);
        const results = findSignalById(signalset, args.signalId);

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Signal not found: ${args.signalId}`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case 'get_command_support': {
        if (!args || typeof args.commandId !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'commandId parameter is required');
        }

        const support = await getSupport(args.commandId, WORKSPACE_ROOT, cache);
        const formatted = formatSupportInfo(support);

        return {
          content: [
            {
              type: 'text',
              text: formatted
            }
          ]
        };
      }

      case 'get_commands_for_year': {
        if (!args || typeof args.year !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'year parameter is required');
        }

        const commands = await getCommandsForYear(args.year, WORKSPACE_ROOT, cache);

        return {
          content: [
            {
              type: 'text',
              text: `Commands supported in ${args.year}:\n${commands.join('\n')}`
            }
          ]
        };
      }

      case 'validate_signalset': {
        if (!args || typeof args.name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'name parameter is required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.name}.json`);
        const signalset = await loadSignalset(signalsetPath);
        const errors = validateSignalset(signalset);

        if (errors.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `✓ Signalset ${args.name} is valid`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Validation errors in ${args.name}:\n${errors.join('\n')}`
            }
          ]
        };
      }

      case 'get_signal_stats': {
        if (!args || typeof args.name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'name parameter is required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.name}.json`);
        const signalset = await loadSignalset(signalsetPath);
        const stats = getSignalStats(signalset);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      }

      case 'get_unique_paths': {
        if (!args || typeof args.name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'name parameter is required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.name}.json`);
        const signalset = await loadSignalset(signalsetPath);
        const paths = getUniquePaths(signalset);

        return {
          content: [
            {
              type: 'text',
              text: paths.join('\n')
            }
          ]
        };
      }

      case 'get_unique_metrics': {
        if (!args || typeof args.name !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'name parameter is required');
        }

        const signalsetPath = path.join(WORKSPACE_ROOT, 'signalsets', 'v3', `${args.name}.json`);
        const signalset = await loadSignalset(signalsetPath);
        const metrics = getUniqueMetrics(signalset);

        return {
          content: [
            {
              type: 'text',
              text: metrics.join('\n')
            }
          ]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${message}`
    );
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OBDb MCP server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
