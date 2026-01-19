import * as React from "react";
import { css } from "styled-system/css";
import { button } from "styled-system/recipes";

type ViewMode = "grid" | "list";

type DocumentHeaderProps = {
  onUploadClick: () => void;
  onShowShortcuts: () => void;
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
};

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  onUploadClick,
  onShowShortcuts,
  viewMode,
  onViewChange,
}) => {
  return (
    <div
      className={css({
        display: "grid",
        gap: "4",
        gridTemplateColumns: "1fr",
      })}
    >
      <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        <p
          className={css({
            margin: 0,
            fontSize: "hero",
            fontWeight: "700",
          })}
        >
          Documents
        </p>
        <div className={css({ display: "flex", gap: "2", flexWrap: "wrap", alignItems: "center" })}>
          <span className={css({ fontSize: "sm", color: "textMuted" })}>
            Upload. Find. Review. All documents organized for claims and profiles.
          </span>
          <span
            className={css({
              padding: "1 3",
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "borderSubtle",
              fontSize: "xs",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            })}
          >
            Workflow
          </span>
        </div>
      </div>
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          gap: "2",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <div className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
          <button type="button" className={button({ size: "md" })} onClick={onUploadClick}>
            Upload
          </button>
          <div className={css({ display: "flex", gap: "1" })}>
            {(
              [
                { id: "grid", label: "Grid view" },
                { id: "list", label: "Table view" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={css({
                  borderRadius: "full",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: viewMode === id ? "primary" : "borderSubtle",
                  background: viewMode === id ? "surfaceRaised" : "transparent",
                  padding: "2 5",
                  fontSize: "xs",
                  fontWeight: viewMode === id ? "600" : "500",
                  cursor: "pointer",
                })}
                aria-pressed={viewMode === id}
                onClick={() => onViewChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={button({ variant: "ghost", tone: "neutral", size: "sm" })}
          onClick={onShowShortcuts}
        >
          Keyboard shortcuts
        </button>
      </div>
    </div>
  );
};
