# Business Review 360 - User Stories for Test Cases

**UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility**
- All test scenarios compatible with new infrastructure
- Error handling scenarios include request ID correlation (Phase 6)
- Admin actions tested with audit logging (Phase 7)
- New billing and purchase flow scenarios added (Phase 8)

## Overview

These user stories provide comprehensive test scenarios for the Business Review 360 idea management system, covering all user roles, features, and workflows. Updated to reflect the current application state including slug-based URLs, enhanced UI components, admin-only comments, and billing features.

## User Roles

- **Anonymous User**: Can register and submit ideas without email
- **Registered User**: Can submit, edit, delete own ideas, vote, and comment
- **Admin**: All user capabilities + category management, user promotion, admin controls on ideas, export functionality
- **Superuser**: All admin capabilities + can promote other users to admin

---

## 1. Authentication & User Management

### User Registration & Login

- **As a new user**, I want to register with just a username and password so that I can start submitting ideas immediately
- **As a new user**, I want to optionally provide my email during registration so that I can receive password reset emails
- **As a registered user**, I want to log in with my username and password so that I can access my account
- **As a user**, I want to receive clear error messages when login fails so that I understand what went wrong
- **As a logged-in user**, I want to stay authenticated across browser sessions so that I don't have to log in repeatedly

### Password Management

- **As a user who forgot their password**, I want to request a password reset so that I can regain access to my account
- **As an admin**, I want to initiate password resets for users so that I can help users who are locked out
- **As a user**, I want to receive a secure reset link via email so that I can create a new password

### Superuser Setup

- **As a system administrator**, I want to be prompted to create a superuser account when no admin exists so that the system has initial administrative access
- **As a superuser**, I want to create the first admin account with username, password, and email so that the system can be properly administered

---

## 2. Idea Management

### Idea Submission

- **As a registered user**, I want to submit a new idea with title, description, category, organizational impact, fix impact, solution, and additional comments so that my suggestion can be reviewed
- **As a user submitting an idea**, I want to see category suggestions from existing categories so that I can maintain consistency
- **As a user submitting an idea**, I want to create new categories if needed so that my idea can be properly categorized
- **As a user**, I want to see validation errors if required fields are missing so that I can complete my submission properly
- **As a user**, I want to see a success confirmation after submitting an idea so that I know it was received

### Idea Viewing & Browsing

- **As any user**, I want to view a list of all submitted ideas so that I can see what has been proposed
- **As any user**, I want to filter ideas by category so that I can focus on specific areas of interest
- **As any user**, I want to search ideas by title or description so that I can find specific topics
- **As any user**, I want to sort ideas by newest, oldest, popular, or trending so that I can find the most relevant content
- **As any user**, I want to see idea details including author, vote count, status, priority, and comments so that I have complete information
- **As any user**, I want to see pinned ideas prominently displayed so that important ideas get visibility
- **As any user**, I want to access ideas via user-friendly slug URLs (e.g., `/idea/implement-ai-chat-24567`) so that links are shareable and memorable
- **As any user**, I want backward compatibility with UUID-based URLs so that old links continue to work
- **As any user**, I want to use the browser back button to navigate between idea details and the main list efficiently

### Idea Editing & Deletion

- **As the author of an idea**, I want to edit my idea's content so that I can improve or update my proposal
- **As the author of an idea**, I want to delete my idea so that I can remove content I no longer want shared
- **As an admin**, I want to edit any idea so that I can correct issues or improve clarity
- **As an admin**, I want to delete any idea so that I can remove inappropriate content
- **As a user viewing an idea**, I want to see edit history so that I can track changes made to the proposal

### Idea Status Management

