import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const BUILD_TIME_FALLBACK = 'postgresql://build:build@127.0.0.1:5432/build';

function getPrismaDatasourceUrl(): string {
  const useDevDatabase =
    process.env.USE_DEV_DATABASE === 'true' || process.env.USE_DEV_DATABASE === '1';

  if (useDevDatabase) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('USE_DEV_DATABASE cannot be enabled when NODE_ENV=production');
    }
    return process.env.POSTGRES_URI_DEV ?? BUILD_TIME_FALLBACK;
  }

  return process.env.POSTGRES_URI ?? BUILD_TIME_FALLBACK;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getPrismaDatasourceUrl(),
  },
});
