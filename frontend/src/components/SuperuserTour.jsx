import { useEffect, useRef } from "react";
import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { api } from "../api";

const STEPS = [
  {
    id: "welcome",
    text: "<strong>Welcome to Business Review 360!</strong><br/><br/>Let me walk you through setting up your organisation. This will only take a few minutes — you can dismiss it at any step and resume it from the admin menu.",
    buttons: [
      { text: "Skip tour", action: (tour) => tour.cancel(), secondary: true },
      { text: "Let's go", action: (tour) => tour.next() },
    ],
  },
  {
    id: "org-name",
    attachTo: { element: '[data-testid="organization-name"]', on: "bottom" },
    title: "Organisation name",
    text: "Give your organisation a name. This appears in emails and throughout the app.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "big-question",
    attachTo: { element: '[data-testid="big-question"]', on: "bottom" },
    title: "The Big Question",
    text: "This is the central prompt displayed to your team on the review page. Make it specific — what do you want to learn from them?",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "primary-color",
    attachTo: { element: '[data-testid="primary-color"]', on: "bottom" },
    title: "Brand colour",
    text: "Customise the app with your organisation's brand colour.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "logo",
    attachTo: { element: '[data-testid="choose-logo-file"]', on: "bottom" },
    title: "Logo",
    text: "Upload your logo for the full branded experience. SVG and PNG both work well.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "save",
    attachTo: { element: '[data-testid="save-organization-settings"]', on: "top" },
    title: "Save your settings",
    text: "Hit Save whenever you make changes to the organisation details.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "superuser-settings",
    attachTo: { element: '[data-testid="superuser-settings-section"]', on: "top" },
    title: "Superuser settings",
    text: "These settings are only visible to you as the superuser — registration rules, CAPTCHA, idea approval requirements, and more.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "user-manager",
    attachTo: { element: '[data-testid="user-manager-section"]', on: "top" },
    title: "Manage your team",
    text: "Promote users to admin, approve registrations, reset passwords, or remove members from here.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "done",
    title: "You're all set!",
    text: "Your organisation is ready to go. You can reopen this tour at any time from the admin menu.",
    buttons: [{ text: "Finish", action: (tour) => tour.complete() }],
  },
];

export default function SuperuserTour({ onComplete, startStep = 0 }) {
  const tourRef = useRef(null);
  const currentIndexRef = useRef(startStep);

  useEffect(() => {
    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: "smooth", block: "center" },
        modalOverlayOpeningRadius: 6,
        popperOptions: {
          modifiers: [{ name: "offset", options: { offset: [0, 12] } }],
        },
      },
    });

    STEPS.forEach(({ buttons, ...step }) => {
      tour.addStep({
        ...step,
        buttons: buttons.map(({ secondary, action, ...btn }) => ({
          ...btn,
          classes: secondary ? "shepherd-button-secondary" : "",
          action: () => action(tour),
        })),
      });
    });

    tour.on("show", () => {
      currentIndexRef.current = tour.steps.indexOf(tour.getCurrentStep());
    });

    // Completing the tour clears any saved position: a finished tour must
    // not resume from a stale step next time it is reopened.
    tour.on("complete", () => {
      api.patch("/users/walkthrough", { type: "superuser" }).catch(() => {});
      onComplete?.();
    });

    // Cancelling (dismiss / skip) saves the current step so the tour resumes
    // from where the user left off next time.
    tour.on("cancel", () => {
      api
        .patch("/users/walkthrough", { type: "superuser", step: currentIndexRef.current })
        .catch(() => {});
      onComplete?.();
    });

    tourRef.current = tour;
    tour.start();
    if (startStep > 0) tour.show(startStep);

    return () => {
      if (tourRef.current?.isActive()) tourRef.current.cancel();
    };
  }, [onComplete, startStep]);

  return null;
}
