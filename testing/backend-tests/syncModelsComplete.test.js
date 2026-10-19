/**
 * Drift-detection test for backend/src/sync.js.
 *
 * Jest's test DB is built by calling sequelize.sync() in sync.js. For a model
 * to register with the Sequelize instance, sync.js must import it. If a model
 * file exists under src/models/ but isn't imported in sync.js, the test DB
 * will be missing that table and tests will silently run against an incomplete
 * schema (works in test, fails in prod).
 *
 * This test reads sync.js as text and asserts every model file under
 * src/models/ (excluding infrastructure files) is imported there. It does not
 * touch a live DB.
 *
 * Related: GitHub issue #502.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYNC_PATH = path.resolve(__dirname, '..', '..', 'backend', 'src', 'sync.js');
const MODELS_DIR = path.resolve(__dirname, '..', '..', 'backend', 'src', 'models');

// Infrastructure files in models/ that are not Sequelize models and must not
// be imported by sync.js. Keep this list narrow and explicit.
const NON_MODEL_FILES = new Set(['index.js', 'database.js', 'platformDatabase.js']);

// Explicit list of expected models. Keeping this hardcoded (rather than only
// deriving it from the filesystem) means a deletion of a model file also
// trips the test, which is the correct behaviour for drift detection.
const EXPECTED_MODELS = [
  'Category',
  'Comment',
  'CommentTemplate',
  'CommentVote',
  'CommissionRun',
  'Consultant',
  'ConsultantInvite',
  'ConsultantPayment',
  'SavedFilter',
  'EmailAnalytics',
  'EmailLog',
  'EmailQueue',
  'ErrorEvent',
  'Idea',
  'IdeaSubscription',
  'MagicLinkToken',
  'MetricsSample',
  'NotificationPreferences',
  'OAuthLink',
  'Organization',
  'Setting',
  'Survey',
  'SurveyToken',
  'UnsubscribeToken',
  'User',
  'UserOrganizationMembership',
  'UserSession',
  'Vote',
];

describe('sync.js imports every Sequelize model', () => {
  const syncSource = readFileSync(SYNC_PATH, 'utf8');

  // Extract model names imported from ./models/<Name>.js
  const importRegex = /import\s+(\w+)\s+from\s+['"]\.\/models\/([\w]+)\.js['"]/g;
  const imported = new Set();
  let match;
  while ((match = importRegex.exec(syncSource)) !== null) {
    imported.add(match[2]);
  }

  test('expected model list matches files on disk', () => {
    const onDisk = readdirSync(MODELS_DIR)
      .filter((f) => f.endsWith('.js') && !NON_MODEL_FILES.has(f))
      .map((f) => f.replace(/\.js$/, ''))
      .sort();

    expect(onDisk).toEqual([...EXPECTED_MODELS].sort());
  });

  test.each(EXPECTED_MODELS)('sync.js imports %s', (modelName) => {
    expect(imported.has(modelName)).toBe(true);
  });

  test('sync.js imports exactly the expected set (no extras, no omissions)', () => {
    expect([...imported].sort()).toEqual([...EXPECTED_MODELS].sort());
  });
});
