/**
 * Wraps an asynchronous route handler to catch errors and forward them to the next middleware.
 * @param {Function} handler - Express route handler function.
 * @returns {Function} Express middleware.
 */
function asyncRoute(handler) {
    return async function wrapped(req, res, next) {
        try {
            await handler(req, res, next);
        } catch (err) {
            next(err);
        }
    };
}

module.exports = asyncRoute;
