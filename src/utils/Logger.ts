/**
 * Logging System
 * Provides structured logging for the entire application
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: unknown;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLogLevel && envLogLevel in LogLevel) {
      this.logLevel = LogLevel[envLogLevel as keyof typeof LogLevel];
    } else if (process.env.RUNNER_DEBUG === '1' || process.env.ACTIONS_STEP_DEBUG === 'true') {
      this.logLevel = LogLevel.DEBUG;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Resets the singleton instance. Used for testing purposes.
   */
  public static resetInstance(): void {
    Logger.instance = undefined as unknown as Logger;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, undefined, error);
    } else {
      this.log(LogLevel.ERROR, message, error);
    }
  }

  public warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  public info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  public debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  public group(name: string): void {
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::group::${name}`);
    } else {
      this.info(`=== ${name} ===`);
    }
  }

  public endGroup(): void {
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log('::endgroup::');
    }
  }

  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    if (level > this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
    };

    if (data) {
      logEntry.data = data;
    }

    if (error) {
      logEntry.error = error;
    }

    const logString = this.formatLogEntry(logEntry);

    if (level === LogLevel.ERROR) {
      console.error(logString);
    } else if (level === LogLevel.WARN) {
      console.warn(logString);
    } else {
      console.log(logString);
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    if (process.env.GITHUB_ACTIONS === 'true') {
      if (entry.level === 'DEBUG') {
        return `::debug::${this.formatMessageOnly(entry)}`;
      }
      if (entry.level === 'WARN') {
        return `::warning::${this.formatMessageOnly(entry)}`;
      }
      if (entry.level === 'ERROR') {
        return `::error::${this.formatMessageOnly(entry)}`;
      }
    }

    const parts = [`[${entry.timestamp}]`, `[${entry.level}]`, entry.message];

    if (entry.data) {
      parts.push(`Data: ${JSON.stringify(entry.data)}`);
    }

    if (entry.error) {
      parts.push(`Error: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`Stack: ${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  private formatMessageOnly(entry: LogEntry): string {
    const parts = [entry.message];

    if (entry.data) {
      parts.push(`Data: ${JSON.stringify(entry.data)}`);
    }

    if (entry.error) {
      parts.push(`Error: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`Stack: ${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }
}
