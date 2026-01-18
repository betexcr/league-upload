import { createApiFetch } from "@league/app-client";

const defaultBaseUrl = "http://localhost:8080/v1";

export const getApiBaseUrl = (): string => {
  const useMocks = import.meta.env.VITE_USE_MOCKS === "true";
  if (useMocks) {
    return "/v1";
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return envUrl && envUrl.trim().length > 0 ? envUrl : defaultBaseUrl;
};

export const getAuthToken = (): string | null => {
  const envToken = import.meta.env.VITE_API_TOKEN as string | undefined;
  if (envToken && envToken.trim().length > 0) {
    return envToken;
  }
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("league_token");
  }
  return null;
};

export const setAuthToken = (token: string) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("league_token", token);
  }
};

export const clearAuthToken = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("league_token");
  }
};

const notifyAuthLogout = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("auth:logout"));
};

export const apiFetch = createApiFetch({
  getBaseUrl: getApiBaseUrl,
  getAuthToken,
  onUnauthorized: () => {
    clearAuthToken();
    notifyAuthLogout();
  },
});
