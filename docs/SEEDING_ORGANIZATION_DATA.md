# Seeding Organization Data

This guide explains how to create seed data (sample ideas and comments) for a new organization in Business Review 360.

## Overview

Seed data helps new organizations get started with example content that demonstrates the platform's features and provides templates for real submissions.

## Prerequisites

- Organization must already exist in the database (in `Organizations` table)
- At least one user must exist for the organization (to be the author of ideas)
- Access to the production database via `docker exec` or direct SQL client

## Step 1: Gather Information

Before creating seed data, collect:

1. **Organization ID** (slug): e.g., `nps`, `tradezone`, `demo-corp`
2. **User IDs**: UUIDs of users who will be authors (found in `Users` table)
3. **Industry context**: What type of ideas are relevant to this organization?
4. **Number of ideas**: Typically 5-8 ideas to start
5. **Categories**: What categories make sense? (e.g., Technology, Operations, Customer Service)

## Step 2: Create the SQL File

### File Naming Convention

`add-{org-slug}-ideas.sql`

Example: `add-nps-ideas.sql`, `add-acme-ideas.sql`

### SQL File Structure

```sql
-- ============================================
-- Seed Data: [Organization Name] Ideas
-- ============================================
-- Organization: [org-name]
-- Purpose: Initial seed data with example ideas and comments
-- Author IDs: See Users table for [org-slug] organization

-- Ideas
INSERT INTO "Ideas" (
    id,
    title,
    description,
    category,
    status,
    priority,
    "timeSavedMinutes",
    "additionalComments",
    "orgImpact",
    solution,
    slug,
    "organizationId",
    "authorId",
    "createdAt",
    "updatedAt"
) VALUES
    -- Idea 1
    (
        'a1111111-1111-1111-1111-111111111111',  -- Unique UUID
        'Your Idea Title Here',
        'Detailed description of the idea. Explain the problem, proposed solution, and benefits. Be specific and realistic.',
        'Technology',  -- Category: Technology, Operations, Customer Service, etc.
        'Reviewing',   -- Status: Reviewing, Approved, Implemented, Rejected
        1,             -- Priority: 1 (high), 2 (medium), 3 (low)
        25,            -- Time saved in minutes (or NULL if not applicable)
        'Additional context or implementation notes.',
        'How this affects the organization. What's the current pain point?',
        'Proposed technical or process solution.',
        'your-idea-title-here-12345',  -- URL-friendly slug (must be unique)
        'your-org-slug',               -- Organization ID
        '77777777-7777-7777-7777-777777777777',  -- Author's user UUID
        NOW() - INTERVAL '45 days',    -- Created date (backdated for realism)
        NOW() - INTERVAL '42 days'     -- Updated date
    ),
    -- Idea 2
    (
        'a2222222-2222-2222-2222-222222222222',  -- Different UUID
        'Another Idea Title',
        -- ... similar structure
    );

-- Comments
INSERT INTO "Comments" (
    id,
    "ideaId",
    "authorId",
    content,
    "createdAt",
    "updatedAt"
) VALUES
    -- Comment on Idea 1
    (
        'c1111111-1111-1111-1111-111111111111',  -- Unique UUID
        'a1111111-1111-1111-1111-111111111111',  -- Must match an idea ID above
        '77777777-7777-7777-7777-777777777777',  -- Commenter's user UUID
        'This is a great idea! We could implement this in Q2.',
        NOW() - INTERVAL '42 days',
        NOW() - INTERVAL '42 days'
    ),
    -- Comment on Idea 1 (second comment)
    (
        'c2222222-2222-2222-2222-222222222222',
        'a1111111-1111-1111-1111-111111111111',  -- Same idea ID
        '88888888-8888-8888-8888-888888888888',  -- Different user
        'I agree, and we should also consider mobile support.',
        NOW() - INTERVAL '40 days',
        NOW() - INTERVAL '40 days'
    );
```

## Step 3: Database Schema Reference

