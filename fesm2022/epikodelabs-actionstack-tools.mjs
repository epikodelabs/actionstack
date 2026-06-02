import { isSystemActionType, salt } from '@epikodelabs/actionstack';

function deepFreeze(o) {
    Object.freeze(o);
    var oIsFunction = typeof o === "function";
    var hasOwnProp = Object.prototype.hasOwnProperty;
    Object.getOwnPropertyNames(o).forEach(function (prop) {
        if (hasOwnProp.call(o, prop)
            && (oIsFunction ? prop !== 'caller' && prop !== 'callee' && prop !== 'arguments' : true)
            && o[prop] !== null
            && (typeof o[prop] === "object" || typeof o[prop] === "function")
            && !Object.isFrozen(o[prop])) {
            deepFreeze(o[prop]);
        }
    });
    return o;
}
;
/**
 * Meta-reducer that prevents state from being mutated anywhere in the app.
 */
async function storeFreeze(reducer) {
    return async function freeze(state, action) {
        state = state || {};
        deepFreeze(state);
        // guard against trying to freeze null or undefined types
        if (action.payload) {
            deepFreeze(action.payload);
        }
        var nextState = await reducer(state, action);
        deepFreeze(nextState);
        return nextState;
    };
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function getLogLevel(level, action, payload, type) {
    if (level === undefined) {
        return undefined;
    }
    switch (typeof level) {
        case 'object':
            return typeof level[type] === 'function'
                ? level[type](...payload)
                : level[type];
        case 'function':
            return level(action);
        default:
            return level;
    }
}
function defaultTitleFormatter(options) {
    const { timestamp, duration } = options;
    return (action, time, took) => {
        const parts = ['action'];
        parts.push(`%c${String(action)}`);
        if (timestamp)
            parts.push(`%c@ ${time}`);
        if (duration)
            parts.push(`%c(in ${took.toFixed(2)} ms)`);
        return parts.join(' ');
    };
}
function logAtLevel(logger, level, ...args) {
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
const defaults = {
    level: 'log',
    logger: console,
    logErrors: true,
    collapsed: undefined,
    predicate: undefined,
    duration: false,
    timestamp: true,
    stateTransformer: (state) => state,
    actionTransformer: (action) => action,
    errorTransformer: (error) => error,
    colors: {
        title: () => 'inherit',
        prevState: () => '#9E9E9E',
        action: () => '#03A9F4',
        nextState: () => '#4CAF50',
        error: () => '#F20404',
    },
    transformer: undefined,
};
function printBuffer(buffer, options) {
    const { logger, actionTransformer, titleFormatter = defaultTitleFormatter(options), collapsed, colors, level, } = options;
    const isUsingDefaultFormatter = typeof options.titleFormatter === 'undefined';
    buffer.forEach((logEntry, key) => {
        const { started, startedTime, action, prevState, error } = logEntry;
        let { took, nextState } = logEntry;
        const nextEntry = buffer[key + 1];
        if (nextEntry) {
            nextState = nextEntry.prevState;
            took = nextEntry.started - started;
        }
        const formattedAction = actionTransformer(action);
        const isCollapsed = typeof collapsed === 'function'
            ? collapsed(() => nextState, action, logEntry)
            : collapsed;
        const formattedTime = formatTime(startedTime);
        const titleCSS = colors?.title ? `color: ${colors.title(formattedAction)};` : '';
        const headerCSS = ['color: gray; font-weight: lighter;'];
        headerCSS.push(titleCSS);
        if (options.timestamp)
            headerCSS.push('color: gray; font-weight: lighter;');
        if (options.duration)
            headerCSS.push('color: gray; font-weight: lighter;');
        const title = titleFormatter(formattedAction, formattedTime, took);
        try {
            if (isCollapsed) {
                if (colors?.title && isUsingDefaultFormatter) {
                    logAtLevel(logger, 'groupCollapsed', `%c ${title}`, ...headerCSS);
                }
                else {
                    logAtLevel(logger, 'groupCollapsed', title);
                }
            }
            else if (colors?.title && isUsingDefaultFormatter) {
                logAtLevel(logger, 'group', `%c ${title}`, ...headerCSS);
            }
            else {
                logAtLevel(logger, 'group', title);
            }
        }
        catch (e) {
            logAtLevel(logger, 'log', title);
        }
        const prevStateLevel = getLogLevel(level, action, [prevState], 'prevState');
        const actionLevel = getLogLevel(level, action, [formattedAction], 'action');
        const errorLevel = getLogLevel(level, action, [error, prevState], 'error');
        const nextStateLevel = getLogLevel(level, action, [nextState], 'nextState');
        if (prevStateLevel) {
            if (colors?.prevState) {
                const styles = `color: ${colors.prevState(prevState)}; font-weight: bold`;
                logAtLevel(logger, prevStateLevel, '%c prev state', styles, prevState);
            }
            else {
                logAtLevel(logger, prevStateLevel, 'prev state', prevState);
            }
        }
        if (actionLevel) {
            if (colors?.action) {
                const styles = `color: ${colors.action(formattedAction)}; font-weight: bold`;
                logAtLevel(logger, actionLevel, '%c action    ', styles, formattedAction);
            }
            else {
                logAtLevel(logger, actionLevel, 'action    ', formattedAction);
            }
        }
        if (error && errorLevel) {
            if (colors?.error) {
                const styles = `color: ${colors.error(error, prevState)}; font-weight: bold;`;
                logAtLevel(logger, errorLevel, '%c error     ', styles, error);
            }
            else {
                logAtLevel(logger, errorLevel, 'error     ', error);
            }
        }
        if (nextStateLevel) {
            if (colors?.nextState) {
                const styles = `color: ${colors.nextState(nextState)}; font-weight: bold`;
                logAtLevel(logger, nextStateLevel, '%c next state', styles, nextState);
            }
            else {
                logAtLevel(logger, nextStateLevel, 'next state', nextState);
            }
        }
        try {
            logAtLevel(logger, 'groupEnd');
        }
        catch (e) {
            logAtLevel(logger, 'log', '—— log end ——');
        }
    });
}
const repeat = (str, times) => new Array(times + 1).join(str);
const pad = (num, maxLength) => repeat('0', maxLength - num.toString().length) + num;
const formatTime = (time) => `${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;
const timer = typeof performance !== 'undefined' && performance !== null && typeof performance.now === 'function'
    ? performance
    : Date;
/**
 * Creates a logger with the provided options.
 * @param {CreateLoggerOptions} [options={}] - Options for creating the logger.
 * @returns A function that acts as a logger middleware.
 */
const createLogger = (options = {}) => {
    const loggerOptions = Object.assign({}, defaults, options);
    let loggerCreator = () => (next) => (action) => next(action);
    const { logger, stateTransformer, errorTransformer, predicate, logErrors } = loggerOptions;
    if (logger !== undefined) {
        const logBuffer = [];
        loggerCreator = (api) => (next) => async (action) => {
            // Exit early if predicate function returns 'false'
            if (typeof predicate === 'function' && !predicate(api.getState, action)) {
                return next(action);
            }
            const logEntry = {};
            logBuffer.push(logEntry);
            logEntry.started = timer.now();
            logEntry.startedTime = new Date();
            logEntry.prevState = stateTransformer(api.getState());
            logEntry.action = action;
            let returnedValue;
            if (logErrors) {
                try {
                    returnedValue = await next(action);
                }
                catch (e) {
                    logEntry.error = errorTransformer(e);
                }
            }
            else {
                returnedValue = await next(action);
            }
            logEntry.took = timer.now() - logEntry.started;
            logEntry.nextState = stateTransformer(api.getState());
            printBuffer(logBuffer, loggerOptions);
            logBuffer.length = 0;
            if (logEntry.error)
                throw logEntry.error;
            return returnedValue;
        };
    }
    loggerCreator.signature = '6.q.w.c.i.m.9.n.j.y';
    return loggerCreator;
};
/**
 * Default logger middleware instance.
 */
const logger = createLogger();

/**
 * Creates a middleware function for logging action performance data.
 *
 * @returns {Function} - The middleware function to be added to the ActionStack middleware chain.
 */
const createPerformanceMonitor = () => {
    const perfmon = () => (next) => async (action) => {
        async function processAction(action) {
            const startTime = performance.now(); // Capture the start time
            await next(action); // Dispatch the action using the next middleware
            const endTime = performance.now(); // Capture the end time
            const duration = Math.round((endTime - startTime) * 100000) / 100000;
            // Generate a unique identifier based on system action type or a random string
            const uniqueId = (isSystemActionType(action.type))
                ? `[⚙️ ${salt(5).split('').join('.')}]`
                : `[🤹 ${salt(5).split('').join('.')}]`;
            console.groupCollapsed(`%caction %c${action.type}%c @ ${new Date().toISOString()} (duration: ${duration.toFixed(5)} ms)\n${uniqueId}`, 'color: gray; font-weight: lighter;', // styles for 'action'
            'color: black; font-weight: bold;', // styles for action label
            'color: gray; font-weight: lighter;' // styles for the rest of the string
            );
            console.groupEnd();
        }
        return await processAction(action);
    };
    perfmon.signature = '2.m.z.d.u.x.w.l.v.e';
    return perfmon;
};
// Create a pre-configured instance of the performance middleware
/**
 * Preconfigured performance monitor middleware.
 */
const perfmon = createPerformanceMonitor();

/*
 * Public API Surface of actionstack
 */

/**
 * Generated bundle index. Do not edit.
 */

export { createLogger, createPerformanceMonitor, logger, perfmon, storeFreeze };
//# sourceMappingURL=epikodelabs-actionstack-tools.mjs.map
