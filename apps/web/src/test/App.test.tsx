import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@league/upload-ui", () => ({
  DocumentGalleryQuery: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DocumentViewer: () => <div>viewer</div>,
  MetadataForm: () => <div>meta</div>,
  UploaderWidget: () => <div>uploader</div>,
}));

vi.mock("@league/upload-core", () => ({
  createMultipartEngine: () => ({
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  }),
  createUploadClient: () => ({
    restoreQueue: vi.fn(() => new Promise(() => {})),
    on: vi.fn(() => () => {}),
    startQueued: vi.fn(() => Promise.resolve()),
    retryAll: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("../uploadTransport", () => ({
  createFetchTransport: () => ({}),
  createBlobChunkReader: () => ({}),
}));

vi.mock("../queueStore", () => ({
  createIndexedDbQueueStore: () => ({}),
}));

const mockFetch = vi.fn();

beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  mockFetch.mockReset();
});

const renderApp = async () => {
  const queryClient = new QueryClient();
  let renderResult: ReturnType<typeof render> | undefined;
  await act(async () => {
    renderResult = render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );
  });
  return renderResult;
};

test("shows login when no token and logs in", async () => {
  const user = userEvent.setup();
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      accessToken: "token-123",
      user: { email: "member@league.test", role: "MEMBER" },
    }),
  } as Response);

  await renderApp();

  expect(
    screen.getByRole("heading", { name: /sign in/i })
  ).toBeInTheDocument();

  await act(async () => {
    await user.click(screen.getByRole("button", { name: /sign in/i }));
  });

  await waitFor(() => {
    expect(window.localStorage.getItem("league_token")).toBe("token-123");
  });
});

test("logout clears token and returns to login", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem("league_token", "token-abc");

  await renderApp();

  const logout = await screen.findByRole("button", { name: /log out/i });
  await act(async () => {
    await user.click(logout);
  });

  expect(window.localStorage.getItem("league_token")).toBeNull();
  expect(
    screen.getByRole("heading", { name: /sign in/i })
  ).toBeInTheDocument();
});
