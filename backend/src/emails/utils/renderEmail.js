import { render } from "@react-email/render";
import React from "react";
import { logger } from "../../utils/logger.js";

/**
 * Render a React Email component to HTML string
 *
 * @param {Function} EmailComponent - React Email component
 * @param {Object} props - Props to pass to the component
 * @returns {Promise<{html: string, text: string}>} Rendered HTML and plain text
 */
export async function renderEmail(EmailComponent, props = {}) {
  try {
    // Create the React element
    const element = React.createElement(EmailComponent, props);

    // Render to HTML
    const html = await render(element, {
      pretty: true,
    });

    // Render to plain text
    const text = await render(element, {
      plainText: true,
    });

    return { html, text };
  } catch (error) {
    logger.error("[renderEmail] Error rendering email template:", error);
    throw new Error(`Failed to render email template: ${error.message}`, { cause: error });
  }
}

/**
 * Render email to HTML only (for preview)
 *
 * @param {Function} EmailComponent - React Email component
 * @param {Object} props - Props to pass to the component
 * @returns {Promise<string>} Rendered HTML string
 */
export async function renderEmailHtml(EmailComponent, props = {}) {
  const { html } = await renderEmail(EmailComponent, props);
  return html;
}

/**
 * Render email to plain text only
 *
 * @param {Function} EmailComponent - React Email component
 * @param {Object} props - Props to pass to the component
 * @returns {Promise<string>} Rendered plain text string
 */
export async function renderEmailText(EmailComponent, props = {}) {
  const { text } = await renderEmail(EmailComponent, props);
  return text;
}

export default renderEmail;
