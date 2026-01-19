import * as React from "react";
import { css } from "styled-system/css";

type UploadStep = {
  title: string;
  description?: string;
  content: React.ReactNode;
};

type UploadDrawerProps = {
  isOpen: boolean;
  activeStep: number;
  steps: UploadStep[];
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
};

export const UploadDrawer: React.FC<UploadDrawerProps> = ({
  isOpen,
  activeStep,
  steps,
  onClose,
  onNext,
  onBack,
}) => {
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const currentStep = steps[activeStep];

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={css({
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.25)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      })}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={css({
          width: "min(440px, 90vw)",
          maxHeight: "90vh",
          background: "surface",
          borderRadius: "xl",
          boxShadow: "card",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          overflow: "hidden",
        })}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className={css({
            padding: "4",
            borderBottomWidth: "thin",
            borderBottomStyle: "solid",
            borderBottomColor: "borderSubtle",
            display: "grid",
            gap: "2",
          })}
        >
          <p className={css({ margin: 0, fontSize: "sm", color: "textMuted" })}>
            Upload documents
          </p>
          <div className={css({ display: "grid", gap: "3" })}>
            {steps.map((step, index) => (
              <div
                key={step.title}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "3",
                  fontSize: "sm",
                  color: activeStep === index ? "textPrimary" : "textMuted",
                })}
              >
                <span
                  className={css({
                    width: "5",
                    height: "5",
                    borderRadius: "full",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: activeStep === index ? "accentPrimary" : "borderSubtle",
                    background: activeStep === index ? "accentPrimary" : "transparent",
                    color: activeStep === index ? "surface" : "textMuted",
                    fontSize: "xs",
                  })}
                >
                  {index + 1}
                </span>
                <span>{step.title}</span>
              </div>
            ))}
          </div>
        </header>
        <div
          className={css({
            padding: "4",
            overflowY: "auto",
            display: "grid",
            gap: "4",
          })}
        >
          {currentStep?.content}
        </div>
        <footer
          className={css({
            padding: "4",
            borderTopWidth: "thin",
            borderTopStyle: "solid",
            borderTopColor: "borderSubtle",
            display: "flex",
            justifyContent: "space-between",
            gap: "3",
          })}
        >
          <button
            type="button"
            className={css({
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              padding: "2 5",
              background: "surfaceAlt",
              fontSize: "xs",
            })}
            onClick={onBack}
            disabled={activeStep === 0}
          >
            Back
          </button>
          <button
            type="button"
            className={css({
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "accentPrimary",
              padding: "2 5",
              background: "accentPrimary",
              color: "surface",
              fontSize: "xs",
            })}
            onClick={() => {
              if (activeStep === steps.length - 1) {
                onClose();
                return;
              }
              onNext();
            }}
          >
            {activeStep === steps.length - 1 ? "Close" : "Next"}
          </button>
        </footer>
      </div>
    </div>
  );
};
