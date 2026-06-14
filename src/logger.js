// ============================================================
// src/logger.js
// Winston-powered logger — structured logs, rotating files,
// console color for dev, JSON for prod. Clean and mean.
// ============================================================

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs-extra');

/**
 * Build the logger from config.
 * @param {object} logConfig — the "logging" block from config.json
 */
function buildLogger(logConfig) {
  // Make sure the log directory exists before Winston tries to write
  fs.ensureDirSync(logConfig.log_dir);

  const logFile     = path.join(logConfig.log_dir, 'proxy.log');
  const errorFile   = path.join(logConfig.log_dir, 'error.log');

  // Pretty format for your terminal — timestamp + color + message
  const consoleFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level}: ${message}${extras}`;
    })
  );

  // JSON format for log files — machine-parseable, grep-friendly
  const fileFormat = format.combine(
    format.timestamp(),
    format.json()
  );

  return createLogger({
    level: logConfig.level || 'info',
    transports: [

      // Console — human-readable, colored
      new transports.Console({ format: consoleFormat }),

      // Combined log — everything at or above configured level
      new transports.File({
        filename: logFile,
        format: fileFormat,
        maxsize: parseSize(logConfig.max_file_size || '10m'),
        maxFiles: logConfig.max_files || 5,
      }),

      // Error log — only error-level events
      new transports.File({
        filename: errorFile,
        level: 'error',
        format: fileFormat,
        maxsize: parseSize(logConfig.max_file_size || '10m'),
        maxFiles: logConfig.max_files || 5,
      }),
    ],
  });
}

/**
 * Parse size strings like "10m" or "1g" into bytes.
 * Winston's maxsize expects a plain number.
 */
function parseSize(str) {
  const units = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  const match  = String(str).toLowerCase().match(/^(\d+)([kmg]?)$/);
  if (!match) return 10 * 1024 * 1024; // default 10 MB
  const [, num, unit] = match;
  return parseInt(num, 10) * (units[unit] || 1);
}

module.exports = { buildLogger };
