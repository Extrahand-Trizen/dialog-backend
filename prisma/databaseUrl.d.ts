/** Shared Postgres URL resolution — no src/ imports (safe for Docker postinstall). */
export declare const BUILD_TIME_POSTGRES_FALLBACK = "postgresql://build:build@127.0.0.1:5432/build";
export declare function isDevDatabaseFlagEnabled(): boolean;
export declare function resolvePostgresUriFromEnv(): string | undefined;
export declare function getPrismaDatasourceUrl(): string;
