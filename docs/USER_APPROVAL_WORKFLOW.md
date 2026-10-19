# User Approval Workflow

**Date:** 2025-11-16
**Status:** In Progress
**Related Epic:** Email Communications (for approval emails)

## Overview

When `allowSelfRegistration` is disabled for an organization, new user registrations require admin approval before users can access the system.

## User Flow

### 1. User Registration (Self-Registration Disabled)

When a user attempts to register:

1. User submits registration form with username, email, password
2. Backend checks organization's `allowSelfRegistration` setting
3. If `false`:
   - User is created with `isApproved = false`
   - HTTP 202 response returned (no auth tokens)
   - Message: "Registration successful! Your account is pending approval by an administrator. You will receive an email when your account is approved."
4. If `true`:
   - User is created with `isApproved = true` (default)
   - HTTP 200 response with auth tokens (normal flow)

### 2. Admin Notification

**⚠️ TO BE IMPLEMENTED - Add to Email Epic**

When a user registers and requires approval:

- **Trigger:** User created with `isApproved = false`
- **Recipients:** All admin users for the organization
- **Subject:** "New User Registration Pending Approval - {organizationName}"
- **Content:**
  - User details (username, email)
  - Link to Admin Settings > User Management
  - "Approve User" CTA button
  - Timestamp of registration

### 3. Admin Approval Process

Admin workflow:

1. Admin receives email notification (or checks User Management panel)
2. Admin navigates to Admin Settings > User Management
3. Pending users displayed with visual indicator (e.g., warning badge)
4. Admin clicks "Edit" on pending user
5. "Approve User" button appears in Edit User modal
6. Admin clicks "Approve User"
7. Backend updates `isApproved = true`
8. Approval email sent to user

### 4. User Approval Email

**⚠️ TO BE IMPLEMENTED - Add to Email Epic**

When an admin approves a user:

- **Trigger:** User `isApproved` changes from `false` to `true`
- **Recipient:** Approved user's email address
- **Subject:** "Your {organizationName} Account Has Been Approved!"
- **Content:**
  - Welcome message
  - Account approved notification
  - Link to organization's Review Ideas page: `/org/{organizationId}/ideas`
  - Login instructions
  - Support contact information

### 5. User Login (Unapproved Account)

If an unapproved user tries to login:

- HTTP 403 response
- Error: "Your account is pending approval by an administrator. You will receive an email when your account is approved."
- Login blocked until approved

## Database Schema

### Users Table - New Field

```sql
"isApproved" BOOLEAN NOT NULL DEFAULT true
```

- **Default:** `true` (for backward compatibility)
- **Purpose:** Track approval status for new registrations
- **Migration:** `db/migrations/001_add_isApproved_to_users.sql`

### Organizations Table - Existing Field

```sql
"allowSelfRegistration" BOOLEAN DEFAULT true
```

- Controls whether users can auto-register or need approval

## API Endpoints

### POST /api/auth/register

**Behavior when self-registration disabled:**