### Ideas Table - Required Columns

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | Yes | Must be unique across all ideas |
| `title` | VARCHAR(255) | Yes | Short, descriptive title |
| `description` | TEXT | Yes | Detailed explanation |
| `category` | VARCHAR(255) | No | Technology, Operations, Customer Service, etc. |
| `status` | VARCHAR(100) | No | Default: 'Reviewing' |
| `priority` | INTEGER | No | 1=high, 2=medium, 3=low |
| `timeSavedMinutes` | INTEGER | No | Estimated time saved per instance |
| `additionalComments` | TEXT | No | Extra context |
| `orgImpact` | TEXT | No | How it affects the organization |
| `solution` | TEXT | No | Proposed solution |
| `slug` | VARCHAR(255) | No | URL-friendly, must be unique |
| `organizationId` | VARCHAR(255) | Yes | Must match existing organization |
| `authorId` | UUID | No | Must match existing user ID |
| `createdAt` | TIMESTAMP | Yes | Use `NOW() - INTERVAL 'X days'` for backdating |
| `updatedAt` | TIMESTAMP | Yes | Should be >= createdAt |

### Comments Table - Required Columns

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | Yes | Must be unique across all comments |
| `ideaId` | UUID | Yes | Must reference an existing idea |
| `authorId` | UUID | No | Must match existing user ID |
| `content` | TEXT | Yes | Comment text |
| `createdAt` | TIMESTAMP | Yes | Should be >= idea's createdAt |
| `updatedAt` | TIMESTAMP | Yes | Should be >= createdAt |

### ⚠️ Common Schema Mistakes

