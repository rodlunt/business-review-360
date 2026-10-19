/**
 * Schema-vs-code drift detector (issue #582).
 *
 * Compares the canonical SQL schema in `db/clean_minimal_schema.sql` against
 * the Sequelize model definitions under `backend/src/models/`. Fails when a
 * model attribute has no matching schema column (or vice versa) for any table
 * the application code declares.
 *
 * This is the same class of bug that issues #487 (`isApproved` missing from
 * the User model) and #537 (further User-vs-schema mismatches) tracked
 * individually. A single drift detector catches the next one automatically.
 *
 * What the detector deliberately catches:
 *   - Columns present in the schema file but missing from the model.
 *   - Attributes present in the model but missing from the schema file.
 *   - Tables that have a Sequelize model but no `CREATE TABLE` in the schema.
 *
 * What the detector deliberately does NOT catch (out of scope, per #582 spec):
 *   - Type-precision differences (STRING vs STRING(255), DECIMAL precision).
 *   - Default-value formatting (NOW() vs CURRENT_TIMESTAMP, single quotes).
 *   - NOT NULL / NULLability differences.
 *   - Index ordering, index existence, or unique-index columns.
 *   - Foreign-key constraints, CHECK constraints, or ON DELETE behaviour.
 *   - Row-Level Security policies, triggers, functions.
 *   - Tables present in the schema but not modelled by Sequelize (legacy or
 *     trigger-managed tables are valid).
 *
 * Strategy: pure parse-and-compare. The detector is a unit test:
 *   - Reads the SQL file as text and pulls table + column names with regex.
 *   - Imports each model with a placeholder DATABASE_URL so Sequelize builds
 *     the model registry without opening a connection (same pattern as
 *     `userIsApproved.test.js`).
 *   - Walks `sequelize.models` and reads each model's parsed attributes.
 *
 * No Postgres, no testcontainers, no Docker. Runs in the same Jest pass as
 * the rest of `testing/backend-tests/` and adds <1 s.
 *
 * Determinism: same source files produce the same drift report every run.
 * Tables and columns are compared as sorted sets; report ordering is fixed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'db', 'clean_minimal_schema.sql');
const MODELS_INDEX_PATH = path.join(REPO_ROOT, 'backend', 'src', 'models', 'index.js');

/**
 * Known drift currently in the codebase. Each entry is exempted from the
 * assertion so the detector passes on `main` while making the underlying
 * mismatches explicit. Format: `${tableName}.${columnName}`.
 *
 * Adding to this list is allowed when an existing GitHub issue tracks the
 * fix. Removing from this list happens when the schema or the model is
 * brought back into agreement. The list is the project's explicit drift
 * ledger; the detector enforces that no NEW drift slips through.
 *
 * Source of each entry below is documented in the PR that introduced this
 * file (#582 follow-up). When adding new entries, link the tracking issue
 * in the comment beside the entry.
 */
// Models whose tables exist only in numbered migration files (not in the legacy
// clean_minimal_schema.sql). Per CLAUDE.md, clean_minimal_schema.sql is a
// read-only legacy reference; new tables go in db/migrations/app/ only.
const KNOWN_ORPHAN_MODEL_TABLES = new Set([
  'CommentTemplates',           // #525 -- migration 0003-add-comment-templates.sql
  'SavedFilters',               // #524 -- migration 0004-add-saved-filters.sql
  'UserOrganizationMemberships', // #804 -- migration 0012-add-user-org-membership.sql
  'Consultants',                // #808 -- migration 0014-add-consultants.sql
  'ConsultantInvites',          // #808 -- migration 0014-add-consultants.sql
  'CommissionRuns',             // #808 Phase 3 -- migration 0016-add-commission-runs.sql
  'MagicLinkTokens',            // #892 -- migration 0029-add-magic-link-tokens.sql
  'ErrorEvents',                 // #848 -- migration 0030-add-ops-metrics.sql
  'MetricsSamples',              // #848 -- migration 0030-add-ops-metrics.sql
]);

