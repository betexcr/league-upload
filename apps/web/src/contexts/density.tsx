import * as React from "react";

export type DensityMode = "comfortable" | "compact";

const STORAGE_KEY = "claims_app_density";

type DensityContextValue = {
  density: DensityMode;
  setDensity: (mode: DensityMode) => void;
};

const DensityContext = React.createContext<DensityContextValue | null>(null);

export const DensityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [density, setDensityState] = React.useState<DensityMode>(() => {
    if (typeof window === "undefined") {
      return "comfortable";
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "compact") {
      return "compact";
    }
    return "comfortable";
  });

  const setDensity = React.useCallback((next: DensityMode) => {
    setDensityState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.density = density;
    }
  }, [density]);

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
};

export const useDensity = (): DensityContextValue => {
  const context = React.useContext(DensityContext);
  if (!context) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return context;
};
