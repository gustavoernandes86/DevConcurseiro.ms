const AppError = require('../utils/AppError');

describe('AppError Utility Class', () => {
    test('should construct standard error defaults', () => {
        const error = new AppError('Something went wrong');
        expect(error.message).toBe('Something went wrong');
        expect(error.statusCode).toBe(500);
        expect(error.isOperational).toBe(true);
        expect(error).toBeInstanceOf(Error);
    });

    test('should construct custom status codes', () => {
        const error = new AppError('Not Found Resource', 404);
        expect(error.statusCode).toBe(404);
    });

    test('static badRequest helper should return 400 status', () => {
        const error = AppError.badRequest('Bad Request message');
        expect(error.statusCode).toBe(400);
        expect(error.message).toBe('Bad Request message');
    });

    test('static unauthorized helper should return 401 status', () => {
        const error = AppError.unauthorized('Auth message');
        expect(error.statusCode).toBe(401);
    });

    test('static forbidden helper should return 403 status', () => {
        const error = AppError.forbidden('Forbidden message');
        expect(error.statusCode).toBe(403);
    });

    test('static notFound helper should return 404 status', () => {
        const error = AppError.notFound('NotFound message');
        expect(error.statusCode).toBe(404);
    });

    test('static internal helper should return 500 status', () => {
        const error = AppError.internal('Internal Server error');
        expect(error.statusCode).toBe(500);
    });
});