const KNOWN_DRIFT_MODEL_ATTR_NOT_IN_SCHEMA = new Set([
  // Add entries here as `Tablename.columnname` if the model declares an
  // attribute the schema does not yet have. Each entry should reference a
  // tracking issue so the ledger does not become a permanent escape hatch.
  'Organizations.demoDataLoaded',        // #527 -- migration 0002-add-demo-data-fields.sql
  'Organizations.demoDataLoadedAt',      // #527 -- migration 0002-add-demo-data-fields.sql
  'Ideas.isDemoData',                    // #527 -- migration 0002-add-demo-data-fields.sql
  'Organizations.setupWizardCompleted',  // #526 -- migration 0005-add-setup-wizard.sql
  'Organizations.setupWizardStep',       // #526 -- migration 0005-add-setup-wizard.sql
  'Users.lastSeenAt',                    // #521 -- migration 0006-add-last-seen-at.sql
  'Users.isSuperuser',                   // #769 -- migration 0008-add-superuser.sql
  'Organizations.aiMode',               // #721 -- migration 0007-add-ai-settings.sql
  'Organizations.aiProvider',           // #721 -- migration 0007-add-ai-settings.sql
  'Organizations.aiApiKeyEncrypted',    // #721 -- migration 0007-add-ai-settings.sql
  'Users.hasSeenSuperuserWalkthrough',  // #766 -- migration 0009-add-walkthrough-flags.sql
  'Users.hasSeenAdminWalkthrough',      // #767 -- migration 0009-add-walkthrough-flags.sql
  'Users.hasSeenUserWalkthrough',       // #768 -- migration 0009-add-walkthrough-flags.sql
  'Organizations.oauthGoogleEnabled',   // migration 0010-add-oauth.sql
  'Organizations.oauthGithubEnabled',   // migration 0010-add-oauth.sql
  'Organizations.oauthMicrosoftEnabled', // migration 0010-add-oauth.sql
  'Organizations.ssoAzureEnabled',      // migration 0010-add-oauth.sql
  'Organizations.ssoAzureTenantId',     // migration 0010-add-oauth.sql
  'Organizations.ssoAllowedDomains',    // migration 0010-add-oauth.sql
  'Organizations.oauthAutoSuperuser',   // migration 0011-add-oauth-auto-superuser.sql
  'Organizations.referredBy',           // #808 -- migration 0015-add-referredby-to-orgs.sql
  'Users.primaryOrganizationId',        // onboarding Phase 1 -- migration 0020-add-primary-organization-to-users.sql
  'Users.referredByConsultantCode',     // onboarding Phase 1 -- migration 0021-add-referral-attribution-to-users.sql
  'Users.referralCapturedAt',           // onboarding Phase 1 -- migration 0021-add-referral-attribution-to-users.sql
  'Users.signupSource',                 // #892 PR1 -- migration 0023-add-users-signup-source.sql
  'Users.companyName',                  // #892 PR3 -- migration 0024-add-users-company-name.sql
  'Users.superuserWalkthroughStep',     // step-position resume -- migration 0031-add-walkthrough-step.sql
  'Users.adminWalkthroughStep',         // step-position resume -- migration 0031-add-walkthrough-step.sql
  'Users.userWalkthroughStep',          // step-position resume -- migration 0031-add-walkthrough-step.sql
]);

const KNOWN_DRIFT_SCHEMA_COL_NOT_IN_MODEL = new Set([
  // Add entries here as `Tablename.columnname` if the schema has columns
  // the model does not yet declare. Each entry should reference a tracking
  // issue so the ledger does not become a permanent escape hatch.
  'Organizations.allowAnonymousUsers', // #892 -- dropped from the model via
                                        // migration 0028-drop-allow-anonymous-users.sql;
                                        // the legacy clean_minimal_schema.sql reference
                                        // copy is frozen and still declares it.
]);

// Sequelize requires a non-empty DATABASE_URL string at module load even
// though we never open a connection. Set a placeholder before any model is
// imported. Same workaround as `userIsApproved.test.js`.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// -----------------------------------------------------------------------------
// SQL schema parsing
// -----------------------------------------------------------------------------

/**
 * Strip line comments (`-- ...`) and block comments from SQL text. Preserves
 * column structure so subsequent regex passes work against a clean source.
 */