- **As an admin**, I want to set idea status from 8 comprehensive options (Reviewing, In Progress, Approved, Complete, Rejected, Duplicate, Hidden, Open) so that users know the exact current state
- **As an admin**, I want to quickly change idea status by clicking the status indicator dot in card view without opening the full idea detail page so that I can efficiently manage multiple ideas (Issue #82)
- **As an admin**, I want the status dropdown to display all options without being cut off by card overflow (using React Portal) so that I can see and select all available statuses
- **As an admin**, I want the status dropdown to auto-close after 4 seconds or when clicking outside so that the interface stays clean and uncluttered
- **As an admin**, I want to hide ideas from regular users by setting status to "Hidden" so that I can manage sensitive or inappropriate content without deleting it (Issue #67)
- **As an admin**, I want to pin important ideas so that they appear at the top of lists
- **As an admin**, I want to set idea priority (0-10) so that ideas can be ranked by importance
- **As an admin**, I want to assign ideas to categories so that they are properly organized
- **As a user**, I want to see visual indicators for idea status with color coding (green for approved/complete, yellow for in progress/reviewing, red for rejected/duplicate) so that I can quickly understand their state
- **As a regular user**, I want hidden ideas to be invisible to me so that I only see appropriate, public content
- **As an admin**, I want to still see hidden ideas (with Hidden status indicated) so that I can manage all content

---

## 3. Voting System

### Idea Voting

- **As a registered user**, I want to upvote ideas I support so that popular ideas gain visibility
- **As a registered user**, I want to remove my vote from an idea so that I can change my mind
- **As any user**, I want to see the current vote count for each idea so that I can gauge popularity
- **As a user**, I want to see if I've already voted on an idea so that I don't vote twice
- **As any user**, I want voting to update the trending algorithm so that recently popular ideas are highlighted

### Comment Voting

- **As a registered user**, I want to upvote helpful comments so that quality discussion is promoted
- **As a registered user**, I want to remove my upvote from a comment so that I can change my opinion
- **As any user**, I want to see which comments have the most upvotes so that I can find the most valuable discussions
- **As any user**, I want highly upvoted comments to be labeled as "Top comment" so that quality content is highlighted

---

## 4. Comments & Discussion

### Comment Creation

- **As a registered user**, I want to add comments to ideas so that I can participate in discussions
- **As a user commenting**, I want to see a clean form with proper styling so that the interface is professional
- **As a user**, I want to see my comment appear immediately after submission so that I know it was posted
- **As a user**, I want to receive error messages if comment submission fails so that I can retry
- **As an admin**, I want to add admin-only comments that are clearly distinguished from regular comments so that I can provide official responses
- **As any user**, I want to see admin comments highlighted differently so that I can identify official responses

### Comment Management

- **As the author of a comment**, I want to edit my comment so that I can correct mistakes or clarify my thoughts
- **As the author of a comment**, I want to delete my comment so that I can remove content I no longer want shared
- **As an admin**, I want to edit any comment so that I can moderate discussions
- **As an admin**, I want to delete inappropriate comments so that I can maintain quality discussions

### Comment Display

- **As any user**, I want to see comments sorted first by vote count (descending) and then by date (oldest first for comments with same votes) so that the best content appears first while maintaining chronological order for equal-voted comments (Issue #84)
- **As any user**, I want to see comment author information so that I know who contributed to the discussion
- **As any user**, I want to see comment timestamps so that I understand the timeline of discussion
- **As any user**, I want to easily toggle comment visibility so that I can focus on the idea when needed

---

## 5. Trending & Sorting Algorithm

### Trending Calculation

- **As any user**, I want to see trending ideas based on recent activity so that I can find what's currently popular
- **As a system**, I want trending scores to consider vote recency (last 7 days) so that recent activity is weighted higher
- **As a system**, I want trending scores to consider comment recency (last 7 days) so that active discussions are promoted
- **As a system**, I want comments to count more than votes in trending so that engagement is valued
- **As a system**, I want newer ideas (under 14 days) to get a slight boost so that fresh content has a chance

### Sorting Options

- **As any user**, I want to sort by "newest" to see the most recently submitted ideas
- **As any user**, I want to sort by "oldest" to see ideas that have been around longest
- **As any user**, I want to sort by "popular" to see ideas with the most total votes
- **As any user**, I want to sort by "trending" to see ideas with recent activity
- **As any user**, I want pinned ideas to always appear first regardless of sort order

---

## 6. Category Management

### Category Creation & Assignment

- **As an admin**, I want to create new categories with names and descriptions so that ideas can be properly organized
- **As an admin**, I want to see all existing categories in a management interface so that I can maintain consistency
- **As an admin**, I want to delete unused categories so that the list stays clean and relevant
- **As a user submitting ideas**, I want to see category suggestions as I type so that I can choose existing categories
- **As a user submitting ideas**, I want to create new categories when needed so that my idea fits properly

### Category Filtering

- **As any user**, I want to filter idea lists by category so that I can focus on specific areas
- **As any user**, I want to see category names clearly displayed on ideas so that I can understand the organization
- **As a system**, I want category filtering to work efficiently even with large numbers of ideas

---

## 7. Admin Features

### User Administration

- **As an admin**, I want to see a list of all users with their usernames, emails, and admin status so that I can manage accounts
- **As an admin**, I want to promote regular users to admin status so that I can delegate administrative tasks
- **As an admin**, I want to demote admin users to regular status so that I can revoke privileges when needed
- **As a superuser**, I want to promote users to admin status so that I can expand the administrative team
- **As a system**, I want to prevent non-superusers from promoting others to admin so that privilege escalation is controlled

### Theme & Customization

- **As an admin**, I want to customize the application theme colors so that the system matches organizational branding
- **As an admin**, I want color changes to be reflected immediately in the header without page refresh so that I can see changes in real-time (Issue #86)
- **As an admin**, I want to upload a custom logo so that the application reflects our organization
- **As an admin**, I want logo uploads to immediately update the header and landing page without requiring a page refresh so that I can see the new logo right away (Issue #71)
- **As an admin**, I want logo and color settings to persist via SettingsContext and localStorage so that customizations remain across sessions
- **As an admin**, I want to preview theme changes before saving so that I can ensure they look good
- **As an admin**, I want logo upload to provide guidance on optimal formats so that the result looks professional
- **As any user**, I want theme changes to apply immediately across the application so that the experience is consistent

### Data Export

- **As an admin**, I want to export all ideas, comments, and votes to Excel so that I can analyze data externally
- **As an admin**, I want to export data to CSV format so that I can import into other systems
- **As an admin**, I want to export data to JSON format for programmatic access and integration
- **As an admin**, I want to export data to PDF format for reports and documentation
- **As an admin**, I want export functionality to include all relevant data fields with proper Sequelize associations (using "ideaComments" alias) so that the export is comprehensive and error-free
- **As an admin**, I want export to work efficiently even with large datasets so that the system remains responsive
- **As an admin**, I want clear success/error messages for exports so that I know if the operation completed (Issue #87)
- **As an admin**, I want success messages to auto-dismiss after 4 seconds so that the interface doesn't stay cluttered

### Admin Idea Controls

- **As an admin viewing an idea**, I want to see expanded controls for status, category, priority, and pinning so that I can manage ideas effectively
- **As an admin**, I want to be able to expand/collapse admin controls so that the interface isn't cluttered
- **As an admin**, I want to see helpful hints about status meanings so that I use them consistently
- **As an admin**, I want to create new categories directly from the idea management interface so that workflow is efficient

---

## 8. Settings & Configuration

### Application Settings

- **As an admin**, I want to access system settings from the main navigation so that configuration is easily accessible
- **As an admin**, I want settings to be saved to the database so that they persist across restarts
- **As an admin**, I want settings changes to take effect immediately so that I can see the results right away
- **As a system**, I want settings to have reasonable defaults so that the application works well out of the box

### Environment Configuration

- **As a system administrator**, I want the application to validate required environment variables on startup so that configuration issues are caught early
- **As a system administrator**, I want clear error messages for missing configuration so that I can fix problems quickly
- **As a system administrator**, I want the system to work with Docker Compose for easy deployment

---

## 9. User Experience & Interface

### Responsive Design

- **As a mobile user**, I want the application to work well on my phone so that I can participate while away from my desk
- **As a tablet user**, I want the interface to adapt to my screen size with proper breakpoint at 'md' (900px) instead of 'sm' (600px) so that tablet layouts work correctly (Issue #73)
- **As a mobile user**, I want action buttons (Admin/Share/Vote) to be consistent width (101px on mobile, 95px on desktop) and properly aligned so that the interface looks professional (Issue #74)
- **As a mobile user**, I want the Admin button to show only "Admin" text without wrapping so that buttons fit on small screens (Issue #74)
- **As a mobile user**, I want Status and Category dropdowns to have consistent width (160px) for visual alignment
- **As a mobile user**, I want button outer edges to align properly between top and bottom rows for clean layout
- **As a desktop user**, I want to take advantage of larger screens for more efficient workflows
- **As any user**, I want the interface to be consistent across different screen sizes so that the experience is predictable
- **As a mobile user**, I want to access navigation through a hamburger menu that provides all main functions
- **As any user**, I want buttons to use appropriate variants (greyscale, ghost, outline) for better visual hierarchy and accessibility
- **As any user**, I want vote buttons in card view to show only the count without "Vote"/"Voted" text to prevent wrapping on mobile

### Navigation & Workflow

- **As a user**, I want clear navigation between different sections so that I can easily find what I need
- **As a user**, I want to understand my current location in the application so that I don't get lost
- **As a user**, I want quick access to key actions like submitting ideas and viewing discussions
- **As a user**, I want the interface to provide helpful feedback for my actions so that I know what's happening
- **As a user**, I want to use my browser's back and forward buttons to quickly return to previous pages and traverse the app history
- **As a user**, I want visible back buttons or navigation links on detail pages (such as idea view, comment view, admin panels) so I can easily return to the previous list or dashboard
- **As a user**, I want the app header or logo to click to the organization base URL (landing page) so I can quickly return home from anywhere (Issue #80)
- **As a user**, I want navigation menus or breadcrumbs to help me jump between major sections (dashboard, ideas, categories, admin, settings) without excessive clicking
- **As a user**, I want navigation to be fast and intuitive, minimizing the number of clicks needed to reach any feature
- **As a user**, I want navigation elements to be accessible and usable on all device sizes (mobile, tablet, desktop)
- **As a user**, I want navigation to be reliable, with no broken links or dead ends

### Performance & Reliability

- **As any user**, I want pages to load quickly so that the application feels responsive
- **As any user**, I want voting and commenting to work smoothly without delays so that participation is seamless
- **As any user**, I want error messages to be clear and helpful so that I can resolve problems
- **As any user**, I want the application to handle network issues gracefully so that temporary problems don't cause data loss
- **As any user**, I want the page scrollbar to remain visible at all times so that dropdown menus and modals don't cause layout shifts and a "wonky feel"
- **As any user**, I want the reCAPTCHA badge to be hidden via CSS so that it doesn't interfere with the UI (Issue #72)

### UI Polish & Visual Design

- **As any user**, I want consistent button sizing and alignment across card views for a professional appearance
- **As any user**, I want dropdown menus to render using React Portal so they aren't cut off by parent container overflow
- **As any user**, I want color-coded status indicators (green/yellow/red) for quick visual scanning of idea states
- **As any user**, I want the interface to use proper whitespace and nowrap properties to prevent awkward text wrapping
- **As any user**, I want icon and text labels on buttons to be clear and concise, using abbreviated text when necessary for mobile layouts

---

## 10. Security & Data Protection

### Authentication Security

- **As a system**, I want passwords to be properly hashed so that user credentials are protected
- **As a system**, I want JWT tokens to expire appropriately so that sessions don't last indefinitely
- **As a system**, I want rate limiting on authentication endpoints so that brute force attacks are prevented
- **As a system**, I want password reset tokens to expire so that they can't be used indefinitely

### Authorization Controls

- **As a system**, I want users to only be able to edit/delete their own content so that data integrity is maintained
- **As a system**, I want admin functions to be properly protected so that only authorized users can access them
- **As a system**, I want API endpoints to validate user permissions so that unauthorized actions are prevented
- **As a system**, I want export functionality to be admin-only so that sensitive data is protected

### Data Validation

- **As a system**, I want all user inputs to be validated so that invalid data doesn't enter the database
- **As a system**, I want XSS protection so that malicious scripts can't be injected
- **As a system**, I want proper error handling so that system internals aren't exposed to users
- **As a system**, I want database queries to be protected against injection attacks

---

## 11. Integration & API Testing

### API Functionality

- **As a developer**, I want all API endpoints to respond correctly so that the frontend can function properly
- **As a developer**, I want API errors to be properly formatted so that the frontend can handle them appropriately
- **As a developer**, I want authentication to work consistently across all protected endpoints
- **As a developer**, I want pagination to work correctly for large datasets so that performance remains good

### Database Operations

- **As a system**, I want database connections to be reliable so that the application doesn't fail unexpectedly
- **As a system**, I want database migrations to work properly so that schema changes can be deployed safely
- **As a system**, I want database queries to be efficient so that the application performs well at scale
- **As a system**, I want data relationships to be properly maintained so that referential integrity is preserved

---

## Test Data Requirements

### Basic Test Data

- Users: Regular users, admin users, superuser
- Ideas: Various ideas with different statuses, categories, priorities, and vote counts
- Comments: Comments on ideas with various vote counts
- Categories: Multiple categories for filtering and organization
- Votes: Various voting patterns on ideas and comments

### Edge Cases

- Empty datasets (no ideas, no comments, no categories)
- Large datasets (many ideas, comments, votes for performance testing)
- Invalid data (malformed requests, missing fields, invalid IDs)
- Permission boundaries (cross-user operations, unauthorized access attempts)
- Concurrent operations (multiple users voting/commenting simultaneously)

---

## Success Criteria

Each user story should be tested to ensure:

1. **Functionality**: The feature works as described
2. **Security**: Proper authorization and validation
3. **Performance**: Acceptable response times
4. **Usability**: Clear feedback and error handling
5. **Reliability**: Consistent behavior across different scenarios

## 12. URL and Navigation System

### Slug-Based URLs

- **As any user**, I want to access ideas through descriptive slug URLs that include the title and a unique identifier
- **As any user**, I want old UUID-based URLs to redirect properly to the new slug format for backward compatibility
- **As a developer**, I want the system to handle both `/idea/uuid` and `/idea/slug` formats seamlessly
- **As any user**, I want shareable URLs that are descriptive and professional-looking
- **As any user**, I want to navigate directly to specific ideas using bookmarked URLs

### Browser Navigation

- **As any user**, I want to use browser back/forward buttons to navigate efficiently between pages
- **As any user**, I want proper browser history management so navigation feels natural
- **As any user**, I want page refreshes to maintain my current location in the application

---

## 13. Enhanced UI Components

### Button System

- **As any user**, I want consistent button styling across the application with appropriate variants (greyscale, ghost, outline)
- **As any user**, I want buttons to provide clear visual feedback on hover and interaction states
- **As a mobile user**, I want buttons to be appropriately sized for touch interaction
- **As any user**, I want button variants to follow a logical hierarchy for primary, secondary, and tertiary actions

### Admin Interface Enhancements

- **As an admin**, I want clearly distinguished admin-only comments that stand out from regular user comments
- **As an admin**, I want admin controls to be visually separated and clearly marked to prevent accidental actions
- **As an admin**, I want consistent styling across all admin panels and forms

---

*Generated for Business Review 360 Application Testing - Comprehensive Coverage of All Features and User Roles*
