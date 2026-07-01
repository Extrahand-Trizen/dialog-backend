/**
 * Restores Dialog MinIO preview URLs on the current template version when a sync
 * replaced them with Meta-only header_handle CDN links.
 *
 * Usage: npx ts-node --transpile-only scripts/repairTemplateMediaUrls.ts
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY,
  DIALOG_HEADER_MEDIA_URL_KEY,
  mergeDialogMediaUrlsIntoSyncedComponents,
} from '../src/modules/templates/templates.meta';
import { normalizeTemplateMediaPublicUrl } from '../src/infrastructure/storage/templateMediaStorage';

const HEADER = DIALOG_HEADER_MEDIA_URL_KEY;
const CAROUSEL = DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractMediaUrls(components: unknown): {
  headerUrl?: string;
  carouselUrls: string[];
} {
  const carouselUrls: string[] = [];
  if (!Array.isArray(components)) {
    return { carouselUrls };
  }

  let headerUrl: string | undefined;
  for (const raw of components) {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      continue;
    }

    if (raw.type.toUpperCase() === 'HEADER') {
      const example = isRecord(raw.example) ? raw.example : null;
      const url = example && typeof example[HEADER] === 'string' ? example[HEADER].trim() : '';
      if (url) {
        headerUrl = normalizeTemplateMediaPublicUrl(url);
      }
    }

    if (raw.type.toUpperCase() === 'CAROUSEL' && Array.isArray(raw.cards)) {
      for (const card of raw.cards) {
        if (!isRecord(card) || !Array.isArray(card.components)) {
          continue;
        }
        for (const comp of card.components) {
          if (!isRecord(comp) || comp.type !== 'HEADER') {
            continue;
          }
          const example = isRecord(comp.example) ? comp.example : null;
          const url =
            example && typeof example[CAROUSEL] === 'string' ? example[CAROUSEL].trim() : '';
          if (url) {
            carouselUrls.push(normalizeTemplateMediaPublicUrl(url));
          }
        }
      }
    }
  }

  return { headerUrl, carouselUrls };
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URI });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const templates = await prisma.template.findMany({
    include: {
      currentVersion: true,
      versions: { orderBy: { version: 'desc' } },
    },
  });

  let repaired = 0;

  for (const template of templates) {
    const currentVersion = template.currentVersion;
    if (!currentVersion) {
      continue;
    }

    const currentMedia = extractMediaUrls(currentVersion.components);
    if (currentMedia.headerUrl || currentMedia.carouselUrls.length > 0) {
      continue;
    }

    let donorComponents: unknown | null = null;
    for (const version of template.versions) {
      const media = extractMediaUrls(version.components);
      if (media.headerUrl || media.carouselUrls.length > 0) {
        donorComponents = version.components;
        break;
      }
    }

    if (!donorComponents) {
      continue;
    }

    const merged = mergeDialogMediaUrlsIntoSyncedComponents(
      currentVersion.components,
      donorComponents,
    );

    if (JSON.stringify(merged) === JSON.stringify(currentVersion.components)) {
      continue;
    }

    await prisma.templateVersion.update({
      where: { id: currentVersion.id },
      data: {
        components: merged as Prisma.InputJsonValue,
      },
    });

    const restored = extractMediaUrls(merged);
    console.log(
      `Repaired ${template.metaTemplateName} -> ${restored.headerUrl ?? '(carousel only)'}`,
    );
    repaired += 1;
  }

  console.log(`\nDone. Repaired ${repaired} template version(s).`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