**DO NOT include these columns** (they don't exist in the schema):
- ❌ `votes` - Not in Ideas table
- ❌ `isAnonymous` - Not in Ideas table
- ❌ `needsApproval` - Not in Ideas table
- ❌ `userId` - Use `authorId` instead (both tables)

## Step 4: UUID Guidelines

### Valid UUID Format

PostgreSQL UUIDs must follow the format: `8-4-4-4-12` (hexadecimal characters)

**Valid examples:**
```
a1111111-1111-1111-1111-111111111111
c2222222-2222-2222-2222-222222222222
77777777-7777-7777-7777-777777777777
```

**Invalid examples:**
```
nps00001-0000-0000-0000-000000000001  ❌ Letters in wrong segment
12345                                  ❌ Too short
not-a-uuid-format                      ❌ Wrong format
```

### UUID Generation Strategy

For seed data, use simple sequential patterns:

**Ideas:**
- First idea: `a1111111-1111-1111-1111-111111111111`
- Second idea: `a2222222-2222-2222-2222-222222222222`
- Third idea: `a3333333-3333-3333-3333-333333333333`
- etc.

**Comments:**
- First comment: `c1111111-1111-1111-1111-111111111111`
- Second comment: `c2222222-2222-2222-2222-222222222222`
- etc.

This makes it easy to track and reference in the SQL file.

## Step 5: Content Guidelines

### Writing Realistic Ideas

1. **Title**: Clear, action-oriented (40-80 characters)
   - ✅ "Digital Pest Activity Tracking App"
   - ✅ "Automated Invoice Reminder System"
   - ❌ "Idea 1"
   - ❌ "Fix the thing"

2. **Description**: Detailed problem and solution (200-500 words)
   - Explain the current problem
   - Describe the proposed solution
   - Include benefits and impact
   - Be specific to the industry

3. **Category**: Match the organization's context
   - Technology: Apps, software, automation
   - Operations: Processes, workflows, efficiency
   - Customer Service: Client experience, communication
   - Safety: Compliance, risk management
   - Finance: Cost savings, revenue

4. **Status**: Use realistic distribution
   - Reviewing: 40% (most ideas)
   - Approved: 30%
   - Implemented: 20%
   - Rejected: 10%

5. **Priority**: Balance importance
   - 1 (High): 20% - Critical, urgent ideas
   - 2 (Medium): 50% - Important but not urgent
   - 3 (Low): 30% - Nice to have

### Writing Realistic Comments

1. **Supportive comments**: "Great idea! This would solve our X problem."
2. **Questions**: "How would this work with our existing Y system?"
3. **Suggestions**: "We should also consider Z when implementing this."
4. **Concerns**: "What about the cost? Do we have budget for this?"
5. **Updates**: "We started working on this last month."

Aim for 1-3 comments per idea, with varied dates to show progression.

## Step 6: Executing the Seed Script

### Development Environment

```bash
# From project root
docker exec -i business-review-360-db-1 psql -U your_db_user -d your_db_name < add-org-ideas.sql
```

### Production Environment (Windows PowerShell)

```powershell
# First, pull the SQL file from git
git pull

# Execute using Get-Content (PowerShell doesn't support < redirection)
Get-Content add-org-ideas.sql | docker exec -i business-review-360-db-1 psql -U business_review_user_0001 -d business_review_db
```

### Production Environment (Linux/Mac)

```bash
git pull
docker exec -i business-review-360-db-1 psql -U your_db_user -d your_db_name < add-org-ideas.sql
```

### Direct psql Connection

```bash
psql -U your_db_user -d your_db_name -f add-org-ideas.sql
```

## Step 7: Verification

After running the seed script:

1. **Check for errors** in the terminal output
2. **Log into the application** as a user from that organization
3. **Navigate to** `/org/your-org-slug`
4. **Verify ideas appear** in the idea list
5. **Open an idea** and verify comments are visible
6. **Test filtering** by category, status, priority

### SQL Verification Queries

```sql
-- Count ideas for organization
SELECT COUNT(*) FROM "Ideas" WHERE "organizationId" = 'your-org-slug';

-- Count comments on those ideas
SELECT COUNT(*) FROM "Comments" c
JOIN "Ideas" i ON c."ideaId" = i.id
WHERE i."organizationId" = 'your-org-slug';

-- View all seeded ideas
SELECT id, title, category, status, "createdAt"
FROM "Ideas"
WHERE "organizationId" = 'your-org-slug'
ORDER BY "createdAt" DESC;
```

## Example: National Pest Solutions (NPS)

See add-nps-ideas.sql for a complete working example with:
- 6 pest control industry ideas
- 12 comments showing discussion and progression
- Realistic categories, statuses, and priorities
- Proper UUID format and schema compliance

## Troubleshooting

### Error: "column X does not exist"

**Problem**: SQL includes columns that aren't in the schema

**Solution**: Remove or rename the column. Common issues:
- Change `userId` to `authorId`
- Remove `votes`, `isAnonymous`, `needsApproval`

### Error: "invalid input syntax for type uuid"

**Problem**: UUID format is incorrect

**Solution**: Use proper format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (hex only)

### Error: "duplicate key value violates unique constraint"

**Problem**: UUID or slug already exists in database

**Solution**: Change the UUID or slug to a unique value

### Error: "insert or update on table violates foreign key constraint"

**Problem**: Referenced IDs don't exist (organizationId, authorId, ideaId)

**Solution**:
- Verify organization exists: `SELECT * FROM "Organizations" WHERE id = 'your-org-slug';`
- Verify user exists: `SELECT * FROM "Users" WHERE id = 'user-uuid';`
- For comments, verify idea exists: `SELECT * FROM "Ideas" WHERE id = 'idea-uuid';`

## Best Practices

1. **Test in development first** before running on production
2. **Back up the database** before running seed scripts on production
3. **Use realistic data** that demonstrates the platform's value
4. **Include variety** in categories, statuses, and priorities
5. **Add comments** to show engagement and discussion
6. **Backdate timestamps** to make it look like an active organization
7. **Review the schema** in `db/clean_minimal_schema.sql` before creating SQL
8. **Commit seed files to git** so they're versioned and shareable
9. **Document organization-specific context** in comments within the SQL file

## Automated Seed Generation (Future)

When creating an organization through the UI, the system could:

1. Prompt for seed data preferences (number of ideas, categories)
2. Generate industry-appropriate sample ideas using templates
3. Create realistic comments and timestamps
4. Execute the seed script automatically
5. Show a "Demo data loaded" notification to the admin

This would make onboarding new organizations faster and more consistent.

## Related Documentation

- [Database Schema](../db/clean_minimal_schema.sql)
- Test Data
- NPS Seed Example
- Organization Setup Guide (if exists)
