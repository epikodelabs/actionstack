import { AsyncReducer, Action } from '@epikodelabs/actionstack';

/**
 * Meta-reducer that prevents state from being mutated anywhere in the app.
 */
declare function storeFreeze(reducer: AsyncReducer): Promise<AsyncReducer>;

type LogLevelName = 'log' | 'warn' | 'error' | 'info' | 'debug' | 'group' | 'groupCollapsed' | 'groupEnd';
type LevelConfig = LogLevelName | ((action: Action) => LogLevelName) | Record<string, LogLevelName>;
type TitleFormatter = (action: unknown, time: string, took: number) => string;
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
type NextFn = (action: Action) => unknown;
type LoggerMiddleware = {
    (api: {
        getState: () => unknown;
    }): (next: NextFn) => NextFn;
    signature?: string;
};
/**
 * Creates a logger with the provided options.
 * @param {CreateLoggerOptions} [options={}] - Options for creating the logger.
 * @returns A function that acts as a logger middleware.
 */
declare const createLogger: (options?: CreateLoggerOptions) => LoggerMiddleware;
/**
 * Default logger middleware instance.
 */
declare const logger: LoggerMiddleware;

/**
 * Creates a middleware function for logging action performance data.
 *
 * @returns {Function} - The middleware function to be added to the ActionStack middleware chain.
 */
declare const createPerformanceMonitor: () => {
    (): (next: Function) => (action: Action<any>) => Promise<any>;
    signature: string;
};
/**
 * Preconfigured performance monitor middleware.
 */
declare const perfmon: {
    (): (next: Function) => (action: Action<any>) => Promise<any>;
    signature: string;
};

export { createLogger, createPerformanceMonitor, logger, perfmon, storeFreeze };
