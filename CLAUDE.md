# Claude Code Instructions for OBDb

This project includes an MCP (Model Context Protocol) server that provides access to signalsets and command support data for automotive OBD systems.

## MCP Server

The MCP server is automatically configured via [.mcp.json](.mcp.json). It exposes signalset data, signal information, and model year support matrices.

### Available Resources

- `obdb://signalsets` - List all available signalsets
- `obdb://signalset/{name}` - Get a specific signalset (e.g., "default", "2015-2018")
- `obdb://support/matrix` - Complete command support matrix across all model years

### Available Tools

#### Signalset Operations

- **list_signalsets**: List all signalsets in the workspace
- **get_signalset**: Get a specific signalset by name
  - Parameters: `name` (e.g., "default")

#### Signal Search and Query

- **search_signals**: Search for signals matching criteria
  - Parameters: `signalset`, optional: `pattern`, `path`, `metric`, `commandId`, `includeDetails`
  - Example: Search for all engine-related signals: `pattern: "ENG_.*"`

- **get_signal**: Get a specific signal by ID
  - Parameters: `signalset`, `signalId`
  - Example: Find signal "ENG_COOLANT_TEMP"

- **get_signal_stats**: Get statistics about signals in a signalset
  - Parameters: `name`
  - Returns: total signals, unique IDs, path/metric counts, average bit length

- **get_unique_paths**: List all unique signal paths
  - Parameters: `name`
  - Example paths: "powertrain", "chassis", "body"

- **get_unique_metrics**: List all unique suggested metrics
  - Parameters: `name`
  - Example metrics: "temperature", "pressure", "speed"

#### Command Support

- **get_command_support**: Check which model years support a command
  - Parameters: `commandId` (e.g., "7E0.221100" or "7E0.7E8.221100")
  - Returns: supported years, unsupported years, support percentage

- **get_commands_for_year**: Get all commands for a specific model year
  - Parameters: `year` (e.g., "2020")
  - Returns: list of command IDs supported in that year

#### Validation

- **validate_signalset**: Validate a signalset for common issues
  - Parameters: `name`
  - Checks for: duplicate signal IDs, bit overlaps, missing required fields

## When to Use MCP Tools

The MCP server is most useful for:
- **Cross-file queries**: Searching across multiple signalsets or test years
- **Support matrix lookups**: Finding which model years support specific commands
- **Aggregated data**: Getting statistics, unique lists, or summaries
- **Validation**: Checking for errors like duplicate IDs or bit overlaps

For single-file operations (reading one signalset), agents may prefer direct file access, which is fine!

## Example Use Cases

### Finding Signals (Use MCP tools)

**Best for MCP:**
- "Find all temperature-related signals across all signalsets" - searches multiple files
- "List all unique signal paths in the default signalset" - requires aggregation
- "Show statistics for the default signalset" - requires analysis

**Example queries:**
```
"Use the search_signals tool to find all signals with TEMP in their ID in the default signalset"
"Use get_unique_paths to show me all signal organization paths"
"Use get_signal_stats to analyze the default signalset"
```

### Checking Support (Always use MCP)

**Model year support requires the MCP tools** because they query test case data:

```
"Use get_command_support to check which years support command 7E0.221100"
"Use get_commands_for_year to show all 2020 model year commands"
"Which model years support the signal ENG_COOLANT_TEMP?" (requires get_command_support)
```

### Validation (Always use MCP)

**Validation requires MCP tools:**

```
"Use validate_signalset to check the default signalset for errors"
"Validate that all signals in the default signalset have unique IDs"
"Check for bit overlaps in the default signalset"
```

### Working with Multiple Signalsets

```
"Use list_signalsets to show all available signalsets"
"Compare signal counts across all signalsets"
"Which signalset has the most commands?"
```

## Project Structure

- `signalsets/v3/*.json` - OBD signalset definitions
- `tests/test_cases/YYYY/` - Test data organized by model year
- `tests/test_cases/YYYY/commands/*.yaml` - Test cases per command
- `tests/test_cases/YYYY/command_support.yaml` - Explicit support declarations

## Signalset Format

Signalsets contain commands, which contain signals:

```json
{
  "commands": [
    {
      "hdr": "7E0",
      "cmd": {"22": "1100"},
      "rax": "7E8",
      "signals": [
        {
          "id": "SIGNAL_ID",
          "name": "Human Readable Name",
          "path": "organizational/path",
          "suggestedMetric": "metric_name",
          "bitOffset": 16,
          "bitLength": 8
        }
      ]
    }
  ]
}
```

### Command Properties

- `hdr` - Header (CAN bus address, e.g., "7E0")
- `cmd` - Command (e.g., {"22": "1100"} or "221100")
- `rax` - Receive address filter (e.g., "7E8")
- `proto` - Protocol (iso15765_4_11bit, iso15765_4_29bit, iso9141_2)
- `freq` - Update frequency
- `filter` - Model year filter (to/from/years)
- `dbgfilter` - Debug filter for testing

### Signal Properties

- `id` - Unique identifier
- `name` - Human-readable name
- `path` - Organizational path/category
- `suggestedMetric` - Connectable metric name
- `bitOffset` - Bit position in response (0-indexed)
- `bitLength` - Number of bits

## Tips for Agents

1. **Always validate signalsets** before making changes to catch errors early
2. **Use search_signals** with patterns to explore available signals efficiently
3. **Check command support** across model years before adding new signals
4. **Group related signals** by path for better organization
5. **Use batch operations** when working with multiple commands or years
6. **Verify bit layouts** don't overlap when adding new signals to commands