Request:
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepassword",
  "organizationId": "tradezone"
}
```

Response (HTTP 202 Accepted):
```json
{
  "success": true,
  "pending": true,
  "message": "Registration successful! Your account is pending approval by an administrator. You will receive an email when your account is approved.",
  "user": {
    "id": "uuid",
    "username": "newuser",
    "email": "user@example.com",
    "isApproved": false
  }
}
```

### POST /api/auth/login

**Behavior for unapproved users:**

Response (HTTP 403 Forbidden):
```json
{
  "error": "Your account is pending approval by an administrator. You will receive an email when your account is approved."
}
```

### POST /api/users/:id/approve

**⚠️ TO BE IMPLEMENTED**

Request:
```
POST /api/users/uuid-here/approve
Authorization: Bearer {admin-token}
```

Response (HTTP 200 OK):
```json
{
  "success": true,
  "message": "User approved successfully",
  "user": {
    "id": "uuid",
    "username": "newuser",
    "isApproved": true
  }
}
```

Requirements:
- Admin-only endpoint (check `req.user.isAdmin`)
- Validate user exists and belongs to same organization
- Update `isApproved = true`
- Trigger approval email

## Frontend Components

### AdminSettings.js - User Management Panel

**Changes Required:**

1. **Visual Indicator for Pending Users:**
   - Display warning badge/chip for users with `isApproved = false`
   - Example: `<Chip label="Pending Approval" color="warning" size="small" />`
   - Sort pending users to top of list

2. **Edit User Modal:**
   - Add "Approve User" button when `isApproved === false`
   - Button appears prominently in modal
   - Calls `/api/users/:id/approve` endpoint
   - Shows success message on approval

3. **Pending Users Counter:**
   - Show count of pending users in User Management header
   - Example: "User Management (2 pending)"

### Registration Page (Frontend)

**Changes Required:**

- Handle HTTP 202 response from registration
- Display pending approval message
- Don't attempt to store auth tokens (none provided)
- Redirect to login page with info message

## Email Templates

**⚠️ TO BE ADDED TO EMAIL EPIC**

### 1. Admin Notification Email

**File:** `backend/src/templates/emails/admin-user-pending-approval.html`

```html
<h2>New User Registration Pending Approval</h2>
<p>A new user has registered and requires approval:</p>
<ul>
  <li><strong>Username:</strong> {{username}}</li>
  <li><strong>Email:</strong> {{email}}</li>
  <li><strong>Registered:</strong> {{registeredAt}}</li>
</ul>
<a href="{{adminUrl}}" style="button">Review & Approve User</a>
```

### 2. User Approval Email

**File:** `backend/src/templates/emails/user-account-approved.html`

```html
<h2>Your Account Has Been Approved!</h2>
<p>Welcome to {{organizationName}}!</p>
<p>Your account has been approved by an administrator. You can now log in and start submitting ideas.</p>
<a href="{{loginUrl}}" style="button">Log In Now</a>
<a href="{{reviewIdeasUrl}}" style="button">Browse Ideas</a>
```

## Implementation Status

### ✅ Completed

1. User model `isApproved` field added
2. Database schema updated
3. Migration script created
4. Registration endpoint updated
5. Login endpoint blocks unapproved users

### 🚧 In Progress

6. Update User Management UI to show pending users
7. Add "Approve User" action to Edit User modal
8. Create `/api/users/:id/approve` endpoint

### 📋 To Do (Email Epic)

9. Admin notification email when user registers
10. User approval email when account is approved
11. Email template creation
12. Email sending logic integration

## Testing Checklist

### Backend Tests

- [ ] User created with `isApproved=false` when self-registration disabled
- [ ] User created with `isApproved=true` when self-registration enabled
- [ ] Registration returns 202 + pending message for unapproved users
- [ ] Registration returns 200 + tokens for approved users
- [ ] Login blocked for unapproved users (HTTP 403)
- [ ] Login successful for approved users
- [ ] Approve endpoint updates `isApproved` correctly
- [ ] Approve endpoint is admin-only

### Frontend Tests

- [ ] Pending users displayed with visual indicator
- [ ] Pending users sorted to top of list
- [ ] "Approve User" button appears for pending users
- [ ] "Approve User" button hidden for approved users
- [ ] Approval success message displayed
- [ ] User list refreshes after approval
- [ ] Registration page handles pending status correctly

### Email Tests

- [ ] Admin notification sent when user registers
- [ ] Admin notification sent to all admins
- [ ] Approval email sent when user is approved
- [ ] Email links work correctly
- [ ] Email templates render properly

## Security Considerations

1. **Admin-Only Approval:** Only admins can approve users (verify `isAdmin` flag)
2. **Organization Isolation:** Admins can only approve users from their own organization
3. **Token Security:** Unapproved users receive no auth tokens
4. **Email Verification:** Consider requiring email verification before approval
5. **Audit Logging:** Log all approval actions for compliance

## Future Enhancements

1. **Bulk Approval:** Allow admins to approve multiple users at once
2. **Rejection Workflow:** Allow admins to reject registrations with reason
3. **Approval Expiry:** Auto-delete unapproved users after N days
4. **Self-Service Approval:** Allow users to request re-review
5. **Approval Notes:** Allow admins to add notes during approval
