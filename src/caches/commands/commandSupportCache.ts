import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PerformanceMonitor } from '../../utils/performanceMonitor';

/**
 * Cache entry for YAML file data
 */
interface YamlCacheEntry {
  mtime: number;
  data: any;
}

/**
 * Cache entry for directory listings
 */
interface DirectoryCacheEntry {
  mtime: number;
  entries: string[];
}

/**
 * Cache entry for command support results
 */
interface CommandSupportCacheEntry {
  supported: string[];
  unsupported: string[];
  timestamp: number;
}

/**
 * Cache entry for batch-loaded command support data
 */
interface BatchCommandSupportCacheEntry {
  data: Map<string, { supported: string[], unsupported: string[] }>;
  timestamp: number;
}

/**
 * Loads YAML content with ECU keys forced to strings
 */
function loadCommandSupportYaml(content: string): any {
  // Simple regex-based approach to quote ECU keys that look like hex/numeric
  const processedContent = content.replace(
    /^(\s+)([0-9A-Fa-f]{2,3}):\s*$/gm,
    '$1"$2":'
  );

  try {
    return yaml.load(processedContent);
  } catch (error) {
    // Fallback to original content if preprocessing causes issues
    console.warn('Preprocessed YAML failed, falling back to original:', error);
    return yaml.load(content);
  }
}

/**
 * Cache manager for command support data to avoid repeated file system operations
 */
export class CommandSupportCache {
  private yamlCache: Map<string, YamlCacheEntry> = new Map();
  private directoryCache: Map<string, DirectoryCacheEntry> = new Map();
  private commandSupportCache: Map<string, CommandSupportCacheEntry> = new Map();
  private batchCommandSupportCache: Map<string, BatchCommandSupportCacheEntry> = new Map();
  private testCasesDirMtime: number = 0;
  private readonly BATCH_CACHE_MAX_AGE = 60000; // 1 minute

