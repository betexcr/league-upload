import * as React from "react";
import { css } from "styled-system/css";
import { button } from "styled-system/recipes";
import { useDensity } from "../../contexts/density";

type TopBarProps = {
  userEmail?: string;
  userRole?: string;
  envLabel?: string;
  onLogout: () => void;
};

export const TopBar: React.FC<TopBarProps> = ({
  userEmail,
  userRole,
  envLabel,
  onLogout,
}) => {
  const { density, setDensity } = useDensity();
  const nextDensity = density === "comfortable" ? "compact" : "comfortable";

  return (
    <header
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "4",
        padding: "3 4",
        borderBottomWidth: "thin",
        borderBottomStyle: "solid",
        borderBottomColor: "borderSubtle",
        background: "surface",
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: "toolbar",
      })}
    >
      <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        <p
          className={css({
            margin: 0,
            fontSize: "xl",
            fontWeight: "700",
            letterSpacing: "0.1em",
          })}
        >
          Claims Uploads
        </p>
        <p className={css({ margin: 0, fontSize: "sm", color: "textMuted" })}>
          Upload &rarr; Find &rarr; Review
        </p>
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "3",
          flexWrap: "wrap",
        })}
      >
        <button
          type="button"
          className={button({ variant: "ghost", tone: "neutral", size: "sm" })}
          onClick={() => setDensity(nextDensity)}
          aria-pressed={density === "compact"}
        >
          {density === "compact" ? "Compact" : "Comfortable"} density
        </button>
        <span
          className={css({
            padding: "1 3",
            borderRadius: "full",
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "borderStrong",
            fontSize: "xs",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: "surfaceRaised",
          })}
        >
          {envLabel?.toUpperCase() ?? "PROD"}
        </span>
        <div
          className={css({
            display: "grid",
            gap: "1",
            textAlign: "right",
          })}
        >
          <p className={css({ margin: 0, fontSize: "sm", fontWeight: "600" })}>
            {userEmail ?? "Signed in"}
          </p>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "2",
              fontSize: "xs",
              color: "textMuted",
            })}
          >
            <span>{userRole ?? "USER"}</span>
            <button
              type="button"
              className={button({ variant: "outline", tone: "neutral", size: "sm" })}
              onClick={onLogout}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
