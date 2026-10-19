/**
 * Email Preview Server
 *
 * Run this script to preview email templates in your browser.
 *
 * Usage:
 *   node src/emails/preview.js
 *
 * Then open http://localhost:3001 in your browser.
 *
 * Note: dev preview script, console.* intentional (no structured-logger
 * dependency, output is consumed directly by the developer's terminal).
 */
/* eslint-disable no-console */

import http from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as esbuild from "esbuild";
import { render } from "@react-email/render";
import React from "react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.EMAIL_PREVIEW_PORT || 3001;

// Build and import JSX files using esbuild
async function buildAndImport(entryPoint) {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    packages: "external", // Don't bundle node_modules
    loader: { ".jsx": "jsx", ".js": "js" },
    jsx: "automatic",
    jsxImportSource: "react",
  });

  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(dataUrl);
}

// Render an email template to HTML
async function renderTemplate(templatePath, props) {
  const module = await buildAndImport(templatePath);
  const Component = module.default || Object.values(module)[0];
  const element = React.createElement(Component, props);
  return render(element, { pretty: true });
}

// Available templates with their sample props
const templates = {
  PasswordReset: {
    path: join(__dirname, "templates/auth/PasswordReset.jsx"),
    props: {
      userName: "John Doe",
      resetUrl: "https://app.br360.example.com/org/demo-corp/reset-password?token=abc123xyz",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      expirationMinutes: 60,
    },
  },
  Welcome: {
    path: join(__dirname, "templates/auth/Welcome.jsx"),
    props: {
      userName: "John Doe",
      organizationName: "Demo Corp",
      organizationId: "demo-corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      loginUrl: "https://app.br360.example.com/org/demo-corp/login",
      ideasUrl: "https://app.br360.example.com/org/demo-corp/ideas",
      adminEmail: "admin@democorp.com",
    },
  },
  VerifyEmail: {
    path: join(__dirname, "templates/auth/VerifyEmail.jsx"),
    props: {
      userName: "John Doe",
      verificationUrl: "https://app.br360.example.com/verify?token=abc123xyz",
      verificationCode: "123456",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      expirationHours: 24,
    },
  },
  PasswordChanged: {
    path: join(__dirname, "templates/auth/PasswordChanged.jsx"),
    props: {
      userName: "John Doe",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      changeTimestamp: new Date().toISOString(),
      resetUrl: "https://app.br360.example.com/org/demo-corp/forgot-password",
      adminEmail: "admin@democorp.com",
    },
  },
  AdminUserPendingApproval: {
    path: join(__dirname, "templates/auth/AdminUserPendingApproval.jsx"),
    props: {
      adminName: "Admin User",
      newUserName: "newuser123",
      newUserEmail: "newuser@example.com",
      registeredAt: new Date().toISOString(),
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      adminUrl: "https://app.br360.example.com/org/demo-corp/admin/users",
    },
  },
  UserAccountApproved: {
    path: join(__dirname, "templates/auth/UserAccountApproved.jsx"),
    props: {
      userName: "John Doe",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      loginUrl: "https://app.br360.example.com/org/demo-corp/login",
      ideasUrl: "https://app.br360.example.com/org/demo-corp/ideas",
    },
  },
  MagicLink: {
    path: join(__dirname, "templates/auth/MagicLink.jsx"),
    props: {
      magicLinkUrl: "https://app.br360.example.com/auth/magic-link?token=abc123xyz",
      expirationMinutes: 15,
    },
  },

  // ============================================
  // NOTIFICATION TEMPLATES
  // ============================================

  CommentOnIdea: {
    path: join(__dirname, "templates/notifications/CommentOnIdea.jsx"),
    props: {
      userName: "John Doe",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: "https://app.br360.example.com/org/demo-corp/idea/digital-pest-tracking-12345",
      commenterName: "Jane Smith",
      commentPreview:
        "This would be brilliant for our quarterly termite inspections. We spend ages transcribing handwritten notes into the system...",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      unsubscribeUrl: "https://app.br360.example.com/org/demo-corp/unsubscribe/idea/12345",
    },
  },
  StatusChange: {
    path: join(__dirname, "templates/notifications/StatusChange.jsx"),
    props: {
      userName: "John Doe",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: "https://app.br360.example.com/org/demo-corp/idea/digital-pest-tracking-12345",
      oldStatus: "Reviewing",
      newStatus: "Approved",
      adminName: "Admin User",
      adminComments:
        "Great idea! We will be moving forward with this in Q2. The development team will reach out soon to discuss implementation details.",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
    },
  },
  IdeaImplemented: {
    path: join(__dirname, "templates/notifications/IdeaImplemented.jsx"),
    props: {
      userName: "John Doe",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: "https://app.br360.example.com/org/demo-corp/idea/digital-pest-tracking-12345",
      timeSavedMinutes: 25,
      implementationDate: new Date().toISOString(),
      adminComments:
        "The app has been deployed to all field technicians. Training sessions will be held next week.",
      organizationName: "Demo Corp",
      organizationId: "demo-corp",
      primaryColor: "#1976d2",
      logoUrl: null,
    },
  },
  CommentReply: {
    path: join(__dirname, "templates/notifications/CommentReply.jsx"),
    props: {
      userName: "John Doe",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaUrl: "https://app.br360.example.com/org/demo-corp/idea/digital-pest-tracking-12345",
      replyAuthorName: "Jane Smith",
      replyPreview:
        "I completely agree! We could also add photo capture functionality to document evidence of pest activity...",
      originalCommentPreview: "This would save so much time on our quarterly inspections.",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
      unsubscribeUrl: null,
    },
  },

  // ============================================
  // ADMIN TEMPLATES
  // ============================================

  NewIdeaSubmitted: {
    path: join(__dirname, "templates/admin/NewIdeaSubmitted.jsx"),
    props: {
      adminName: "Admin User",
      ideaTitle: "Digital Pest Activity Tracking App",
      ideaDescription:
        "Develop a mobile app for technicians to log pest activity in real-time during inspections. Include photo uploads, GPS coordinates, and species identification. This would eliminate handwritten notes and speed up report generation significantly.",
      ideaUrl: "https://app.br360.example.com/org/demo-corp/idea/digital-pest-tracking-12345",
      authorName: "Stewart Paterson",
      category: "Technology",
      priority: "High",
      timeSavedMinutes: 25,
      impactScore: 8,
      effortScore: 6,
      submittedAt: new Date().toISOString(),
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
    },
  },
  IdeasNeedAttention: {
    path: join(__dirname, "templates/admin/IdeasNeedAttention.jsx"),
    props: {
      adminName: "Admin User",
      staleIdeas: [
        {
          title: "Digital Pest Activity Tracking App",
          url: "https://app.br360.example.com/org/demo-corp/idea/digital-pest-tracking-12345",
          daysInReview: 23,
          authorName: "Stewart Paterson",
          commentCount: 3,
          category: "Technology",
        },
        {
          title: "Automated Vehicle Stock Management",
          url: "https://app.br360.example.com/org/demo-corp/idea/vehicle-stock-67890",
          daysInReview: 18,
          authorName: "John Smith",
          commentCount: 1,
          category: "Operations",
        },
        {
          title: "Customer Portal Upgrade",
          url: "https://app.br360.example.com/org/demo-corp/idea/customer-portal-11111",
          daysInReview: 15,
          authorName: "Sarah Johnson",
          commentCount: 0,
          category: "Technology",
        },
        {
          title: "Automated Reminder System",
          url: "https://app.br360.example.com/org/demo-corp/idea/reminders-22222",
          daysInReview: 14,
          authorName: "Mike Brown",
          commentCount: 2,
          category: "Operations",
        },
      ],
      threshold: 14,
      allIdeasUrl: "https://app.br360.example.com/org/demo-corp/admin/ideas?status=reviewing",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
    },
  },
  DailyIdeaDigest: {
    path: join(__dirname, "templates/admin/DailyIdeaDigest.jsx"),
    props: {
      adminName: "Admin User",
      ideas: [
        {
          title: "Pest ID Mobile App",
          url: "https://app.br360.example.com/org/demo-corp/idea/pest-id-app",
          authorName: "Stewart Paterson",
          category: "Technology",
          priority: "High",
          timeSavedMinutes: 25,
        },
        {
          title: "Automated Reminders",
          url: "https://app.br360.example.com/org/demo-corp/idea/auto-reminders",
          authorName: "John Smith",
          category: "Operations",
          priority: "Medium",
          timeSavedMinutes: 15,
        },
        {
          title: "Customer Portal Upgrade",
          url: "https://app.br360.example.com/org/demo-corp/idea/customer-portal",
          authorName: "Sarah Johnson",
          category: "Technology",
          priority: "Low",
          timeSavedMinutes: 10,
        },
      ],
      digestPeriod: "today",
      allIdeasUrl: "https://app.br360.example.com/org/demo-corp/ideas",
      organizationName: "Demo Corp",
      primaryColor: "#1976d2",
      logoUrl: null,
    },
  },
};