function stripSqlComments(sql) {
  // Remove block comments first, then line comments.
  const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * Tokens that appear at the start of a column-list entry but are NOT columns.
 * Table-level constraints and clauses must be skipped during column extraction.
 */
const NON_COLUMN_PREFIXES = new Set([
  'constraint',
  'primary',
  'foreign',
  'unique',
  'check',
  'exclude',
  'like',
]);

/**
 * Extract the tables defined by `CREATE TABLE [IF NOT EXISTS] "Name" (...)`.
 * Returns Map<tableName, Set<columnName>>. Column names are kept in their
 * original case so they match Sequelize `field` values exactly. Quoted column
 * names have the quotes stripped.
 */
function extractTablesFromSchema(sql) {
  const cleaned = stripSqlComments(sql);
  const tables = new Map();

  // Match: CREATE TABLE [IF NOT EXISTS] "TableName" ( ...balanced parens... );
  // Brace-balancing is not native to JS regex, so iterate by start index and
  // walk the string to find the matching closing paren.
  const headerRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s*\(/gi;
  let header;
  while ((header = headerRe.exec(cleaned)) !== null) {
    const tableName = header[1];
    const bodyStart = header.index + header[0].length;
    const bodyEnd = findMatchingParen(cleaned, bodyStart - 1);
    if (bodyEnd < 0) continue;
    const body = cleaned.slice(bodyStart, bodyEnd);
    const columns = parseColumnList(body);
    if (!tables.has(tableName)) {
      tables.set(tableName, new Set());
    }
    for (const c of columns) {
      tables.get(tableName).add(c);
    }
  }

  // Pick up `ALTER TABLE "Foo" ADD COLUMN [IF NOT EXISTS] "bar" ...` additions.
  const alterRe =
    /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  let alter;
  while ((alter = alterRe.exec(cleaned)) !== null) {
    const tableName = alter[1];
    const columnName = alter[2];
    if (!tables.has(tableName)) {
      tables.set(tableName, new Set());
    }
    tables.get(tableName).add(columnName);
  }

  return tables;
}

/**
 * Find the index of the matching closing paren given the index of an opening
 * paren. Respects single-quoted strings so quote-embedded parens are ignored.
 */
function findMatchingParen(text, openIdx) {
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          i += 1; // escaped quote
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split a column-list body on top-level commas (commas inside parens or quoted
 * strings do not split). Then for each entry, decide if it is a column
 * definition (column name first) or a table-level constraint.
 */
function parseColumnList(body) {
  const entries = splitTopLevelCommas(body);
  const columns = [];
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === '') continue;
    // Look at the first identifier-shaped run of characters. For a column
    // definition this is the column name (quoted or unquoted). For a
    // table-level constraint like `UNIQUE("userId", "ideaId")` or
    // `PRIMARY KEY (id)` it is the constraint keyword.
    const firstIdent = entry.match(/^"([^"]+)"|^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (!firstIdent) continue;
    const columnName = firstIdent[1] ?? firstIdent[2];
    if (NON_COLUMN_PREFIXES.has(columnName.toLowerCase())) continue;
    columns.push(columnName);
  }
  return columns;
}

