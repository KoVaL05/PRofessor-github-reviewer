import fs from 'fs';
import path from 'path';

/**
 * Simple logger utility for tracking API calls and metrics
 */
export class Logger {
  private static instance: Logger;
  private logs: Array<{ timestamp: Date; level: string; message: string; metadata?: any }> = [];
  private logDir: string;
  private logFile: string;

  private constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Set log file path with the current date
    this.logFile = path.join(this.logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
  }

  /**
   * Get the logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log an info message
   */
  public info(message: string, metadata?: any): void {
    this.log('INFO', message, metadata);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, metadata?: any): void {
    this.log('WARN', message, metadata);
  }

  /**
   * Log an error message
   */
  public error(message: string, metadata?: any): void {
    this.log('ERROR', message, metadata);
  }

  /**
   * Log a debug message
   */
  public debug(message: string, metadata?: any): void {
    if (process.env.DEBUG === 'true') {
      this.log('DEBUG', message, metadata);
    }
  }

  /**
   * Log an API request
   */
  public logApiCall(
    service: string,
    method: string,
    duration: number,
    status: string,
    metadata?: any,
  ): void {
    this.log('API', `${service}.${method} - ${status} (${duration}ms)`, metadata);
  }

  /**
   * Internal log method
   */
  private log(level: string, message: string, metadata?: any): void {
    const logEntry = {
      timestamp: new Date(),
      level,
      message,
      metadata,
    };

    this.logs.push(logEntry);

    // Format log message
    const formattedTime = logEntry.timestamp.toISOString();
    const formattedMessage = `[${formattedTime}] [${level}] ${message}`;

    // Output to console
    if (level === 'ERROR') {
      console.error(formattedMessage);
    } else if (level === 'WARN') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    if (metadata && process.env.VERBOSE === 'true') {
      console.log(JSON.stringify(metadata, null, 2));
    }

    // Write to log file
    try {
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
      if (metadata && process.env.VERBOSE === 'true') {
        fs.appendFileSync(this.logFile, JSON.stringify(metadata, null, 2) + '\n');
      }
    } catch (err) {
      console.error('Error writing to log file:', err);
    }
  }

  /**
   * Get all logs
   */
  public getLogs(): Array<{ timestamp: Date; level: string; message: string; metadata?: any }> {
    return this.logs;
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logs = [];
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();
