/**
 * One-off diagnostic: list template media URLs and test MinIO + API proxy reachability.
 * Usage: npx ts-node --transpile-only scripts/checkTemplateImages.ts
 */
import 'dotenv/config';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  buildTemplateMediaAssetPath,
  createTemplateMediaAccessToken,
} from '../src/infrastructure/storage/templateMediaAccess';
import {
  buildCanonicalPublicUrl,
  extractObjectKeyFromTemplateMediaUrl,
  isTemplateMediaStorageConfigured,
} from '../src/infrastructure/storage/templateMediaStorage';

const HEADER_MEDIA_URL_KEY = 'header_media_url';
const CAROUSEL_IMAGE_MEDIA_URL_KEY = 'image_media_url';

const PRODUCTION_API = 'https://wa-dialog-backend.backend.extrahand.in/api/v1';

type MediaRef = {
  templateId: string;
  templateName: string;
  organizationId: string;
  kind: 'header' | 'carousel';
  cardIndex?: number;
  storedUrl: string;
  objectKey: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectMediaRefs(
  templateId: string,
  templateName: string,
  organizationId: string,
  components: unknown,
): MediaRef[] {
  const refs: MediaRef[] = [];
  if (!Array.isArray(components)) {
    return refs;
  }

  for (const raw of components) {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      continue;
    }

    const type = raw.type.toUpperCase();

    if (type === 'HEADER') {
      const format = raw.format;
      if (format && String(format).toUpperCase() !== 'TEXT') {
        const example = isRecord(raw.example) ? raw.example : null;
        const mediaUrl =
          example && typeof example[HEADER_MEDIA_URL_KEY] === 'string'
            ? example[HEADER_MEDIA_URL_KEY].trim()
            : '';
        if (mediaUrl) {
          refs.push({
            templateId,
            templateName,
            organizationId,
            kind: 'header',
            storedUrl: mediaUrl,
            objectKey: extractObjectKeyFromTemplateMediaUrl(mediaUrl),
          });
        }
      }
    }

    if (type === 'CAROUSEL' && Array.isArray(raw.cards)) {
      raw.cards.forEach((cardRaw, cardIndex) => {
        if (!isRecord(cardRaw) || !Array.isArray(cardRaw.components)) {
          return;
        }
        for (const compRaw of cardRaw.components) {
          if (!isRecord(compRaw) || compRaw.type !== 'HEADER') {
            continue;
          }
          const example = isRecord(compRaw.example) ? compRaw.example : null;
          const mediaUrl =
            example && typeof example[CAROUSEL_IMAGE_MEDIA_URL_KEY] === 'string'
              ? example[CAROUSEL_IMAGE_MEDIA_URL_KEY].trim()
              : '';
          if (mediaUrl) {
            refs.push({
              templateId,
              templateName,
              organizationId,
              kind: 'carousel',
              cardIndex,
              storedUrl: mediaUrl,
              objectKey: extractObjectKeyFromTemplateMediaUrl(mediaUrl),
            });
          }
        }
      });
    }
  }

  return refs;
}

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: process.env.MINIO_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

async function headMinioObject(objectKey: string): Promise<{ ok: boolean; status: string }> {
  const bucket = process.env.MINIO_BUCKET!;
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return { ok: true, status: '200 HEAD' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: message.slice(0, 120) };
  }
}

