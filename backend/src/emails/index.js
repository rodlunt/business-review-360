/**
 * Email System Entry Point
 *
 * This module provides the email template system for Business Review 360.
 * Built with React Email for professional, branded email templates.
 *
 * Usage:
 *
 * import { sendTemplateEmail, PasswordReset } from './emails/index.js';
 *
 * await sendTemplateEmail({
 *   to: 'user@example.com',
 *   subject: 'Reset your password',
 *   template: PasswordReset,
 *   templateProps: {
 *     resetUrl: 'https://...',
 *     organizationName: 'TradeZone',
 *     primaryColor: '#00667e',
 *   },
 * });
 */

// Utilities
export { renderEmail, renderEmailHtml, renderEmailText } from "./utils/renderEmail.js";

export { sendTemplateEmail, sendRawEmail } from "./utils/sendEmail.js";

// Components (for building custom templates)
export {
  EmailLayout,
  Header,
  Footer,
  Button,
  Section,
  IdeaCard,
  Divider,
  Text,
  Link,
  Img,
} from "./components/index.js";

// Theme
export { theme, getOrganizationTheme, getStatusStyle } from "./styles/theme.js";

// Templates - Auth
export { PasswordReset } from "./templates/auth/index.js";

// Future template exports:
// export { Welcome, VerifyEmail, PasswordChanged } from './templates/auth/index.js';
// export { CommentOnIdea, StatusChange, IdeaImplemented } from './templates/notifications/index.js';
// export { NewIdeaSubmitted, IdeasNeedAttention } from './templates/admin/index.js';
// export { WeeklySummary, MonthlySummary } from './templates/digest/index.js';
