import * as React from "react";
import { css } from "styled-system/css";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

type AppShellProps = {
  children: React.ReactNode;
  onLogout: () => void;
  user?: { email: string; role: "USER" | "AGENT" } | null;
  envLabel?: string;
};

export const AppShell: React.FC<AppShellProps> = ({
  children,
  onLogout,
  user,
  envLabel,
}) => {
  return (
    <div
      className={css({
        minHeight: "100vh",
        background: "background",
        display: "flex",
      })}
    >
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "sidebarWidth 1fr",
          minHeight: "100vh",
          width: "100%",
        })}
      >
        <SideNav />
        <div className={css({ display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%" })}>
          <a className="skip-link" href="#main">
            Skip to main content
          </a>
          <TopBar
            envLabel={envLabel}
            userEmail={user?.email}
            userRole={user?.role}
            onLogout={onLogout}
          />
          <main
            id="main"
            className={css({
              flex: 1,
              padding: ["6 4 10", "6 6 12"],
              maxWidth: "containerLg",
              width: "100%",
              margin: "0 auto",
              display: "grid",
              gap: "6",
              alignSelf: "stretch",
            })}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
