"use strict";
/** Shared Postgres URL resolution — no src/ imports (safe for Docker postinstall). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILD_TIME_POSTGRES_FALLBACK = void 0;
exports.isDevDatabaseFlagEnabled = isDevDatabaseFlagEnabled;
exports.resolvePostgresUriFromEnv = resolvePostgresUriFromEnv;
exports.getPrismaDatasourceUrl = getPrismaDatasourceUrl;
exports.BUILD_TIME_POSTGRES_FALLBACK = 'postgresql://build:build@127.0.0.1:5432/build';
function isDevDatabaseFlagEnabled() {
    const value = process.env.USE_DEV_DATABASE;
    return value === 'true' || value === '1';
}
function resolvePostgresUriFromEnv() {
    if (isDevDatabaseFlagEnabled()) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('USE_DEV_DATABASE cannot be enabled when NODE_ENV=production');
        }
        return process.env.POSTGRES_URI_DEV;
    }
    return process.env.POSTGRES_URI;
}
function getPrismaDatasourceUrl() {
    return resolvePostgresUriFromEnv() ?? exports.BUILD_TIME_POSTGRES_FALLBACK;
}
//# sourceMappingURL=databaseUrl.js.map