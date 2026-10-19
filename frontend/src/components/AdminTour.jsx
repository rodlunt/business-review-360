import { useEffect, useRef } from "react";
import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { api } from "../api";

const STEPS = [
  {
    id: "welcome",
    text: "<strong>Welcome to Business Review 360!</strong><br/><br/>Let me show you the key tools available to you as an admin. This takes about a minute — you can dismiss it and resume from the admin menu any time.",
    buttons: [
      { text: "Skip tour", action: (tour) => tour.cancel(), secondary: true },
      { text: "Let's go", action: (tour) => tour.next() },
    ],
  },
  {
    id: "user-manager",
    attachTo: { element: '[data-testid="user-manager-section"]', on: "top" },
    title: "User management",
    text: "Approve registrations, promote users to admin, reset passwords, or remove members here. You can also bulk-import users via CSV.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "analytics",
    attachTo: { element: '[data-testid="admin-analytics-menu-item"]', on: "bottom" },
    title: "Analytics",
    text: "See idea trends, engagement, and the priority matrix. Use the board report to share a summary with stakeholders.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "export",
    attachTo: { element: '[data-testid="export-section"]', on: "top" },
    title: "Data export",
    text: "Download all ideas as CSV or JSON at any time. Bulk user upload is here too.",
    buttons: [
      { text: "Back", action: (tour) => tour.back(), secondary: true },
      { text: "Next", action: (tour) => tour.next() },
    ],
  },
  {
    id: "done",
    title: "You're good to go!",
    text: "That covers the essentials. Resume this tour any time from the admin menu.",
    buttons: [{ text: "Finish", action: (tour) => tour.complete() }],
  },
];

export default function AdminTour({ onComplete, startStep = 0 }) {
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
      api.patch("/users/walkthrough", { type: "admin" }).catch(() => {});
      onComplete?.();
    });

    // Cancelling (dismiss / skip) saves the current step so the tour resumes
    // from where the user left off next time.
    tour.on("cancel", () => {
      api
        .patch("/users/walkthrough", { type: "admin", step: currentIndexRef.current })
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
