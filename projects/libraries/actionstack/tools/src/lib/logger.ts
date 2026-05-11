/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { Action } from '@epikodelabs/actionstack';

type LogLevelName = 'log' | 'warn' | 'error' | 'info' | 'debug' | 'group' | 'groupCollapsed' | 'groupEnd';

type LevelConfig =
  | LogLevelName
  | ((action: Action) => LogLevelName)
  | Record<string, LogLevelName>;

function getLogLevel(
  level: LevelConfig | undefined,
  action: Action,
  payload: unknown[],
  type: string
): LogLevelName | undefined {
  if (level === undefined) {
    return undefined;
  }
  switch (typeof level) {
    case 'object':
      return typeof level[type] === 'function'
        ? (level[type] as (...args: unknown[]) => LogLevelName)(...payload)
        : (level[type] as LogLevelName);
    case 'function':
      return (level as (action: Action) => LogLevelName)(action);
    default:
      return level as LogLevelName;
  }
}

type TitleFormatter = (action: unknown, time: string, took: number) => string;

function defaultTitleFormatter(options: LoggerOptions): TitleFormatter {
  const { timestamp, duration } = options;

  return (action, time, took): string => {
    const parts = ['action'];

    parts.push(`%c${String(action)}`);
    if (timestamp) parts.push(`%c@ ${time}`);
    if (duration) parts.push(`%c(in ${took.toFixed(2)} ms)`);

    return parts.join(' ');
  };
}

function logAtLevel(logger: Console, level: LogLevelName, ...args: unknown[]): void {
  switch (level) {
    case 'warn':
      logger.warn(...args);
      break;
    case 'error':
      logger.error(...args);
      break;
    case 'info':
      logger.info(...args);
      break;
    case 'debug':
      logger.debug(...args);
      break;
    case 'group':
      logger.group(...args);
      break;
    case 'groupCollapsed':
      logger.groupCollapsed(...args);
      break;
    case 'groupEnd':
      logger.groupEnd();
      break;
    default:
      logger.log(...args);
      break;
  }
}

interface Colors {
  title?: (action: unknown) => string;
  prevState?: (prevState: unknown) => string;
  action?: (action: unknown) => string;
  nextState?: (nextState: unknown) => string;
  error?: (error: unknown, prevState: unknown) => string;
}

interface LogEntry {
  started: number;
  startedTime: Date;
  prevState: unknown;
  action: Action;
  error?: unknown;
  took: number;
  nextState: unknown;
}

interface LoggerOptions {
  level?: LevelConfig;
  logger?: Console;
  logErrors?: boolean;
  collapsed?: boolean | ((getState: () => unknown, action: Action, logEntry: LogEntry) => boolean);
  predicate?: (getState: () => unknown, action: Action) => boolean;
  duration?: boolean;
  timestamp?: boolean;
  stateTransformer?: (state: unknown) => unknown;
  actionTransformer?: (action: Action) => unknown;
  errorTransformer?: (error: unknown) => unknown;
  colors?: Colors;
  transformer?: unknown;
  titleFormatter?: TitleFormatter;
}

interface CreateLoggerOptions extends LoggerOptions {
  getState?: () => unknown;
  dispatch?: (action: Action) => unknown;
}

const defaults: LoggerOptions = {
  level: 'log',
  logger: console,
  logErrors: true,
  collapsed: undefined,
  predicate: undefined,
  duration: false,
  timestamp: true,
  stateTransformer: (state: unknown) => state,
  actionTransformer: (action: Action) => action,
  errorTransformer: (error: unknown) => error,
  colors: {
    title: () => 'inherit',
    prevState: () => '#9E9E9E',
    action: () => '#03A9F4',
    nextState: () => '#4CAF50',
    error: () => '#F20404',
  },
  transformer: undefined,
};

