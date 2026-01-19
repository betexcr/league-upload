import * as React from "react";
import {
  DocumentGalleryQuery,
  DocumentViewer,
  MetadataForm,
  UploaderWidget,
} from "@league/upload-ui";
import type { DocumentRef, Metadata } from "@league/types";
import { useQueryClient } from "@tanstack/react-query";
import { css } from "styled-system/css";
import { apiFetch } from "./apiClient";
import {
  createMultipartEngine,
  createUploadClient,
  type UploadEngine,
  type UploadHandle,
} from "@league/upload-core";
import {
  createBlobChunkReader,
  createFetchTransport,
} from "./uploadTransport";
import { createIndexedDbQueueStore } from "./queueStore";
import {
  clearAuthToken,
  getApiBaseUrl,
  getAuthToken,
  setAuthToken,
} from "./apiClient";

const visuallyHidden = css({
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "px1",
  margin: "-px1",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  width: "px1",
  whiteSpace: "nowrap",
});

const smallButtonClass = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "border",
  borderRadius: "full",
  padding: "2 6",
  background: "highlight",
  fontSize: "xs",
  cursor: "pointer",
  _hover: { background: "surface" },
});

const reportClientLog = (payload: {
  level: "error" | "warn" | "info";
  message: string;
  context?: Record<string, unknown>;
}) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const url = `${getApiBaseUrl()}/admin/logs`;
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Ignore logging failures to avoid recursive errors.
  }
};

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const [authToken, setAuthTokenState] = React.useState<string | null>(
    getAuthToken()
  );
  const [authUser, setAuthUser] = React.useState<{
    email: string;
    role: "USER" | "AGENT";
  } | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const stored = window.localStorage.getItem("league_user");
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as { email: string; role: "USER" | "AGENT" };
    } catch {
      return null;
    }
  });
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<DocumentRef | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = React.useState<
    string | null
  >(null);
  const [watermarkText, setWatermarkText] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = React.useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(null);
  const [largePreviewMimeType, setLargePreviewMimeType] = React.useState<string | null>(null);
  const [metadata, setMetadata] = React.useState<Metadata>({
    title: "2024-02 Prescription",
    categories: ["PRESCRIPTION"],
    tags: ["rx"],
    entityLinks: [{ type: "CLAIM", id: "claim_123" }],
    docDate: new Date().toISOString(),
    notes: "Member uploaded from mobile.",
  });
  const [hasUploadSelection, setHasUploadSelection] = React.useState(false);
  const [phiConsent, setPhiConsent] = React.useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return sessionStorage.getItem("phiConsent") === "true";
  });
  const [phiConsentError, setPhiConsentError] = React.useState(false);
  const [failUploads, setFailUploads] = React.useState(false);
  const [failDocuments, setFailDocuments] = React.useState(false);
  const failUploadsRef = React.useRef(failUploads);
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "ALL" | "ACTIVE" | "SIGNED" | "DELETED"
  >("ALL");
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [restoreState, setRestoreState] = React.useState<{
    status: "idle" | "restoring" | "restored" | "failed";
    count: number;
  }>({ status: "idle", count: 0 });
  const [pendingUploads, setPendingUploads] = React.useState<
    Array<{
      id: string;
      status: string;
      name?: string;
      progress?: { sent: number; total: number };
    }>
  >([]);
  const [uploadEvents, setUploadEvents] = React.useState<
    Array<{
      id: string;
      status: string;
      error?: string;
      name?: string;
      progress?: { sent: number; total: number };
    }>
  >([]);
  const queueStoreRef = React.useRef(createIndexedDbQueueStore());
  const uploadActivityItems = React.useMemo(() => {
    const merged = new Map<
      string,
      {
        id: string;
        status: string;
        error?: string;
        name?: string;
        progress?: { sent: number; total: number };
      }
    >();
    for (const event of uploadEvents) {
      merged.set(event.id, event);
    }
    if (!uploadEvents.length) {
      for (const event of pendingUploads) {
        merged.set(event.id, {
          id: event.id,
          status: event.status,
          name: event.name,
          progress: event.progress,
        });
      }
    }
    return Array.from(merged.values());
  }, [uploadEvents, pendingUploads]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onError = (event: ErrorEvent) => {
      reportClientLog({
        level: "error",
        message: event.message || "Unhandled window error",
        context: {
          source: "window.error",
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      let reason = "";
      if (typeof event.reason === "string") {
        reason = event.reason;
      } else {
        try {
          reason = JSON.stringify(event.reason);
        } catch {
          reason = "Unhandled promise rejection";
        }
      }
      reportClientLog({
        level: "error",
        message: reason || "Unhandled promise rejection",
        context: {
          source: "unhandledrejection",
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const handleLogin = async (payload: {
    email: string;
    password: string;
  }) => {
    setAuthError(null);
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setAuthError("Login failed. Check your email and password.");
      return;
    }
    const data = (await response.json()) as {
      accessToken: string;
      user: { email: string; role: "MEMBER" | "AGENT" };
    };
    await clearUploadQueue();
    setAuthToken(data.accessToken);
    setAuthTokenState(data.accessToken);
    const nextUser = {
      email: data.user.email,
      role: data.user.role === "AGENT" ? "AGENT" : "USER",
    };
    setAuthUser(nextUser);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("league_user", JSON.stringify(nextUser));
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuthTokenState(null);
    setAuthUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("league_user");
    }
    setSelected(null);
    setSelectedPreviewUrl(null);
    void clearUploadQueue();
    void queryClient.clear();
  };

  React.useEffect(() => {
    failUploadsRef.current = failUploads;
  }, [failUploads]);

  const uploadClient = React.useMemo(() => {
    const transport = createFetchTransport({
      getFailMode: () => ({ uploads: failUploadsRef.current }),
    });
    const readChunk = createBlobChunkReader();
    const multipartEngine = createMultipartEngine({ transport, readChunk });
    const engine: UploadEngine = {
      async start(init, onProgress) {
        return multipartEngine.start(init, onProgress);
      },
      async pause(uploadId) {
        await multipartEngine.pause(uploadId);
      },
      async resume(uploadId) {
        await multipartEngine.resume(uploadId);
      },
      async cancel(uploadId) {
        await multipartEngine.cancel(uploadId);
      },
    };
    return createUploadClient({
      engine,
      queueStore: queueStoreRef.current,
      autoStart: false,
    });
  }, []);

  const clearUploadQueue = React.useCallback(async () => {
    for (const handle of uploadClient.listQueue()) {
      uploadClient.remove(handle.id);
    }
    await queueStoreRef.current.clear();
    setPendingUploads([]);
    setUploadEvents([]);
    setHasUploadSelection(false);
    setIsUploadOpen(false);
  }, [uploadClient]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onAuthLogout = () => {
      setAuthTokenState(null);
      setAuthUser(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("league_user");
      }
      void clearUploadQueue();
    };
    window.addEventListener("auth:logout", onAuthLogout as EventListener);
    return () => {
      window.removeEventListener("auth:logout", onAuthLogout as EventListener);
    };
  }, [clearUploadQueue]);

  const syncPendingUploads = React.useCallback(() => {
    const handles = uploadClient
      .listQueue()
      .filter((handle) => !["completed", "canceled"].includes(handle.status));
    setPendingUploads(
      handles.map((handle) => ({
        id: handle.id,
        status: handle.status,
        name: handle.init.file.name,
        progress: {
          sent: handle.progress.bytesSent,
          total: handle.progress.totalBytes,
        },
      }))
    );
    if (handles.length > 0) {
      setIsUploadOpen(true);
    }
  }, [uploadClient]);

  const handleUploadCompleted = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["documents", "demo"] });
    syncPendingUploads();
    if (!uploadClient.listQueue().length) {
      setIsUploadOpen(false);
    }
  }, [queryClient, syncPendingUploads, uploadClient]);

  React.useEffect(() => {
    let active = true;
    setRestoreState({ status: "restoring", count: 0 });
    uploadClient
      .restoreQueue()
      .then((handles) => {
        if (!active) {
          return;
        }
        setRestoreState({
          status: "restored",
          count: handles.length,
        });
        setUploadEvents((prev) =>
          prev.filter((event) => event.status !== "completed")
        );
        syncPendingUploads();
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setRestoreState({ status: "failed", count: 0 });
      });
    return () => {
      active = false;
    };
  }, [uploadClient, syncPendingUploads]);

  React.useEffect(() => {
    if (authUser?.role === "AGENT") {
      setStatusFilter("ACTIVE");
    } else {
      setStatusFilter("ALL");
    }
  }, [authUser?.role]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  const selectedMetadata = React.useMemo(() => {
    if (!selected) {
      return null;
    }
    return {
      title: selected.title,
      categories: selected.categories,
      tags: selected.tags,
      entityLinks: selected.entityLinks,
      docDate: selected.docDate,
      notes: selected.notes,
    };
  }, [selected]);

  const updateDocument = async (
    docId: string,
    next: Metadata
  ): Promise<DocumentRef> => {
    const response = await apiFetch(`/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: next.title,
        categories: next.categories,
        tags: next.tags,
        notes: next.notes,
        docDate: next.docDate,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to update metadata");
    }
    return (await response.json()) as DocumentRef;
  };

  const snapshotDocumentsQueries = React.useCallback(() => {
    return queryClient
      .getQueryCache()
      .findAll({ queryKey: ["documents", "demo"] })
      .map((query) => ({
        key: query.queryKey,
        data: query.state.data,
      }));
  }, [queryClient]);

  const restoreDocumentsSnapshot = React.useCallback(
    (snapshot: Array<{ key: readonly unknown[]; data: unknown }>) => {
      snapshot.forEach(({ key, data }) => {
        queryClient.setQueryData(key, data);
      });
    },
    [queryClient]
  );

  const updateDocumentsQueryCaches = React.useCallback(
    (
      updater: (
        data: {
          pages: Array<{ items: DocumentRef[]; nextCursor?: string }>;
          pageParams: unknown[];
        },
        key: readonly unknown[]
      ) => {
        pages: Array<{ items: DocumentRef[]; nextCursor?: string }>;
        pageParams: unknown[];
      }
    ) => {
      const queries = queryClient
        .getQueryCache()
        .findAll({ queryKey: ["documents", "demo"] });
      queries.forEach((query) => {
        const data = query.state.data as
          | { pages: Array<{ items: DocumentRef[]; nextCursor?: string }>; pageParams: unknown[] }
          | undefined;
        if (!data) {
          return;
        }
        const next = updater(data, query.queryKey as readonly unknown[]);
        if (next !== data) {
          queryClient.setQueryData(query.queryKey, next);
        }
      });
    },
    [queryClient]
  );

  const mapDocumentsInPages = React.useCallback(
    (
      data: {
        pages: Array<{ items: DocumentRef[]; nextCursor?: string }>;
        pageParams: unknown[];
      },
      updater: (doc: DocumentRef) => DocumentRef | null
    ) => {
      let changed = false;
      const pages = data.pages.map((page) => {
        let itemsChanged = false;
        const nextItems = page.items.reduce<DocumentRef[]>((acc, doc) => {
          const updated = updater(doc);
          if (updated === null) {
            changed = true;
            itemsChanged = true;
            return acc;
          }
          if (updated !== doc) {
            changed = true;
            itemsChanged = true;
            acc.push(updated);
            return acc;
          }
          acc.push(doc);
          return acc;
        }, []);
        return itemsChanged ? { ...page, items: nextItems } : page;
      });
      return changed ? { ...data, pages } : data;
    },
    []
  );

  const isDeletedQueryKey = React.useCallback((key: readonly unknown[]) => {
    const status = key[key.length - 1];
    return status === "DELETED";
  }, []);

  const matchesDocumentsQuery = React.useCallback(
    (doc: DocumentRef, key: readonly unknown[]) => {
      const searchValue = String(key[2] ?? "").trim().toLowerCase();
      if (searchValue) {
        const titleMatch = doc.title?.toLowerCase().includes(searchValue);
        const tagMatch = (doc.tags ?? []).some((tag) =>
          tag.toLowerCase().includes(searchValue)
        );
        if (!titleMatch && !tagMatch) {
          return false;
        }
      }

      const ownerValue = String(key[3] ?? "").trim().toLowerCase();
      if (ownerValue) {
        const ownerEmail = (doc.ownerEmail ?? "").toLowerCase();
        if (!ownerEmail.includes(ownerValue)) {
          return false;
        }
      }

      const statusValue = String(key[key.length - 1] ?? "ALL");
      if (statusValue === "DELETED") {
        return Boolean(doc.deletedAt);
      }
      if (doc.deletedAt) {
        return false;
      }
      if (statusValue !== "ALL") {
        return doc.status === statusValue;
      }
      return true;
    },
    []
  );

  const insertDocumentIntoQueries = React.useCallback(
    (doc: DocumentRef) => {
      const queries = queryClient
        .getQueryCache()
        .findAll({ queryKey: ["documents", "demo"] });
      queries.forEach((query) => {
        const data = query.state.data as
          | {
              pages: Array<{ items: DocumentRef[]; nextCursor?: string }>;
              pageParams: unknown[];
            }
          | undefined;
        if (!data) {
          return;
        }
        const key = query.queryKey as readonly unknown[];
        if (!matchesDocumentsQuery(doc, key)) {
          return;
        }
        const alreadyPresent = data.pages.some((page) =>
          page.items.some((item) => item.id === doc.id)
        );
        if (alreadyPresent) {
          return;
        }
        const pages = [...data.pages];
        if (!pages.length) {
          pages.push({ items: [doc] });
        } else {
          const [first, ...rest] = pages;
          const nextItems = [doc, ...first.items].slice(0, 12);
          pages[0] = { ...first, items: nextItems };
          pages.splice(1, rest.length, ...rest);
        }
        queryClient.setQueryData(query.queryKey, { ...data, pages });
      });
    },
    [matchesDocumentsQuery, queryClient]
  );

  const findUploadHandle = React.useCallback(
    (id: string) => uploadClient.listQueue().find((item) => item.id === id),
    [uploadClient]
  );

  const removeUploadEvent = React.useCallback((id: string) => {
    setUploadEvents((prev) => prev.filter((event) => event.id !== id));
  }, []);

  const pauseUploadEvent = React.useCallback(
    (id: string) => {
      const handle = findUploadHandle(id);
      if (!handle) {
        return;
      }
      handle.pause();
    },
    [findUploadHandle]
  );

  const resumeUploadEvent = React.useCallback(
    (id: string) => {
      if (!phiConsent) {
        setPhiConsentError(true);
        return;
      }
      const handle = findUploadHandle(id);
      if (!handle) {
        return;
      }
      handle.resume();
    },
    [findUploadHandle, phiConsent]
  );

  const cancelUploadEvent = React.useCallback(
    (id: string) => {
      const handle = findUploadHandle(id);
      if (handle && handle.status !== "completed") {
        uploadClient.remove(id);
      }
      removeUploadEvent(id);
    },
    [findUploadHandle, removeUploadEvent, uploadClient]
  );

  const retryUploadEvent = React.useCallback(
    async (id: string) => {
      if (!phiConsent) {
        setPhiConsentError(true);
        return;
      }
      const handle = findUploadHandle(id);
      if (!handle) {
        return;
      }
      handle.retry();
      await uploadClient.startQueued();
    },
    [findUploadHandle, phiConsent, uploadClient]
  );

  const deleteDocument = React.useCallback(
    async (doc: DocumentRef) => {
      if (!window.confirm(`Delete "${doc.title}"? This can be restored later.`)) {
        return;
      }
      const snapshot = snapshotDocumentsQueries();
      const deletedAt = new Date().toISOString();
      updateDocumentsQueryCaches((data, key) => {
        const showDeletedForKey = isDeletedQueryKey(key);
        return mapDocumentsInPages(data, (item) => {
          if (item.id !== doc.id) {
            return item;
          }
          const updated = { ...item, deletedAt };
          return showDeletedForKey ? updated : null;
        });
      });
      if (selected?.id === doc.id) {
        setSelected((prev) => (prev ? { ...prev, deletedAt } : prev));
      }
      try {
        const response = await apiFetch(`/documents/${doc.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Failed to delete document");
        }
        await queryClient.invalidateQueries({ queryKey: ["documents", "demo"] });
      } catch (error) {
        restoreDocumentsSnapshot(snapshot);
        throw error;
      }
    },
    [
      mapDocumentsInPages,
      queryClient,
      restoreDocumentsSnapshot,
      selected,
      snapshotDocumentsQueries,
      updateDocumentsQueryCaches,
    ]
  );

  const markDocumentSigned = React.useCallback(
    async (doc: DocumentRef) => {
      if (!window.confirm(`Mark "${doc.title}" as signed?`)) {
        return;
      }
      const snapshot = snapshotDocumentsQueries();
      updateDocumentsQueryCaches((data) =>
        mapDocumentsInPages(data, (item) =>
          item.id === doc.id ? { ...item, status: "SIGNED" } : item
        )
      );
      if (selected?.id === doc.id) {
        setSelected((prev) => (prev ? { ...prev, status: "SIGNED" } : prev));
      }
      try {
        const response = await apiFetch(`/documents/${doc.id}/signed`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("Failed to mark document signed");
        }
        const updated = (await response.json()) as DocumentRef;
        if (selected?.id === doc.id) {
          setSelected(updated);
        }
        await queryClient.invalidateQueries({ queryKey: ["documents", "demo"] });
      } catch (error) {
        restoreDocumentsSnapshot(snapshot);
        throw error;
      }
    },
    [
      mapDocumentsInPages,
      queryClient,
      restoreDocumentsSnapshot,
      selected,
      snapshotDocumentsQueries,
      updateDocumentsQueryCaches,
    ]
  );

  const restoreDocument = React.useCallback(
    async (doc: DocumentRef) => {
      const snapshot = snapshotDocumentsQueries();
      updateDocumentsQueryCaches((data, key) => {
        const showDeletedForKey = isDeletedQueryKey(key);
        return mapDocumentsInPages(data, (item) => {
          if (item.id !== doc.id) {
            return item;
          }
          if (showDeletedForKey) {
            return null;
          }
          return { ...item, deletedAt: null };
        });
      });
      if (selected?.id === doc.id) {
        setSelected((prev) => (prev ? { ...prev, deletedAt: null } : prev));
      }
      const restoredDoc = { ...doc, deletedAt: null };
      insertDocumentIntoQueries(restoredDoc);
      try {
        const response = await apiFetch(`/documents/${doc.id}/restore`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("Failed to restore document");
        }
        const updated = (await response.json()) as DocumentRef;
        if (selected?.id === doc.id) {
          setSelected(updated);
        }
        await queryClient.invalidateQueries({ queryKey: ["documents", "demo"] });
      } catch (error) {
        restoreDocumentsSnapshot(snapshot);
        throw error;
      }
    },
    [
      insertDocumentIntoQueries,
      isDeletedQueryKey,
      mapDocumentsInPages,
      queryClient,
      restoreDocumentsSnapshot,
      selected,
      snapshotDocumentsQueries,
      updateDocumentsQueryCaches,
    ]
  );

  const upsertUploadEvent = React.useCallback(
    (event: {
      id: string;
      status: string;
      error?: string;
      name?: string;
      progress?: { sent: number; total: number };
    }) => {
      setUploadEvents((prev) => {
        const index = prev.findIndex((item) => item.id === event.id);
        const merged = index >= 0 ? { ...prev[index], ...event } : { ...event };
        if (index >= 0) {
          const next = prev.filter((item) => item.id !== event.id);
          return [merged, ...next].slice(0, 6);
        }
        return [merged, ...prev].slice(0, 6);
      });
    },
    []
  );

  React.useEffect(() => {
    const unsubProgress = uploadClient.on("progress", (handle) => {
      upsertUploadEvent({
        id: handle.id,
        status: handle.status,
        name: handle.init.file.name,
        progress: {
          sent: handle.progress.bytesSent,
          total: handle.progress.totalBytes,
        },
      });
    });
    const unsubStatus = uploadClient.on("status", (handle) => {
      upsertUploadEvent({
        id: handle.id,
        status: handle.status,
        name: handle.init.file.name,
        progress: {
          sent: handle.progress.bytesSent,
          total: handle.progress.totalBytes,
        },
      });
      syncPendingUploads();
    });
    const unsubCompleted = uploadClient.on("completed", (handle) => {
      upsertUploadEvent({
        id: handle.id,
        status: "completed",
        name: handle.init.file.name,
        progress: {
          sent: handle.progress.bytesSent,
          total: handle.progress.totalBytes,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["documents", "demo"] });
      syncPendingUploads();
    });
    const unsubFailed = uploadClient.on("failed", (handle) => {
      upsertUploadEvent({
        id: handle.id,
        status: "failed",
        error: handle.error,
        name: handle.init.file.name,
        progress: {
          sent: handle.progress.bytesSent,
          total: handle.progress.totalBytes,
        },
      });
      syncPendingUploads();
    });
    return () => {
      unsubProgress();
      unsubStatus();
      unsubCompleted();
      unsubFailed();
    };
  }, [uploadClient, queryClient, syncPendingUploads, upsertUploadEvent]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isTyping) {
        return;
      }
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShowShortcuts(true);
      }
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "g") {
        setViewMode("grid");
      }
      if (event.key === "l") {
        setViewMode("list");
      }
      if (event.key === "Escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  React.useEffect(() => {
    if (!selected) {
      setSelectedPreviewUrl(null);
      setPreviewLoading(false);
      setIsPreviewOpen(false);
      setWatermarkText(null);
      return;
    }
    let active = true;
    if (selected.previewUrl) {
      setSelectedPreviewUrl(selected.previewUrl);
    }
    setPreviewLoading(true);
    const loadPreview = async () => {
      try {
        const watermarkParam =
          selected.status === "SIGNED" || authUser?.role === "AGENT" ? "on" : "off";
        const response = await apiFetch(
          `/documents/${selected.id}/preview-url?watermark=${watermarkParam}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch preview URL");
        }
        const data = (await response.json()) as { url: string };
        if (active) {
          setSelectedPreviewUrl(data.url);
          setPreviewLoading(false);
        }
      } catch {
        if (active) {
          if (!selected.previewUrl) {
            setSelectedPreviewUrl(null);
          }
          setPreviewLoading(false);
        }
      }
    };
    if (selected.status === "SIGNED") {
      const signerLabel =
        authUser?.role === "AGENT" ? authUser.email ?? "agent" : "agent";
      setWatermarkText(`Signed - ${signerLabel}`);
    } else if (authUser?.role === "AGENT") {
      const timestamp = new Date().toLocaleString("en-US", { hour12: false });
      setWatermarkText(
        `For Review - ${authUser.email ?? "agent"} - ${timestamp}`
      );
    } else {
      setWatermarkText(null);
    }
    void loadPreview();
    return () => {
      active = false;
    };
  }, [authUser?.email, authUser?.role, selected]);

  const hydratePreviewUrls = React.useCallback(
    async (items: DocumentRef[]) => {
      const candidates = items.filter(
        (doc) =>
          !doc.previewUrl &&
          (doc.mimeType.startsWith("image/") || doc.mimeType.includes("pdf"))
      );
      if (!candidates.length) {
        return items;
      }
      const previews = await Promise.all(
        candidates.map(async (doc) => {
          try {
            const watermarkParam = doc.status === "SIGNED" ? "on" : "off";
            const response = await apiFetch(
              `/documents/${doc.id}/preview-url?watermark=${watermarkParam}`
            );
            if (!response.ok) {
              return doc;
            }
            const data = (await response.json()) as { url: string };
            return { ...doc, previewUrl: data.url };
          } catch {
            return doc;
          }
        })
      );
      const previewMap = new Map(previews.map((doc) => [doc.id, doc.previewUrl]));
      return items.map((doc) =>
        previewMap.has(doc.id) ? { ...doc, previewUrl: previewMap.get(doc.id) } : doc
      );
    },
    []
  );

  const openLargePreview = React.useCallback((url: string, mimeType?: string) => {
    setImagePreviewUrl(url);
    setLargePreviewMimeType(mimeType ?? null);
    setIsImagePreviewOpen(true);
  }, []);

  if (!authToken) {
    return (
      <div
        className={css({
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "10",
          background: "surface",
        })}
      >
        <div
          className={css({
            width: "100%",
            maxWidth: "loginWidth",
            background: "surfaceAlt",
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "border",
            borderRadius: "xl",
            padding: "7",
            display: "grid",
            gap: "4",
            boxShadow: "card",
          })}
        >
          <h1 className={css({ margin: 0, fontSize: "xl" })}>
            Sign in to League Uploads
          </h1>
          <p className={css({ margin: 0, color: "muted", fontSize: "sm" })}>
            Sign in to continue.
          </p>
          <LoginForm onSubmit={handleLogin} error={authError} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={css({
        maxWidth: "containerLg",
        margin: "0 auto",
        padding: "8 6 16",
        display: "grid",
        gap: "7",
      })}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "7",
          alignItems: "start",
        })}
      >
        <div className={css({ display: "grid", gap: "6" })}>
          <div
            className={css({
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "4",
              flexWrap: "wrap",
            })}
          >
            <p
              className={css({
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                fontSize: "xs",
                fontWeight: "600",
                color: "accent",
                margin: 0,
              })}
            >
              League Upload Management
            </p>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "3",
                fontSize: "xs",
                color: "muted",
              })}
            >
              <span>
                {authUser?.email ?? "Signed in"} - {authUser?.role ?? "USER"}
              </span>
              <button
                type="button"
                className={css({
                  borderRadius: "full",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  padding: "2 7",
                  fontSize: "xs",
                  background: "highlight",
                  cursor: "pointer",
                })}
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </div>
          <h1
            className={css({
              fontSize: "hero",
              margin: 0,
              marginBottom: "3",
            })}
          >
            Unified documents for claims and profiles.
          </h1>
          <p
            className={css({
              fontSize: "lg",
              lineHeight: "1.6",
              color: "muted",
              maxWidth: "copyWidth",
            })}
          >
            Upload, tag, and track sensitive documents with resumable uploads
            and role-aware controls.
          </p>
          <button
            type="button"
            className={css({
              marginTop: "3",
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              padding: "2 7",
              fontSize: "xs",
              background: "highlight",
              cursor: "pointer",
            })}
            onClick={() => setShowShortcuts(true)}
          >
            Keyboard shortcuts
          </button>
          {authUser?.role === "USER" ? (
            <details
              open={isUploadOpen}
              onToggle={(event) =>
                setIsUploadOpen((event.target as HTMLDetailsElement).open)
              }
              className={css({
                background: "surface",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
                borderRadius: "xl",
                padding: "5",
                boxShadow: "card",
              })}
            >
            <summary
              className={css({
                listStyle: "none",
                margin: 0,
                padding: 0,
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "md",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "2",
                paddingBottom: "1",
                _marker: { display: "none" },
              })}
            >
              Upload documents
              <span
                className={css({
                  borderRadius: "full",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  padding: "2 7",
                  fontSize: "xs",
                  background: "highlight",
                })}
              >
                {isUploadOpen ? "Hide" : "Show"}
              </span>
            </summary>
            <div className={css({ marginTop: "2", display: "grid", gap: "4" })}>
              <div
                className={css({
                  display: "grid",
                  gap: "2",
                  borderRadius: "lg",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: phiConsentError ? "errorBorder" : "border",
                  padding: "3 4",
                  background: "surfaceAlt",
                })}
              >
                <p className={css({ margin: 0, fontSize: "sm" })}>
                  PHI notice: Uploads may contain protected health information.
                  Only upload documents you are authorized to share.
                </p>
                {!phiConsent ? (
                  <div className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
                    <button
                      type="button"
                      className={smallButtonClass}
                      onClick={() => {
                        setPhiConsent(true);
                        setPhiConsentError(false);
                        sessionStorage.setItem("phiConsent", "true");
                      }}
                    >
                      I understand and consent
                    </button>
                    {phiConsentError ? (
                      <span className={css({ fontSize: "xs", color: "errorText" })}>
                        Consent required before uploading.
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className={css({ fontSize: "xs", color: "muted" })}>
                    Consent recorded for this session.
                  </span>
                )}
              </div>
              <UploaderWidget
                maxSizeMB={200}
                maxFiles={50}
                accept={{
                  "application/pdf": [".pdf"],
                  "image/*": [".jpg", ".jpeg", ".png", ".heic"],
                }}
                defaultCategory="RECEIPT"
                getContext={() => ({
                  entityLinks: [{ type: "PROFILE", id: "member_123" }],
                  source: "PROFILE",
                })}
                getMetadata={() => metadata}
                onCompleted={handleUploadCompleted}
                client={uploadClient}
                onQueueChange={({ hasFiles }) => setHasUploadSelection(hasFiles)}
              />
              {uploadActivityItems.length ? (
                <div className={css({ marginTop: "4", display: "grid", gap: "3" })}>
                  <h3 className={css({ margin: 0, fontSize: "lg" })}>
                    Upload activity
                  </h3>
                  <ul
                    className={css({
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "grid",
                      gap: "3",
                    })}
                    aria-live="polite"
                  >
                    {uploadActivityItems.map(
  (event) => (
    <li
      key={event.id}
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "2",
        padding: "2 5",
        borderRadius: "md",
        background: "surfaceAlt",
        borderWidth: "thin",
        borderStyle: "solid",
        borderColor: "border",
      })}
    >
      <div
        className={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "3",
        })}
      >
        <div className={css({ fontFamily: "mono", fontSize: "xs" })}>
          {event.name ?? event.id}
        </div>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2",
          })}
        >
          <span
            className={css({
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              padding: "1 5",
              fontSize: "xs",
              background:
                event.status === "failed"
                  ? "errorBg"
                  : event.status === "completed"
                  ? "successBg"
                  : "infoBg",
            })}
          >
            {event.status}
          </span>
          {event.status === "uploading" ? (
            <button
              type="button"
              className={smallButtonClass}
              title="Pause upload"
              aria-label="Pause upload"
              onClick={() => pauseUploadEvent(event.id)}
            >
              ||
            </button>
          ) : null}
          {event.status === "paused" ? (
            <button
              type="button"
              className={smallButtonClass}
              title="Resume upload"
              aria-label="Resume upload"
              onClick={() => resumeUploadEvent(event.id)}
            >
              &gt;
            </button>
          ) : null}
          {event.status === "failed" ? (
            <button
              type="button"
              className={smallButtonClass}
              onClick={() => void retryUploadEvent(event.id)}
            >
              Retry
            </button>
          ) : null}
          {event.status ? (
            <button
              type="button"
              className={smallButtonClass}
              title="Delete upload"
              aria-label="Delete upload"
              onClick={() => cancelUploadEvent(event.id)}
            >
              X
            </button>
          ) : null}
        </div>
      </div>
      {event.progress?.total ? (
        <div
          className={css({
            height: "1",
            width: "full",
            background: "highlight",
            borderRadius: "full",
            overflow: "hidden",
          })}
        >
          <div
            className={css({
              height: "full",
              background: "accent",
              width: `${Math.min(
                100,
                Math.round((event.progress.sent / event.progress.total) * 100)
              )}%`,
              transition: "width 0.2s ease",
            })}
          />
        </div>
      ) : null}
      {event.error ? (
        <p
          className={css({
            margin: 0,
            fontSize: "xs",
            color: "errorText",
          })}
        >
          {event.error}
        </p>
      ) : null}
    </li>
  )
)}
</ul>
                  {uploadActivityItems.some((event) => event.status === "failed") ? (
                    <button
                      type="button"
                      className={css({
                        borderRadius: "full",
                        borderWidth: "thin",
                        borderStyle: "solid",
                        borderColor: "border",
                        padding: "2 5",
                        background: "accent",
                        color: "surface",
                        fontSize: "xs",
                        fontWeight: "600",
                        cursor: "pointer",
                      })}
                      onClick={() => {
                        if (!phiConsent) {
                          setPhiConsentError(true);
                          return;
                        }
                        uploadClient.retryAll();
                      }}
                    >
                      Retry all failed
                    </button>
                  ) : null}
                </div>
              ) : null}
              {hasUploadSelection || pendingUploads.length ? (
                <button
                  type="button"
                  className={css({
                    borderRadius: "full",
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: "border",
                    padding: "2 5",
                    background: "accent",
                    color: "surface",
                    fontSize: "sm",
                    fontWeight: "600",
                    cursor: "pointer",
                    justifySelf: "start",
                  })}
                  onClick={async () => {
                    if (!phiConsent) {
                      setPhiConsentError(true);
                      return;
                    }
                    await uploadClient.startQueued();
                  }}
                >
                  Save & upload all
                </button>
              ) : null}
            </div>
            </details>
          ) : null}
        </div>
      </header>
      <main
        id="main"
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "6",
        })}
      >
        <section
          className={css({
            background: "surface",
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "border",
            borderRadius: "xl",
            padding: "6",
            boxShadow: "card",
            display: "grid",
            gap: "6",
          })}
        >
          <div
            className={css({
              display: "flex",
              gap: "3",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            })}
          >
            <h2 className={css({ margin: 0 })}>Documents</h2>
            <span className={visuallyHidden} role="status" aria-live="polite">
              Queue: {restoreState.status}
              {restoreState.status === "restored"
                ? ` (${restoreState.count})`
                : ""}
              {uploadEvents.length
                ? ` Last upload: ${uploadEvents[0].id} ${uploadEvents[0].status}`
                : " No uploads yet"}
            </span>
          </div>
          <div className={css({ display: "grid", gap: "4" })}>
            <div className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
              <label className={visuallyHidden} htmlFor="doc-search">
                Search documents
              </label>
              <input
                id="doc-search"
                ref={searchRef}
                className={css({
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  borderRadius: "sm",
                  padding: "3 7",
                  fontSize: "sm",
                  minWidth: "searchMin",
                })}
                placeholder="Search by title or tag"
                value={search}
                onChange={(event) => {
                  if (event.target.value.length > 120) {
                    return;
                  }
                  setSearch(event.target.value);
                }}
              />
              {authUser?.role === "AGENT" ? (
                <>
                  <label className={visuallyHidden} htmlFor="doc-owner-filter">
                    Filter by uploader
                  </label>
                  <input
                    id="doc-owner-filter"
                    className={css({
                      borderWidth: "thin",
                      borderStyle: "solid",
                      borderColor: "border",
                      borderRadius: "sm",
                      padding: "3 7",
                      fontSize: "sm",
                      minWidth: "searchMin",
                    })}
                    placeholder="Filter by uploader email"
                    value={ownerFilter}
                    onChange={(event) => setOwnerFilter(event.target.value)}
                  />
                </>
              ) : null}
              <label className={visuallyHidden} htmlFor="doc-status-filter">
                Filter by status
              </label>
              <select
                id="doc-status-filter"
                className={css({
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  borderRadius: "sm",
                  padding: "3 7",
                  fontSize: "sm",
                })}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as "ALL" | "ACTIVE" | "SIGNED" | "DELETED"
                  )
                }
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SIGNED">Signed</option>
                {authUser?.role === "AGENT" ? (
                  <option value="DELETED">Deleted</option>
                ) : null}
              </select>
              <div className={css({ display: "flex", gap: "2" })}>
                <button
                  className={css({
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: "border",
                    borderRadius: "full",
                    padding: "2 7",
                    fontSize: "xs",
                    background: viewMode === "grid" ? "highlight" : "transparent",
                  })}
                  type="button"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </button>
                <button
                  className={css({
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: "border",
                    borderRadius: "full",
                    padding: "2 7",
                    fontSize: "xs",
                    background: viewMode === "list" ? "highlight" : "transparent",
                  })}
                  type="button"
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
              </div>
            </div>
          </div>
          <div
            className={css({
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "6",
              alignItems: "start",
            })}
          >
            <div className={css({ display: "grid", gap: "4" })}>
              <DocumentGalleryQuery
                query={{
                  queryKey: ["documents", "demo", debouncedSearch, ownerFilter, statusFilter],
                  queryFn: async ({ pageParam }) => {
                    const params = new URLSearchParams();
                    if (pageParam) {
                      params.set("cursor", String(pageParam));
                    }
                    if (debouncedSearch) {
                      params.set("q", debouncedSearch);
                    }
                    if (authUser?.role === "AGENT" && ownerFilter.trim()) {
                      params.set("ownerEmail", ownerFilter.trim());
                    }
                    if (authUser?.role === "AGENT" && statusFilter === "DELETED") {
                      params.set("deleted", "only");
                    } else if (statusFilter !== "ALL") {
                      params.set("status", statusFilter);
                    }
                    params.set("limit", "12");
                    const response = await apiFetch(`/documents?${params.toString()}`, {
                      headers: {
                        "x-fail-documents": failDocuments ? "1" : "0",
                      },
                    });
                    if (!response.ok) {
                      throw new Error("Failed to fetch documents");
                    }
                    const payload = (await response.json()) as {
                      items: DocumentRef[];
                      nextCursor?: string;
                    };
                    const items = await hydratePreviewUrls(payload.items);
                    return { ...payload, items };
                  },
                  getNextPageParam: (last) =>
                    last.nextCursor ? last.nextCursor : undefined,
                }}
                onOpen={(doc) => {
                  setSelected(doc);
                  setIsPreviewOpen(true);
                }}
                onDelete={deleteDocument}
                onMarkSigned={
                  authUser?.role === "AGENT" ? markDocumentSigned : undefined
                }
                onRestore={
                  authUser?.role === "AGENT" ? restoreDocument : undefined
                }
                showOwner={authUser?.role === "AGENT"}
                view={viewMode}
              />
            </div>
          </div>
        </section>
      </main>
      {selected && isPreviewOpen ? (
        <div
          className={css({
            position: "fixed",
            inset: 0,
            background: "overlay",
            display: "grid",
            placeItems: "center",
            padding: "6",
            zIndex: 1100,
          })}
          role="presentation"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className={css({
              background: "surface",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              borderRadius: "xl",
              padding: "5",
              width: "100%",
              maxWidth: "modalWidth",
              maxHeight: "85vh",
              boxShadow: "card",
              display: "grid",
              gap: "3",
              overflowY: "auto",
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={css({ display: "flex", justifyContent: "space-between" })}>
              <h2 id="preview-title" className={css({ margin: 0, fontSize: "xl" })}>
                Preview
              </h2>
              <button
                type="button"
                className={css({
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  borderRadius: "full",
                  padding: "2 6",
                  background: "highlight",
                  cursor: "pointer",
                  fontSize: "xs",
                })}
                onClick={() => setIsPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "3",
                flexWrap: "wrap",
              })}
            >
              <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
                <span
                  className={css({
                    borderRadius: "full",
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: "border",
                    padding: "1 5",
                    fontSize: "xs",
                    background: "highlight",
                  })}
                >
                  {selected.mimeType}
                </span>
                <span
                  className={css({
                    borderRadius: "full",
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: "border",
                    padding: "1 5",
                    fontSize: "xs",
                    background:
                      selected.status === "SIGNED" ? "successBg" : "highlight",
                  })}
                >
                  {selected.status}
                </span>
              </div>
              {authUser?.role === "AGENT" && selected.status !== "SIGNED" ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={() => void markDocumentSigned(selected)}
                >
                  Mark signed
                </button>
              ) : null}
            </div>
            {previewLoading ? (
              <div
                className={css({
                  height: "viewerHeight",
                  borderRadius: "lg",
                  background: "highlight",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                })}
                role="status"
                aria-live="polite"
              />
            ) : (
              <DocumentViewer
                document={{
                  ...selected,
                  previewUrl: selectedPreviewUrl ?? undefined,
                }}
                showWatermark={
                  authUser?.role === "AGENT" || selected.status === "SIGNED"
                }
                watermarkText={watermarkText ?? undefined}
                showOwner={authUser?.role === "AGENT"}
                onPreviewClick={(url, mimeType) => openLargePreview(url, mimeType)}
              />
            )}
            {selectedMetadata && selected.acl?.canEdit ? (
              <MetadataForm
                value={selectedMetadata}
                allowEntityLinkEdit={false}
                onSubmit={async (next) => {
                  const updated = await updateDocument(selected.id, next);
                  setSelected(updated);
                  await queryClient.invalidateQueries({
                    queryKey: ["documents", "demo"],
                  });
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {isImagePreviewOpen && imagePreviewUrl ? (
        <div
          className={css({
            position: "fixed",
            inset: 0,
            background: "overlay",
            display: "grid",
            placeItems: "center",
            padding: "6",
            zIndex: 1300,
          })}
          role="presentation"
          onClick={() => setIsImagePreviewOpen(false)}
        >
          <div
            className={css({
              background: "surface",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              borderRadius: "xl",
              padding: "4",
              maxWidth: "90vw",
              maxHeight: "90vh",
              boxShadow: "card",
              display: "grid",
              gap: "3",
            })}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={css({ display: "flex", justifyContent: "flex-end" })}>
              <button
                type="button"
                className={css({
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  borderRadius: "full",
                  padding: "2 6",
                  background: "highlight",
                  cursor: "pointer",
                  fontSize: "xs",
                })}
                onClick={() => setIsImagePreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <div
              className={css({
                maxHeight: "80vh",
                overflow: "auto",
              })}
            >
              {largePreviewMimeType?.includes("pdf") ? (
                <object
                  data={imagePreviewUrl}
                  type="application/pdf"
                  aria-label="Large PDF preview"
                  className={css({
                    display: "block",
                    width: "95vw",
                    height: "90vh",
                    borderRadius: "lg",
                    background: "highlight",
                    borderWidth: "thin",
                    borderStyle: "solid",
                    borderColor: "border",
                  })}
                >
                  <p>PDF preview unavailable.</p>
                </object>
              ) : (
                <div
                  className={css({
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                  })}
                >
                  <img
                    src={imagePreviewUrl}
                    alt="Large preview"
                    className={css({
                      display: "block",
                      maxWidth: "100%",
                      maxHeight: "80vh",
                      margin: "0 auto",
                      borderRadius: "lg",
                    })}
                  />
                  {watermarkText ? (
                    <div
                      className={css({
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        padding: "6",
                        pointerEvents: "none",
                      })}
                    >
                      <div
                        className={css({
                          color: "rgba(95, 63, 33, 0.45)",
                          fontSize: "sm",
                          textAlign: "center",
                        })}
                      >
                        {watermarkText}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {showShortcuts ? (
        <div
          className={css({
            position: "fixed",
            inset: 0,
            background: "overlay",
            display: "grid",
            placeItems: "center",
            padding: "6",
            zIndex: 1000,
          })}
          role="presentation"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className={css({
              background: "surface",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              borderRadius: "xl",
              padding: "5",
              width: "100%",
              maxWidth: "modalWidth",
              boxShadow: "card",
              display: "grid",
              gap: "3",
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={css({ display: "flex", justifyContent: "space-between" })}>
              <h2 id="shortcuts-title" className={css({ margin: 0, fontSize: "xl" })}>
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                className={css({
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  borderRadius: "full",
                  padding: "1 3",
                  background: "highlight",
                  cursor: "pointer",
                  fontSize: "xs",
                })}
                onClick={() => setShowShortcuts(false)}
              >
                Close
              </button>
            </div>
            <ul
              className={css({
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "2",
                fontSize: "sm",
              })}
            >
              <li>
                <strong>?</strong> Open shortcuts
              </li>
              <li>
                <strong>/</strong> Focus search
              </li>
              <li>
                <strong>g</strong> Grid view
              </li>
              <li>
                <strong>l</strong> List view
              </li>
              <li>
                <strong>Esc</strong> Close dialogs
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const LoginForm: React.FC<{
  onSubmit: (payload: {
    email: string;
    password: string;
  }) => void;
  error: string | null;
}> = ({ onSubmit, error }) => {
  const [email, setEmail] = React.useState("user@test.com");
  const [password, setPassword] = React.useState("123456");
  return (
    <form
      className={css({ display: "grid", gap: "3" })}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ email, password });
      }}
    >
      <label className={css({ display: "grid", gap: "1", fontSize: "sm" })}>
        Email
          <input
            className={css({
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              borderRadius: "sm",
              padding: "2 5",
              fontSize: "sm",
            })}
            type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className={css({ display: "grid", gap: "1", fontSize: "sm" })}>
        Password
        <input
          className={css({
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "border",
            borderRadius: "sm",
            padding: "2 5",
            fontSize: "sm",
          })}
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error ? (
        <p className={css({ margin: 0, color: "errorText", fontSize: "xs" })}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className={css({
          borderRadius: "full",
          borderWidth: "thin",
          borderStyle: "solid",
          borderColor: "border",
          padding: "2 5",
          background: "accent",
          color: "surface",
          fontSize: "sm",
          fontWeight: "600",
          cursor: "pointer",
        })}
      >
        Sign in
      </button>
    </form>
  );
};








