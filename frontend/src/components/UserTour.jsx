import { useEffect, useRef } from "react";
import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { api } from "../api";

function buildSteps(bigQuestion, orgName) {
  const context = bigQuestion
    ? `<em>"${bigQuestion}"</em><br/><br/>`
    : orgName
      ? `Welcome to <strong>${orgName}</strong>!<br/><br/>`
      : "";

  return [
    {
      id: "welcome",
      text: `${context}This is your team's idea platform. Here's a quick look at how it works.`,
      buttons: [
        { text: "Skip", action: (tour) => tour.cancel(), secondary: true },
        { text: "Show me", action: (tour) => tour.next() },
      ],
    },
    {
      id: "submit",
      attachTo: { element: '[data-testid="submit-idea-button"]', on: "bottom" },
      title: "Share an idea",
      text: "Got something on your mind? Submit it here — your name can be kept anonymous if the org allows it.",
      buttons: [
        { text: "Back", action: (tour) => tour.back(), secondary: true },
        { text: "Next", action: (tour) => tour.next() },
      ],
    },
    {
      id: "review",
      attachTo: { element: '[data-testid="review-ideas-button"]', on: "bottom" },
      title: "Browse and vote",
      text: "Browse ideas your team has submitted and upvote the ones that matter to you. <strong>Votes directly influence what gets prioritised</strong> — the more support an idea has, the more likely it moves forward.",
      buttons: [
        { text: "Back", action: (tour) => tour.back(), secondary: true },
        { text: "Done", action: (tour) => tour.complete() },
      ],
    },
  ];
}

export default function UserTour({ onComplete, bigQuestion, orgName, startStep = 0 }) {
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

    buildSteps(bigQuestion, orgName).forEach(({ buttons, ...step }) => {
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
      api.patch("/users/walkthrough", { type: "user" }).catch(() => {});
      onComplete?.();
    });

    // Cancelling (dismiss / skip) saves the current step so the tour resumes
    // from where the user left off next time.
    tour.on("cancel", () => {
      api
        .patch("/users/walkthrough", { type: "user", step: currentIndexRef.current })
        .catch(() => {});
      onComplete?.();
    });

    tourRef.current = tour;
    tour.start();
    if (startStep > 0) tour.show(startStep);

    return () => {
      if (tourRef.current?.isActive()) tourRef.current.cancel();
    };
  }, [onComplete, bigQuestion, orgName, startStep]);

  return null;
}
