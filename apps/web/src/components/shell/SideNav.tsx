import * as React from "react";
import { css } from "styled-system/css";

const navItems = [
  { label: "Documents", href: "#documents" },
  { label: "Claims", href: "#claims" },
  { label: "Profiles", href: "#profiles" },
  { label: "Review queue", href: "#review" },
  { label: "Settings", href: "#settings" },
];

export const SideNav: React.FC = () => {
  const [activeHref, setActiveHref] = React.useState(() => {
    if (typeof window === "undefined") {
      return "#documents";
    }
    return window.location.hash || "#documents";
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleHash = () => {
      setActiveHref(window.location.hash || "#documents");
    };
    window.addEventListener("hashchange", handleHash);
    return () => {
      window.removeEventListener("hashchange", handleHash);
    };
  }, []);

  return (
    <nav
      aria-label="Primary"
      className={css({
        width: "sidebarWidth",
        minHeight: "100vh",
        borderRightWidth: "thin",
        borderRightStyle: "solid",
        borderRightColor: "borderSubtle",
        background: "surfaceRaised",
        display: "flex",
        flexDirection: "column",
        padding: "6 4",
        gap: "6",
      })}
    >
      <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        <span
          className={css({
            fontSize: "lg",
            fontWeight: "700",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          })}
        >
          Panda Claims
        </span>
        <p className={css({ margin: 0, fontSize: "xs", color: "textMuted" })}>
          Intake workspace
        </p>
      </div>
      <ul
        className={css({
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: "2",
        })}
      >
        {navItems.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <li key={item.label}>
              <a
                href={item.href}
                className={css({
                  display: "block",
                  padding: "3 4",
                  borderRadius: "lg",
                  fontWeight: isActive ? "600" : "500",
                  background: isActive ? "surface" : "transparent",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: isActive ? "borderStrong" : "transparent",
                  color: isActive ? "textPrimary" : "textSecondary",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                  _hover: isActive
                    ? undefined
                    : {
                        background: "surface",
                      },
                })}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