// Generate template list HTML
function getTemplateListHtml() {
  const templateLinks = Object.keys(templates)
    .map((name) => `<li><a href="/${name}">${name}</a></li>`)
    .join("\n");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Template Preview</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 40px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        h1 { color: #1976d2; }
        ul { list-style: none; padding: 0; }
        li { margin: 10px 0; }
        a {
          display: block;
          padding: 15px 20px;
          background: white;
          border-radius: 8px;
          text-decoration: none;
          color: #333;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: box-shadow 0.2s;
        }
        a:hover {
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .count { color: #666; font-size: 14px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1>Email Template Preview</h1>
      <p>Select a template to preview:</p>
      <ul>
        ${templateLinks}
      </ul>
      <p class="count">${Object.keys(templates).length} templates available</p>
    </body>
    </html>
  `;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const templateName = req.url.slice(1); // Remove leading slash

  // Root path - show template list
  if (!templateName || templateName === "") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getTemplateListHtml());
    return;
  }

  // Check if template exists
  const template = templates[templateName];
  if (!template) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(`
      <h1>Template Not Found</h1>
      <p>Template "${templateName}" does not exist.</p>
      <a href="/">Back to template list</a>
    `);
    return;
  }

  try {
    // Render the template
    const html = await renderTemplate(template.path, template.props);

    // Wrap in preview container
    const previewHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${templateName} - Email Preview</title>
        <style>
          body { margin: 0; padding: 20px; background: #e0e0e0; }
          .controls {
            max-width: 600px;
            margin: 0 auto 20px;
            padding: 10px 20px;
            background: #333;
            color: white;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .controls a { color: #90caf9; text-decoration: none; }
          .controls a:hover { text-decoration: underline; }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
        </style>
      </head>
      <body>
        <div class="controls">
          <a href="/">← Back to templates</a>
          <span>${templateName}</span>
          <span></span>
        </div>
        <div class="email-container">
          ${html}
        </div>
      </body>
      </html>
    `;

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(previewHtml);
  } catch (error) {
    console.error("Error rendering template:", error);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`
      <h1>Render Error</h1>
      <pre>${error.stack || error.message}</pre>
      <a href="/">Back to template list</a>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`\n📧 Email Preview Server running at http://localhost:${PORT}\n`);
  console.log("Available templates:");
  Object.keys(templates).forEach((name) => {
    console.log(`  - http://localhost:${PORT}/${name}`);
  });
  console.log("\nPress Ctrl+C to stop the server.\n");
});