function splitTopLevelCommas(body) {
  const out = [];
  let depth = 0;
  let inString = false;
  let buf = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      buf += ch;
      if (ch === "'") {
        if (body[i + 1] === "'") {
          buf += body[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      buf += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim() !== '') out.push(buf);
  return out;
}

// -----------------------------------------------------------------------------
// Sequelize model introspection
// -----------------------------------------------------------------------------

/**
 * Resolve the database column name for a Sequelize attribute. If `field` is
 * set, that wins; otherwise the attribute key is used verbatim (Sequelize 6
 * does NOT pluralise or snake-case attribute keys unless `underscored: true`,
 * which BR360 does not use).
 */
function attrFieldName(attrKey, attrDef) {
  if (attrDef && typeof attrDef.field === 'string' && attrDef.field !== '') {
    return attrDef.field;
  }
  return attrKey;
}

/**
 * Walk every registered Sequelize model and produce
 * Map<tableName, { modelName, columns: Set<columnName>, file?: string }>.
 *
 * `columns` reflects what Sequelize would issue in CREATE TABLE: the field
 * name for each declared attribute, plus `createdAt`/`updatedAt` when
 * `timestamps: true`. Foreign-key attributes added by `belongsTo()` are
 * already in the model's attributes by the time we read them, so association
 * columns (e.g. `authorId` on Idea) are picked up automatically.
 */
function collectModelTables(sequelize) {
  const out = new Map();
  for (const [, model] of Object.entries(sequelize.models)) {
    const tableName = model.getTableName();
    // tableName can be a string OR an object { schema, tableName }. BR360
    // does not use schema-qualified tables, but normalise defensively.
    const flat = typeof tableName === 'string' ? tableName : tableName.tableName;
    const attrs = model.getAttributes();
    const columns = new Set();
    for (const [key, def] of Object.entries(attrs)) {
      columns.add(attrFieldName(key, def));
    }
    out.set(flat, { modelName: model.name, columns });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Test
// -----------------------------------------------------------------------------

describe('Schema-vs-code drift detector (issue #582)', () => {
  let schemaTables;
  let modelTables;

  beforeAll(async () => {
    const sql = readFileSync(SCHEMA_PATH, 'utf8');
    schemaTables = extractTablesFromSchema(sql);

    // Dynamic import after env override so Sequelize binds without a real DB.
    const models = await import(MODELS_INDEX_PATH);
    modelTables = collectModelTables(models.sequelize);
  });

  test('schema parse picks up at least the canonical tables', () => {
    // Sanity check the parser. If this fails, the detector itself is broken
    // and every downstream assertion would mislead.
    const required = [
      'Organizations',
      'Users',
      'Categories',
      'Ideas',
      'Comments',
      'Votes',
      'CommentVotes',
      'Settings',
    ];
    const missing = required.filter((t) => !schemaTables.has(t));
    expect(missing).toEqual([]);
  });

  test('every Sequelize model maps to a table defined in the schema', () => {
    const orphans = [];
    for (const [tableName, info] of modelTables.entries()) {
      if (!schemaTables.has(tableName) && !KNOWN_ORPHAN_MODEL_TABLES.has(tableName)) {
        orphans.push(`${info.modelName} -> ${tableName}`);
      }
    }
    if (orphans.length > 0) {
      throw new Error(
        'Models reference tables not declared in db/clean_minimal_schema.sql:\n  - ' +
          orphans.join('\n  - ') +
          '\n\nFix: add the table to db/clean_minimal_schema.sql, or if it is ' +
          'defined in a numbered migration file, add it to KNOWN_ORPHAN_MODEL_TABLES.'
      );
    }
  });

  test('every model attribute has a matching schema column', () => {
    const drifts = [];
    for (const [tableName, info] of modelTables.entries()) {
      const schemaCols = schemaTables.get(tableName);
      if (!schemaCols) continue; // already reported by orphan test
      for (const col of [...info.columns].sort()) {
        if (schemaCols.has(col)) continue;
        if (KNOWN_DRIFT_MODEL_ATTR_NOT_IN_SCHEMA.has(`${tableName}.${col}`)) continue;
        drifts.push(`${tableName}.${col}  (model ${info.modelName}; not in schema)`);
      }
    }
    if (drifts.length > 0) {
      throw new Error(
        'New model-vs-schema drift detected. Model attributes have no ' +
          'matching schema column:\n  - ' +
          drifts.join('\n  - ') +
          '\n\nFix: add the column to db/clean_minimal_schema.sql, or remove ' +
          'the attribute from the model. If the drift is intentional and ' +
          'tracked by an issue, add the entry to KNOWN_DRIFT_MODEL_ATTR_NOT_IN_SCHEMA.'
      );
    }
  });

  test('every schema column has a matching model attribute', () => {
    const drifts = [];
    for (const [tableName, info] of modelTables.entries()) {
      const schemaCols = schemaTables.get(tableName);
      if (!schemaCols) continue;
      for (const col of [...schemaCols].sort()) {
        if (info.columns.has(col)) continue;
        if (KNOWN_DRIFT_SCHEMA_COL_NOT_IN_MODEL.has(`${tableName}.${col}`)) continue;
        drifts.push(`${tableName}.${col}  (in schema; not declared on model ${info.modelName})`);
      }
    }
    if (drifts.length > 0) {
      throw new Error(
        'New schema-vs-model drift detected. Schema columns have no ' +
          'matching model attribute:\n  - ' +
          drifts.join('\n  - ') +
          '\n\nFix: add the attribute to the matching model, or remove the ' +
          'column from db/clean_minimal_schema.sql. Silently dropping a ' +
          'column from the model causes Sequelize to ignore it on read AND ' +
          'on write (issue #487 root cause). If the drift is intentional ' +
          'and tracked by an issue, add the entry to ' +
          'KNOWN_DRIFT_SCHEMA_COL_NOT_IN_MODEL.'
      );
    }
  });
});
