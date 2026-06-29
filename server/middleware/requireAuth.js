/**
 * Middleware de autenticação: exige que o usuário tenha uma sessão válida.
 * Retorna 401 caso contrário.
 * Aplicado em todas as rotas /api/* exceto /api/auth/*.
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Não autenticado. Faça login para continuar.' });
}

module.exports = requireAuth;
