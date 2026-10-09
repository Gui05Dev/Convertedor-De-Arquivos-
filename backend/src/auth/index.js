'use strict';

/* Autenticação do backend.

   No deploy, quem faz o login é o oauth2-proxy (sessão em cookie, fluxo OIDC com o
   Keycloak) e o nginx só deixa passar requisições autenticadas. Mesmo assim o backend
   valida, por conta própria, o access token que o nginx encaminha no header
   Authorization (defesa em profundidade): se alguém alcançar o backend por outro
   caminho, sem token válido não passa.

   A identidade do usuário (dono dos trabalhos) é o `sub` do token — estável e único no
   realm. Nenhum header como X-User / X-Forwarded-User é considerado. */

const { createRemoteJWKSet, jwtVerify, errors: joseErrors } = require('jose');
const { HttpError } = require('../lib/errors');

class AuthError extends HttpError {
  constructor(message = 'Sessão expirada ou ausente. Entre novamente.', status = 401, code = 'unauthenticated') {
    super(message, status, code);
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(header);
  return match ? match[1] : null;
}

function realmRoles(payload) {
  return Array.isArray(payload?.realm_access?.roles) ? payload.realm_access.roles : [];
}

function createAuth(cfg, { logger, jwks } = {}) {
  if (cfg.authMode === 'dev') {
    return {
      mode: 'dev',
      middleware(req, res, next) {
        req.user = { id: `dev:${cfg.authDevUser}`, username: cfg.authDevUser, name: cfg.authDevUser };
        next();
      },
    };
  }

  const keySet = jwks || createRemoteJWKSet(new URL(cfg.oidcJwksUrl), {
    timeoutDuration: 5000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });

  async function verify(token) {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: cfg.oidcIssuer,
      audience: cfg.oidcAudience,
      algorithms: ['RS256', 'RS384', 'RS512', 'PS256', 'ES256', 'ES384'],
      clockTolerance: cfg.oidcClockToleranceSeconds,
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    if (payload.typ && !['Bearer', 'at+jwt'].includes(payload.typ)) {
      throw new AuthError('Token de tipo inválido.', 401, 'invalid_token');
    }
    if (cfg.oidcRequiredRole && !realmRoles(payload).includes(cfg.oidcRequiredRole)) {
      throw new AuthError('Seu usuário não tem permissão para usar esta ferramenta.', 403, 'forbidden');
    }
    const username = payload[cfg.oidcUsernameClaim] || payload.preferred_username || payload.sub;
    return { id: payload.sub, username, name: payload.name || username };
  }

  return {
    mode: 'oidc',
    verify,
    async middleware(req, res, next) {
      const token = bearerToken(req);
      if (!token) return next(new AuthError());
      try {
        req.user = await verify(token);
        return next();
      } catch (err) {
        if (err instanceof AuthError) return next(err);
        if (err instanceof joseErrors.JWKSTimeout || err?.code === 'ERR_JWKS_TIMEOUT' || err?.code === 'ERR_JOSE_GENERIC') {
          logger?.error('auth.jwks_unavailable', { code: err.code });
          return next(new HttpError('Serviço de autenticação indisponível no momento. Tente novamente.', 503, 'auth_unavailable'));
        }
        logger?.warn('auth.rejected', { code: err?.code || err?.name, ip: req.ip });
        return next(new AuthError());
      }
    },
  };
}

module.exports = { createAuth, AuthError };
