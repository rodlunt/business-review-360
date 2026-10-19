/**
 * Email Components
 *
 * Re-exports all email components for easy importing.
 *
 * Usage:
 * import { EmailLayout, Header, Footer, Button, Section, IdeaCard, Divider } from '../components/index.js';
 */

export { EmailLayout } from "./EmailLayout.jsx";
export { Header } from "./Header.jsx";
export { Footer } from "./Footer.jsx";
export { Button } from "./Button.jsx";
export { Section } from "./Section.jsx";
export { IdeaCard } from "./IdeaCard.jsx";
export { Divider } from "./Divider.jsx";

// Re-export commonly used React Email components for convenience
export { Text, Link, Img, Row, Column, Heading } from "@react-email/components";
