import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const HEADER = 'header_media_url';

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URI });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const templates = await prisma.template.findMany({
    where: { metaTemplateName: { startsWith: 'extrahand_' } },
    include: {
      currentVersion: true,
      versions: { orderBy: { version: 'desc' }, take: 5 },
    },
  });

  for (const template of templates) {
    const currentJson = JSON.stringify(template.currentVersion?.components ?? '');
    const hasCurrent = currentJson.includes(HEADER);
    let hasOld = false;
    let oldUrl = '';

    for (const version of template.versions) {
      const versionJson = JSON.stringify(version.components);
      if (versionJson.includes(HEADER)) {
        hasOld = true;
        const match = versionJson.match(/header_media_url":"([^"]+)/);
        if (match?.[1]) {
          oldUrl = match[1];
        }
        break;
      }
    }

    const components = template.currentVersion?.components;
    const hasImageHeader =
      Array.isArray(components) &&
      components.some(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          (c as { type?: string }).type === 'HEADER' &&
          (c as { format?: string }).format === 'IMAGE',
      );

    if (hasImageHeader) {
      console.log(
        `${template.metaTemplateName} | current MinIO: ${hasCurrent} | older version MinIO: ${hasOld}`,
        oldUrl ? `| ${oldUrl.slice(0, 100)}` : '',
      );
    }
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
