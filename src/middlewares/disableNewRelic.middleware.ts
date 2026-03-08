import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to disable New Relic transaction tracking for specific routes
 * This is necessary because New Relic's instrumentation can interfere with
 * multipart/form-data stream handling in multer/busboy
 */
export const disableNewRelicForRoute = (req: Request, res: Response, next: NextFunction) => {
    try {
        // Check if New Relic is available
        const newrelic = require('newrelic');
        if (newrelic && newrelic.getTransaction) {
            const transaction = newrelic.getTransaction();
            if (transaction) {
                // Ignore this transaction to prevent instrumentation interference
                transaction.ignore();
            }
        }
    } catch (error) {
        // New Relic might not be loaded or available, continue anyway
        console.warn('[Middleware] New Relic not available for transaction ignore');
    }
    next();
};
