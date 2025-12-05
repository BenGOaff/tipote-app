// scripts/ingest-resources.ts
// Rôle : lire tipote-knowledge/manifest/resources_manifest.xlsx,
// créer / mettre à jour les ressources dans Supabase,
// puis créer les chunks + embeddings.

import * as dotenv from 'dotenv';

// Essaie plusieurs fichiers possibles, dans cet ordre :
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production' });
dotenv.config({ path: '.env.prod' });
dotenv.config(); // fallback sur .env s'il existe


import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

type ManifestRow = {
  id?: string;
  titre?: string;
  type_contenu?: string;
  format_fichier?: string;
  chemin_fichier?: string;
  theme_principal?: string;
  sous_theme?: string;
  usage_principal?: string;
  niveau?: string;
  priorite?: number;
  langue?: string;
  notes?: string;
};

type ResourceRow = {
  id: string;
};

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadManifest(manifestPath: string): ManifestRow[] {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at ${manifestPath}`);
  }

  const workbook = XLSX.readFile(manifestPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: ManifestRow[] = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
  }) as ManifestRow[];

  return rows;
}

function readResourceFile(
  rootDir: string,
  relativePath: string,
  format?: string | null,
): string {
  const fullPath = path.resolve(rootDir, relativePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[ingest-resources] File not found for resource: ${fullPath}`);
    return '';
  }

  const ext = (format || path.extname(fullPath).replace('.', '')).toLowerCase();

  if (ext === 'md' || ext === 'txt') {
    return fs.readFileSync(fullPath, 'utf8');
  }

  if (ext === 'docx') {
    // Import dynamique pour DOCX
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth') as typeof import('mammoth');
    const buffer = fs.readFileSync(fullPath);
    return mammoth
      .extractRawText({ buffer })
      .then((res) => res.value)
      .catch((err: unknown) => {
        console.error('[ingest-resources] Error reading DOCX', fullPath, err);
        return '';
      }) as unknown as string;
  }

  console.warn(
    `[ingest-resources] Unsupported format "${ext}" for file ${fullPath}. Skipping content.`,
  );
  return '';
}

function chunkText(text: string, maxChars = 2000): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    const paragraph = p.trim();
    if (!paragraph) continue;

    if ((current + '\n\n' + paragraph).length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = paragraph;
      } else {
        // paragraphe très long → on coupe brutalement
        let start = 0;
        while (start < paragraph.length) {
          chunks.push(paragraph.slice(start, start + maxChars));
          start += maxChars;
        }
        current = '';
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function main() {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = getEnv('OPENAI_API_KEY_OWNER');

  const rootDir = process.env.TIPOTE_KNOWLEDGE_ROOT
    ? path.resolve(process.env.TIPOTE_KNOWLEDGE_ROOT)
    : path.resolve(process.cwd(), 'tipote-knowledge');

  const manifestPath = path.join(rootDir, 'manifest', 'resources_manifest.xlsx');

  console.log('[ingest-resources] Root dir:', rootDir);
  console.log('[ingest-resources] Manifest:', manifestPath);

  const supabase = createClient(supabaseUrl, serviceKey);
  const openai = new OpenAI({ apiKey });

  const rows = loadManifest(manifestPath);
  console.log(`[ingest-resources] ${rows.length} rows found in manifest`);

  for (const row of rows) {
    const titre = (row.titre || '').toString().trim();
    const chemin = (row.chemin_fichier || '').toString().trim();

    if (!titre || !chemin) {
      console.warn('[ingest-resources] Skipping row without titre/chemin_fichier', row);
      continue;
    }

    const slug = slugify(titre);
    const format = row.format_fichier || path.extname(chemin).replace('.', '');

    console.log(`\n[ingest-resources] Processing resource: ${titre} (${chemin})`);

    // Upsert dans resources
    const { data: resources, error: upsertError } = await supabase
      .from('resources')
      .upsert(
        {
          slug,
          titre,
          type_contenu: row.type_contenu || null,
          format_fichier: format || null,
          chemin_fichier: chemin,
          theme_principal: row.theme_principal || null,
          sous_theme: row.sous_theme || null,
          usage_principal: row.usage_principal || null,
          niveau: row.niveau || null,
          priorite: row.priorite ?? null,
          langue: row.langue || null,
          notes: row.notes || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'slug',
        },
      )
      .select('id')
      .limit(1);

    if (upsertError) {
      console.error('[ingest-resources] Error upserting resource', upsertError);
      continue;
    }

    if (!resources || resources.length === 0) {
      console.error('[ingest-resources] No resource returned after upsert');
      continue;
    }

    const resource = resources[0] as ResourceRow;
    const resourceId = resource.id;

    // Lire le fichier
    const rawContent = await Promise.resolve(
      readResourceFile(rootDir, chemin, format || undefined),
    );

    if (!rawContent || rawContent.trim().length === 0) {
      console.warn(
        `[ingest-resources] Empty content for resource ${titre}. Skipping chunks.`,
      );
      continue;
    }

    const chunks = chunkText(rawContent, 2000);
    console.log(
      `[ingest-resources] Resource "${titre}" → ${chunks.length} chunk(s) ready for embeddings`,
    );

    if (chunks.length === 0) {
      continue;
    }

    // Créer les embeddings en batch
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks,
    });

    if (!embeddingResponse.data || embeddingResponse.data.length === 0) {
      console.error(
        '[ingest-resources] No embeddings returned for resource',
        titre,
      );
      continue;
    }

    const rowsToUpsert = embeddingResponse.data.map((item, idx) => {
      const embedding = item.embedding;
      return {
        resource_id: resourceId,
        chunk_index: idx,
        content: chunks[idx],
        embedding,
      };
    });

    const { error: chunksError } = await supabase
      .from('resource_chunks')
      .upsert(rowsToUpsert, {
        onConflict: 'resource_id,chunk_index',
      });

    if (chunksError) {
      console.error(
        '[ingest-resources] Error inserting resource_chunks for',
        titre,
        chunksError,
      );
    } else {
      console.log(
        `[ ingested OK ] "${titre}" → ${rowsToUpsert.length} chunks avec embeddings`,
      );
    }
  }

  console.log('\n[ingest-resources] Done.');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch((err) => {
  console.error('[ingest-resources] Fatal error', err);
  process.exit(1);
});