async function fetchUrl(url: string): Promise<{ ok: boolean; status: number; contentType?: string }> {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    const contentType = response.headers.get('content-type') ?? undefined;
    return { ok: response.ok, status: response.status, contentType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, contentType: message.slice(0, 80) };
  }
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URI });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log('MinIO configured:', isTemplateMediaStorageConfigured());
  console.log('MINIO_ENDPOINT:', process.env.MINIO_ENDPOINT);
  console.log('MINIO_BUCKET:', process.env.MINIO_BUCKET);
  console.log('MINIO_PUBLIC_BASE_URL:', process.env.MINIO_PUBLIC_BASE_URL);
  console.log('---');

  const templates = await prisma.template.findMany({
    select: {
      id: true,
      organizationId: true,
      metaTemplateName: true,
      currentVersion: { select: { components: true } },
    },
    orderBy: { metaTemplateName: 'asc' },
  });

  const allRefs: MediaRef[] = [];
  for (const template of templates) {
    const components = template.currentVersion?.components;
    if (!components) {
      continue;
    }
    allRefs.push(
      ...collectMediaRefs(
        template.id,
        template.metaTemplateName,
        template.organizationId,
        components,
      ),
    );
  }

  console.log(`Templates in DB: ${templates.length}`);
  console.log(`Media references found: ${allRefs.length}`);
  console.log('---');

  if (allRefs.length === 0) {
    console.log('No header_media_url / image_media_url stored in any template components.');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let minioOk = 0;
  let minioFail = 0;
  let publicUrlOk = 0;
  let publicUrlFail = 0;
  let proxyOk = 0;
  let proxyFail = 0;
  let proxyNotDeployed = 0;

  for (const ref of allRefs) {
    const label = `${ref.templateName} (${ref.kind}${ref.cardIndex !== undefined ? ` #${ref.cardIndex + 1}` : ''})`;
    console.log(`\n[${label}]`);
    console.log(`  stored: ${ref.storedUrl}`);

    if (!ref.objectKey) {
      console.log('  objectKey: COULD NOT PARSE');
      minioFail += 1;
      publicUrlFail += 1;
      proxyFail += 1;
      continue;
    }

    console.log(`  objectKey: ${ref.objectKey}`);

    const minioHead = await headMinioObject(ref.objectKey);
    console.log(`  MinIO HEAD: ${minioHead.ok ? 'OK' : 'FAIL'} — ${minioHead.status}`);
    if (minioHead.ok) minioOk += 1;
    else minioFail += 1;

    const publicFetch = await fetchUrl(ref.storedUrl);
    console.log(
      `  Public URL GET: ${publicFetch.ok ? 'OK' : 'FAIL'} — HTTP ${publicFetch.status}${publicFetch.contentType ? ` (${publicFetch.contentType})` : ''}`,
    );
    if (publicFetch.ok) publicUrlOk += 1;
    else publicUrlFail += 1;

    const canonicalUrl = buildCanonicalPublicUrl(ref.objectKey);
    if (canonicalUrl !== ref.storedUrl) {
      const canonicalFetch = await fetchUrl(canonicalUrl);
      console.log(
        `  Canonical URL GET: ${canonicalFetch.ok ? 'OK' : 'FAIL'} — HTTP ${canonicalFetch.status}`,
      );
    }

    const proxyPath = buildTemplateMediaAssetPath(ref.organizationId, ref.objectKey);
    const proxyUrl = `${PRODUCTION_API}${proxyPath}`;
    const proxyFetch = await fetchUrl(proxyUrl);
    if (proxyFetch.status === 404 && String(proxyFetch.contentType).includes('json')) {
      console.log(`  API proxy GET: NOT DEPLOYED or route missing — HTTP ${proxyFetch.status}`);
      proxyNotDeployed += 1;
    } else {
      console.log(
        `  API proxy GET: ${proxyFetch.ok ? 'OK' : 'FAIL'} — HTTP ${proxyFetch.status}${proxyFetch.contentType ? ` (${proxyFetch.contentType})` : ''}`,
      );
      if (proxyFetch.ok) proxyOk += 1;
      else proxyFail += 1;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`MinIO objects exist:     ${minioOk}/${allRefs.length} OK, ${minioFail} fail`);
  console.log(`Public URL reachable:    ${publicUrlOk}/${allRefs.length} OK, ${publicUrlFail} fail`);
  console.log(`Production API proxy:    ${proxyOk} OK, ${proxyFail} fail, ${proxyNotDeployed} not deployed/missing`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