function printBuffer(buffer: LogEntry[], options: LoggerOptions): void {
  const {
    logger,
    actionTransformer,
    titleFormatter = defaultTitleFormatter(options),
    collapsed,
    colors,
    level,
  } = options;

  const isUsingDefaultFormatter = typeof options.titleFormatter === 'undefined';

  buffer.forEach((logEntry, key) => {
    const { started, startedTime, action, prevState, error } = logEntry;
    let { took, nextState } = logEntry;
    const nextEntry = buffer[key + 1];

    if (nextEntry) {
      nextState = nextEntry.prevState;
      took = nextEntry.started - started;
    }

    const formattedAction = actionTransformer!(action);
    const isCollapsed =
      typeof collapsed === 'function'
        ? collapsed(() => nextState, action, logEntry)
        : collapsed;

    const formattedTime = formatTime(startedTime);
    const titleCSS = colors?.title ? `color: ${colors.title(formattedAction)};` : '';
    const headerCSS = ['color: gray; font-weight: lighter;'];
    headerCSS.push(titleCSS);
    if (options.timestamp) headerCSS.push('color: gray; font-weight: lighter;');
    if (options.duration) headerCSS.push('color: gray; font-weight: lighter;');
    const title = titleFormatter(formattedAction, formattedTime, took);

    try {
      if (isCollapsed) {
        if (colors?.title && isUsingDefaultFormatter) {
          logAtLevel(logger!, 'groupCollapsed', `%c ${title}`, ...headerCSS);
        } else {
          logAtLevel(logger!, 'groupCollapsed', title);
        }
      } else if (colors?.title && isUsingDefaultFormatter) {
        logAtLevel(logger!, 'group', `%c ${title}`, ...headerCSS);
      } else {
        logAtLevel(logger!, 'group', title);
      }
    } catch (e) {
      logAtLevel(logger!, 'log', title);
    }

    const prevStateLevel = getLogLevel(level, action, [prevState], 'prevState');
    const actionLevel = getLogLevel(level, action, [formattedAction], 'action');
    const errorLevel = getLogLevel(level, action, [error, prevState], 'error');
    const nextStateLevel = getLogLevel(level, action, [nextState], 'nextState');

    if (prevStateLevel) {
      if (colors?.prevState) {
        const styles = `color: ${colors.prevState(prevState)}; font-weight: bold`;
        logAtLevel(logger!, prevStateLevel, '%c prev state', styles, prevState);
      } else {
        logAtLevel(logger!, prevStateLevel, 'prev state', prevState);
      }
    }

    if (actionLevel) {
      if (colors?.action) {
        const styles = `color: ${colors.action(formattedAction)}; font-weight: bold`;
        logAtLevel(logger!, actionLevel, '%c action    ', styles, formattedAction);
      } else {
        logAtLevel(logger!, actionLevel, 'action    ', formattedAction);
      }
    }

    if (error && errorLevel) {
      if (colors?.error) {
        const styles = `color: ${colors.error(error, prevState)}; font-weight: bold;`;
        logAtLevel(logger!, errorLevel, '%c error     ', styles, error);
      } else {
        logAtLevel(logger!, errorLevel, 'error     ', error);
      }
    }

    if (nextStateLevel) {
      if (colors?.nextState) {
        const styles = `color: ${colors.nextState(nextState)}; font-weight: bold`;
        logAtLevel(logger!, nextStateLevel, '%c next state', styles, nextState);
      } else {
        logAtLevel(logger!, nextStateLevel, 'next state', nextState);
      }
    }

    try {
      logAtLevel(logger!, 'groupEnd');
    } catch (e) {
      logAtLevel(logger!, 'log', '—— log end ——');
    }
  });
}

const repeat = (str: string, times: number): string => new Array(times + 1).join(str);
const pad = (num: number, maxLength: number): string =>
  repeat('0', maxLength - num.toString().length) + num;
const formatTime = (time: Date): string =>
  `${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;

const timer =
  typeof performance !== 'undefined' && performance !== null && typeof performance.now === 'function'
    ? performance
    : Date;

type NextFn = (action: Action) => unknown;

type LoggerMiddleware = {
  (api: { getState: () => unknown }): (next: NextFn) => NextFn;
  signature?: string;
};

/**
 * Creates a logger with the provided options.
 * @param {CreateLoggerOptions} [options={}] - Options for creating the logger.
 * @returns A function that acts as a logger middleware.
 */
export const createLogger = (options: CreateLoggerOptions = {}): LoggerMiddleware => {
  const loggerOptions: LoggerOptions = Object.assign({}, defaults, options);
  let loggerCreator: LoggerMiddleware = () => (next) => (action) => next(action);

  const { logger, stateTransformer, errorTransformer, predicate, logErrors } = loggerOptions;

  if (logger !== undefined) {
    const logBuffer: LogEntry[] = [];

    loggerCreator = (api) => (next) => async (action) => {
      // Exit early if predicate function returns 'false'
      if (typeof predicate === 'function' && !predicate(api.getState, action)) {
        return next(action);
      }

      const logEntry: LogEntry = {} as LogEntry;

      logBuffer.push(logEntry);

      logEntry.started = timer.now();
      logEntry.startedTime = new Date();
      logEntry.prevState = stateTransformer!(api.getState());
      logEntry.action = action;

      let returnedValue: unknown;
      if (logErrors) {
        try {
          returnedValue = await next(action);
        } catch (e) {
          logEntry.error = errorTransformer!(e);
        }
      } else {
        returnedValue = await next(action);
      }

      logEntry.took = timer.now() - logEntry.started;
      logEntry.nextState = stateTransformer!(api.getState());

      printBuffer(logBuffer, loggerOptions);
      logBuffer.length = 0;

      if (logEntry.error) throw logEntry.error;
      return returnedValue;
    };
  }

  loggerCreator.signature = '6.q.w.c.i.m.9.n.j.y';
  return loggerCreator;
};

/**
 * Default logger middleware instance.
 */
export const logger = createLogger();
