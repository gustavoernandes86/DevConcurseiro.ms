/**
 * Global Express error handling middleware.
 */
function errorHandler(err, req, res, next) {
    console.error('[Error Handler]:', err);

    const status = err.statusCode || err.status || 500;
    const message = err.publicMessage || err.message || 'Erro interno do servidor';

    res.status(status).json({
        error: message
    });
}

module.exports = errorHandler;
