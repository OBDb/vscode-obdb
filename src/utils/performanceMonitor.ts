/**
 * Performance monitoring utility for tracking operation timings throughout the extension.
 * All timings are logged to the console with detailed context for performance analysis.
 */

export interface PerformanceMetrics {
  operation: string;
  durationMs: number;
  timestamp: number;
  context?: Record<string, any>;
}

export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();
  private static metrics: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS = 1000; // Keep last 1000 metrics in memory

  /**
   * Start timing an operation
   * @param operationId Unique identifier for this operation
   * @param operationName Human-readable operation name
   * @param context Additional context to log
   */
  static startTimer(operationId: string, operationName: string, context?: Record<string, any>): void {
    const startTime = performance.now();
    this.timers.set(operationId, startTime);

    // Disabled logging to reduce noise
    // const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    // console.log(`[PERF START] ${operationName} (${operationId})${contextStr}`);
  }

  /**
   * End timing an operation and log the results
   * @param operationId Unique identifier for this operation
   * @param operationName Human-readable operation name
   * @param context Additional context to log
   */
  static endTimer(operationId: string, operationName: string, context?: Record<string, any>): number | null {
    const startTime = this.timers.get(operationId);
    if (!startTime) {
      console.warn(`[PERF WARN] No start time found for operation: ${operationName} (${operationId})`);
      return null;
    }

    const endTime = performance.now();
    const durationMs = endTime - startTime;
    this.timers.delete(operationId);

    // Store metric
    const metric: PerformanceMetrics = {
      operation: operationName,
      durationMs,
      timestamp: Date.now(),
      context
    };
    this.metrics.push(metric);

    // Keep only last MAX_METRICS
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Disabled logging to reduce noise
    // const severity = this.getSeverity(durationMs);
    // const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    // console.log(`[PERF ${severity}] ${operationName} (${operationId}): ${durationMs.toFixed(2)}ms${contextStr}`);

    return durationMs;
  }

  /**
   * Time an async operation
   * @param operationName Human-readable operation name
   * @param fn Async function to time
   * @param context Additional context to log
   */
  static async timeAsync<T>(
    operationName: string,
    fn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const operationId = `${operationName}-${Date.now()}-${Math.random()}`;
    this.startTimer(operationId, operationName, context);
    try {
      const result = await fn();
      this.endTimer(operationId, operationName, context);
      return result;
    } catch (error) {
      this.endTimer(operationId, operationName, { ...context, error: String(error) });
      throw error;
    }
  }

  /**
   * Time a synchronous operation
   * @param operationName Human-readable operation name
   * @param fn Function to time
   * @param context Additional context to log
   */
  static timeSync<T>(
    operationName: string,
    fn: () => T,
    context?: Record<string, any>
  ): T {
    const operationId = `${operationName}-${Date.now()}-${Math.random()}`;
    this.startTimer(operationId, operationName, context);
    try {
      const result = fn();
      this.endTimer(operationId, operationName, context);
      return result;
    } catch (error) {
      this.endTimer(operationId, operationName, { ...context, error: String(error) });
      throw error;
    }
  }

  /**
   * Log a performance measurement directly
   * @param operationName Human-readable operation name
   * @param durationMs Duration in milliseconds
   * @param context Additional context to log
   */
  static logMetric(operationName: string, durationMs: number, context?: Record<string, any>): void {
    const metric: PerformanceMetrics = {
      operation: operationName,
      durationMs,
      timestamp: Date.now(),
      context
    };
    this.metrics.push(metric);

    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Disabled logging to reduce noise
    // const severity = this.getSeverity(durationMs);
    // const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    // console.log(`[PERF ${severity}] ${operationName}: ${durationMs.toFixed(2)}ms${contextStr}`);
  }

  /**
   * Get performance statistics for a specific operation
   */
  static getStats(operationName: string): {
    count: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    totalMs: number;
  } | null {
    const metrics = this.metrics.filter(m => m.operation === operationName);
    if (metrics.length === 0) {
      return null;
    }

    const durations = metrics.map(m => m.durationMs);
    const totalMs = durations.reduce((sum, d) => sum + d, 0);
    const avgMs = totalMs / durations.length;
    const minMs = Math.min(...durations);
    const maxMs = Math.max(...durations);

    return {
      count: metrics.length,
      avgMs,
      minMs,
      maxMs,
      totalMs
    };
  }

  /**
   * Get all metrics
   */
  static getAllMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear all stored metrics
   */
  static clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Print summary statistics for all operations
   */
  static printSummary(): void {
    const operations = new Set(this.metrics.map(m => m.operation));
    console.log('\n========== PERFORMANCE SUMMARY ==========');
    for (const operation of operations) {
      const stats = this.getStats(operation);
      if (stats) {
        console.log(`\n${operation}:`);
        console.log(`  Count:   ${stats.count}`);
        console.log(`  Average: ${stats.avgMs.toFixed(2)}ms`);
        console.log(`  Min:     ${stats.minMs.toFixed(2)}ms`);
        console.log(`  Max:     ${stats.maxMs.toFixed(2)}ms`);
        console.log(`  Total:   ${stats.totalMs.toFixed(2)}ms`);
      }
    }
    console.log('\n=========================================\n');
  }

  /**
   * Get severity level based on duration
   */
  private static getSeverity(durationMs: number): string {
    if (durationMs < 10) return 'FAST';
    if (durationMs < 50) return 'OK';
    if (durationMs < 200) return 'SLOW';
    if (durationMs < 1000) return 'VERY SLOW';
    return 'CRITICAL';
  }
}

/**
 * Decorator for timing class methods
 */
export function timed(operationName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: any[]) {
      return PerformanceMonitor.timeSync(name, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

/**
 * Decorator for timing async class methods
 */
export function timedAsync(operationName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return PerformanceMonitor.timeAsync(name, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