  constructor() {}

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.yamlCache.clear();
    this.directoryCache.clear();
    this.commandSupportCache.clear();
    this.batchCommandSupportCache.clear();
    this.testCasesDirMtime = 0;
  }

  /**
   * Clear caches for a specific workspace
   */
  clearWorkspace(workspaceRoot: string): void {
    const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');

    // Clear all entries that start with this workspace path
    for (const key of this.yamlCache.keys()) {
      if (key.startsWith(testCasesPath)) {
        this.yamlCache.delete(key);
      }
    }

    for (const key of this.directoryCache.keys()) {
      if (key.startsWith(testCasesPath)) {
        this.directoryCache.delete(key);
      }
    }

    for (const key of this.commandSupportCache.keys()) {
      if (key.startsWith(workspaceRoot)) {
        this.commandSupportCache.delete(key);
      }
    }

    // Clear batch cache for this workspace
    this.batchCommandSupportCache.delete(workspaceRoot);
  }

  /**
   * Check if the test_cases directory has been modified
   */
  async checkTestCasesModified(workspaceRoot: string): Promise<boolean> {
    const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');

    try {
      const stat = await fs.promises.stat(testCasesPath);
      const currentMtime = stat.mtimeMs;

      if (this.testCasesDirMtime === 0) {
        this.testCasesDirMtime = currentMtime;
        return false;
      }

      if (currentMtime !== this.testCasesDirMtime) {
        this.testCasesDirMtime = currentMtime;
        return true;
      }

      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get cached YAML file data or read and cache it
   */
  async getYamlFile(filePath: string): Promise<any | null> {
    const opId = `cache-yaml-${Date.now()}-${Math.random()}`;
    PerformanceMonitor.startTimer(opId, 'CommandSupportCache.getYamlFile', { filePath });

    try {
      const stat = await fs.promises.stat(filePath);
      const currentMtime = stat.mtimeMs;

      const cached = this.yamlCache.get(filePath);
      if (cached && cached.mtime === currentMtime) {
        PerformanceMonitor.endTimer(opId, 'CommandSupportCache.getYamlFile', {
          result: 'cache-hit',
          filePath
        });
        return cached.data;
      }

      // Read and parse the file
      const readStartTime = performance.now();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const readTime = performance.now() - readStartTime;
      PerformanceMonitor.logMetric('CommandSupportCache.readFile', readTime, { filePath });

      const parseStartTime = performance.now();
      const data = loadCommandSupportYaml(content);
      const parseTime = performance.now() - parseStartTime;
      PerformanceMonitor.logMetric('CommandSupportCache.parseYAML', parseTime, { filePath });

      // Cache it
      this.yamlCache.set(filePath, {
        mtime: currentMtime,
        data: data
      });

      PerformanceMonitor.endTimer(opId, 'CommandSupportCache.getYamlFile', {
        result: 'cache-miss',
        filePath,
        readTime,
        parseTime
      });

      return data;
    } catch (err) {
      PerformanceMonitor.endTimer(opId, 'CommandSupportCache.getYamlFile', {
        result: 'error',
        filePath,
        error: String(err)
      });
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Get cached directory listing or read and cache it
   */
  async getDirectoryEntries(dirPath: string): Promise<string[]> {
    const opId = `cache-dir-${Date.now()}-${Math.random()}`;
    PerformanceMonitor.startTimer(opId, 'CommandSupportCache.getDirectoryEntries', { dirPath });

    try {
      const stat = await fs.promises.stat(dirPath);
      const currentMtime = stat.mtimeMs;

      const cached = this.directoryCache.get(dirPath);
      if (cached && cached.mtime === currentMtime) {
        PerformanceMonitor.endTimer(opId, 'CommandSupportCache.getDirectoryEntries', {
          result: 'cache-hit',
          dirPath,
          entryCount: cached.entries.length
        });
        return cached.entries;
      }

      // Read the directory
      const entries = await fs.promises.readdir(dirPath);

      // Cache it
      this.directoryCache.set(dirPath, {
        mtime: currentMtime,
        entries: entries
      });

      PerformanceMonitor.endTimer(opId, 'CommandSupportCache.getDirectoryEntries', {
        result: 'cache-miss',
        dirPath,
        entryCount: entries.length
      });

      return entries;
    } catch (err) {
      PerformanceMonitor.endTimer(opId, 'CommandSupportCache.getDirectoryEntries', {
        result: 'error',
        dirPath,
        error: String(err)
      });
      return [];
    }
  }

  /**
   * Get cached command support data
   */
  getCommandSupport(workspaceRoot: string, commandId: string): CommandSupportCacheEntry | null {
    const key = `${workspaceRoot}:${commandId}`;
    const result = this.commandSupportCache.get(key) || null;
    PerformanceMonitor.logMetric('CommandSupportCache.getCommandSupport', 0, {
      commandId,
      result: result ? 'hit' : 'miss'
    });
    return result;
  }

  /**
   * Set command support data in cache
   */
  setCommandSupport(workspaceRoot: string, commandId: string, supported: string[], unsupported: string[]): void {
    const key = `${workspaceRoot}:${commandId}`;
    this.commandSupportCache.set(key, {
      supported,
      unsupported,
      timestamp: Date.now()
    });
  }

  /**
   * Clear command support cache entries older than the specified age (in milliseconds)
   */
  clearOldCommandSupportEntries(maxAge: number = 60000): void {
    const now = Date.now();
    for (const [key, entry] of this.commandSupportCache.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.commandSupportCache.delete(key);
      }
    }
  }

  /**
   * Get batch-loaded command support data (cached)
   */
  getBatchCommandSupport(workspaceRoot: string): Map<string, { supported: string[], unsupported: string[] }> | null {
    const cached = this.batchCommandSupportCache.get(workspaceRoot);
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    const now = Date.now();
    if (now - cached.timestamp > this.BATCH_CACHE_MAX_AGE) {
      this.batchCommandSupportCache.delete(workspaceRoot);
      return null;
    }

    return cached.data;
  }

  /**
   * Set batch-loaded command support data in cache
   */
  setBatchCommandSupport(
    workspaceRoot: string,
    data: Map<string, { supported: string[], unsupported: string[] }>
  ): void {
    this.batchCommandSupportCache.set(workspaceRoot, {
      data,
      timestamp: Date.now()
    });
  }
}
