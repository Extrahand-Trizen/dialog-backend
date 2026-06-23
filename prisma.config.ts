import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { getPostgresUri } from './src/config/env';

const buildTimeFallback = 'postgresql://build:build@127.0.0.1:5432/build';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getPostgresUri() ?? buildTimeFallback,
  },
});
