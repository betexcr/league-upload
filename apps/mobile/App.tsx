import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Buffer } from "buffer";
import {
  createMultipartEngine,
  createUploadClient,
  type UploadHandle,
  type UploadInit,
} from "@league/upload-core";
import type { DocumentRef, Metadata } from "@league/types";
import { DocCategory } from "@league/types";
import { createApiFetch, createApiUploadTransport } from "@league/app-client";
import { createFileSystemChunkReader } from "./src/fileChunkReader";
import { createAsyncStorageQueueStore } from "./src/queueStore";
import { colors, fonts, radii, spacing } from "./src/theme";

declare const global: typeof globalThis;
const globalAny = global as typeof globalThis & { Buffer?: typeof Buffer };
if (!globalAny.Buffer) {
  globalAny.Buffer = Buffer;
}

const defaultBaseUrl = "http://localhost:8080/v1";
const getApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl;
  }
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8080/v1";
  }
  return defaultBaseUrl;
};

const normalizePreviewUrl = (url: string): string => {
  const base = getApiBaseUrl().replace(/\/v1\/?$/, "");
  if (url.startsWith("http://localhost:8080")) {
    return url.replace("http://localhost:8080", base);
  }
  if (url.startsWith("http://127.0.0.1:8080")) {
    return url.replace("http://127.0.0.1:8080", base);
  }
  return url;
};

const TOKEN_KEY = "league_token";

const queryClient = new QueryClient();

const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const buildDocDate = (value: string) =>
  value ? `${value}T00:00:00.000Z` : undefined;

const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
};

const UploadStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const background =
    status === "failed"
      ? "#f6d7d7"
      : status === "completed"
      ? "#daf5e5"
      : "#e4effb";
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
};

const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
  </View>
);

const PrimaryButton: React.FC<
  React.PropsWithChildren<{ onPress: () => void; disabled?: boolean }>
> = ({ children, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.primaryButton,
      pressed && styles.primaryButtonPressed,
      disabled && styles.primaryButtonDisabled,
    ]}
  >
    <Text style={styles.primaryButtonText}>{children}</Text>
  </Pressable>
);

const OutlineButton: React.FC<
  React.PropsWithChildren<{ onPress: () => void; disabled?: boolean }>
> = ({ children, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.outlineButton,
      pressed && styles.outlineButtonPressed,
      disabled && styles.outlineButtonDisabled,
    ]}
  >
    <Text style={styles.outlineButtonText}>{children}</Text>
  </Pressable>
);

const Chip: React.FC<
  React.PropsWithChildren<{ selected?: boolean; onPress?: () => void }>
> = ({ children, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.chip,
      selected ? styles.chipSelected : styles.chipUnselected,
    ]}
  >
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
      {children}
    </Text>
  </Pressable>
);

const AppShell: React.FC = () => {
  const queryClient = useQueryClient();
  const [authToken, setAuthToken] = React.useState<string | null>(null);
  const authTokenRef = React.useRef<string | null>(null);
  const [authUser, setAuthUser] = React.useState<{
    email: string;
    role: "USER" | "AGENT";
  } | null>(null);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "ALL" | "ACTIVE" | "SIGNED" | "DELETED"
  >("ALL");
  const [selected, setSelected] = React.useState<DocumentRef | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = React.useState<string | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewAspectRatio, setPreviewAspectRatio] = React.useState<number | null>(
    null
  );
  const [watermarkText, setWatermarkText] = React.useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [uploadEvents, setUploadEvents] = React.useState<
    Array<{
      id: string;
      status: string;
      error?: string;
      name?: string;
      progress?: { sent: number; total: number };
    }>
  >([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [queueHandles, setQueueHandles] = React.useState<UploadHandle[]>([]);
  const [queueTick, setQueueTick] = React.useState(0);
  const [restoreState, setRestoreState] = React.useState<{
    status: "idle" | "restoring" | "restored" | "failed";
    count: number;
  }>({ status: "idle", count: 0 });

  const [title, setTitle] = React.useState("2024-02 Prescription");
  const [category, setCategory] =
    React.useState<Metadata["categories"][number]>("PRESCRIPTION");
  const [tagsInput, setTagsInput] = React.useState("rx");
  const [entityType, setEntityType] =
    React.useState<Metadata["entityLinks"][number]["type"]>("CLAIM");
  const [entityId, setEntityId] = React.useState("claim_123");
  const [docDateInput, setDocDateInput] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = React.useState("Member uploaded from mobile.");

  const [editTitle, setEditTitle] = React.useState("");
  const [editCategory, setEditCategory] =
    React.useState<Metadata["categories"][number]>("OTHER");
  const [editTagsInput, setEditTagsInput] = React.useState("");
  const [editDocDateInput, setEditDocDateInput] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [phiConsent, setPhiConsent] = React.useState(false);
  const [phiConsentError, setPhiConsentError] = React.useState(false);
  const uploadActivityItems = React.useMemo(() => {
    if (uploadEvents.length) {
      return uploadEvents;
    }
    return queueHandles.map((handle) => ({
      id: handle.id,
      status: handle.status,
      error: handle.error,
      name: handle.init.file.name,
      progress: {
        sent: handle.progress.bytesSent,
        total: handle.progress.totalBytes,
      },
    }));
  }, [queueHandles, uploadEvents]);

  const handleLogout = React.useCallback(async () => {
    authTokenRef.current = null;
    setAuthToken(null);
    setAuthUser(null);
    setSelected(null);
    setSelectedPreviewUrl(null);
    setWatermarkText(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem("league_user");
    await queryClient.clear();
  }, [queryClient]);

  const apiFetch = React.useMemo(
    () =>
      createApiFetch({
        getBaseUrl: getApiBaseUrl,
        getAuthToken: () => authTokenRef.current,
        onUnauthorized: () => {
          void handleLogout();
        },
      }),
    [handleLogout]
  );

  const uploadClient = React.useMemo(() => {
    const transport = createApiUploadTransport({ apiFetch });
    const readChunk = createFileSystemChunkReader();
    const engine = createMultipartEngine({ transport, readChunk });
    return createUploadClient({
      engine,
      queueStore: createAsyncStorageQueueStore(),
      autoStart: false,
    });
  }, [apiFetch]);

  React.useEffect(() => {
    void (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem("league_user");
      authTokenRef.current = token;
      setAuthToken(token);
      if (storedUser) {
        try {
          setAuthUser(JSON.parse(storedUser) as { email: string; role: "USER" | "AGENT" });
        } catch {
          setAuthUser(null);
        }
      }
    })();
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(handle);
  }, [search]);

  React.useEffect(() => {
    let active = true;
    setRestoreState({ status: "restoring", count: 0 });
    uploadClient
      .restoreQueue()
      .then((handles) => {
        if (!active) {
          return;
        }
        setQueueHandles(handles);
        setRestoreState({ status: "restored", count: handles.length });
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
  }, [uploadClient]);

  React.useEffect(() => {
    const recordEvent = (status: string, handle: UploadHandle) => {
      setUploadEvents((prev) => {
        const existingIndex = prev.findIndex((event) => event.id === handle.id);
        const nextEvent = {
          id: handle.id,
          status,
          error: handle.error,
          name: handle.init.file.name,
          progress: {
            sent: handle.progress.bytesSent,
            total: handle.progress.totalBytes,
          },
        };
        if (existingIndex === -1) {
          return [nextEvent, ...prev].slice(0, 6);
        }
        const next = [...prev];
        next[existingIndex] = nextEvent;
        return next;
      });
    };
    const bumpQueue = () => setQueueTick((tick) => tick + 1);
    const unsubStatus = uploadClient.on("status", (handle) => {
      recordEvent(handle.status, handle);
      bumpQueue();
    });
    const unsubCompleted = uploadClient.on("completed", (handle) => {
      recordEvent("completed", handle);
      bumpQueue();
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    });
    const unsubFailed = uploadClient.on("failed", (handle) => {
      recordEvent("failed", handle);
      bumpQueue();
    });
    const unsubProgress = uploadClient.on("progress", bumpQueue);
    return () => {
      unsubStatus();
      unsubCompleted();
      unsubFailed();
      unsubProgress();
    };
  }, [uploadClient, queryClient]);

  React.useEffect(() => {
    if (authUser?.role === "AGENT") {
      setStatusFilter((current) => (current === "ALL" ? "ACTIVE" : current));
    }
  }, [authUser?.role]);

  React.useEffect(() => {
    if (!selected) {
      setSelectedPreviewUrl(null);
      setWatermarkText(null);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    const loadPreview = async () => {
      try {
        const watermarkParam =
          selected.status === "SIGNED" || authUser?.role === "AGENT" ? "on" : "off";
        const response = await apiFetch(
          `/documents/${selected.id}/preview-url?watermark=${watermarkParam}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch preview");
        }
        const data = (await response.json()) as { url: string };
        if (active) {
          setSelectedPreviewUrl(normalizePreviewUrl(data.url));
          setPreviewLoading(false);
        }
      } catch {
        if (active) {
          setSelectedPreviewUrl(null);
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
  }, [apiFetch, authUser?.email, authUser?.role, selected]);

  React.useEffect(() => {
    if (!selected) {
      return;
    }
    setEditTitle(selected.title);
    setEditCategory(selected.categories[0] ?? "OTHER");
    setEditTagsInput(selected.tags.join(", "));
    setEditDocDateInput(selected.docDate ? selected.docDate.slice(0, 10) : "");
    setEditNotes(selected.notes ?? "");
  }, [selected]);

  React.useEffect(() => {
    if (!selectedPreviewUrl || !selected?.mimeType.startsWith("image")) {
      setPreviewAspectRatio(null);
      return;
    }
    let active = true;
    Image.getSize(
      selectedPreviewUrl,
      (width, height) => {
        if (!active || width <= 0 || height <= 0) {
          return;
        }
        setPreviewAspectRatio(width / height);
      },
      () => {
        if (active) {
          setPreviewAspectRatio(null);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [selectedPreviewUrl, selected?.mimeType]);

  const handleLogin = async (payload: { email: string; password: string }) => {
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
    authTokenRef.current = data.accessToken;
    await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
    const nextUser = {
      email: data.user.email,
      role: data.user.role === "AGENT" ? "AGENT" : "USER",
    };
    setAuthToken(data.accessToken);
    setAuthUser(nextUser);
    await AsyncStorage.setItem("league_user", JSON.stringify(nextUser));
  };

  const listQuery = useInfiniteQuery({
    queryKey: ["documents", debouncedSearch, ownerFilter, statusFilter],
    queryFn: async ({ pageParam }) => {
      const params: string[] = [];
      if (pageParam) {
        params.push(`cursor=${encodeURIComponent(String(pageParam))}`);
      }
      if (debouncedSearch) {
        params.push(`q=${encodeURIComponent(debouncedSearch)}`);
      }
      if (authUser?.role === "AGENT" && ownerFilter.trim()) {
        params.push(`ownerEmail=${encodeURIComponent(ownerFilter.trim())}`);
      }
      if (authUser?.role === "AGENT" && statusFilter === "DELETED") {
        params.push("deleted=only");
      } else if (statusFilter !== "ALL") {
        params.push(`status=${encodeURIComponent(statusFilter)}`);
      }
      params.push("limit=12");
      const response = await apiFetch(`/documents?${params.join("&")}`);
      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }
      return (await response.json()) as {
        items: DocumentRef[];
        nextCursor?: string;
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const documents = listQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const handlePickFiles = async () => {
    setUploadError(null);
    if (!phiConsent) {
      setPhiConsentError(true);
      return;
    }
    setPhiConsentError(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) {
      return;
    }
    const assets = result.assets ?? [];
    if (!assets.length) {
      return;
    }
    if (assets.length > 50) {
      setUploadError("Max 50 files per batch.");
      return;
    }
    const uploads: UploadInit[] = [];
    const oversized: string[] = [];
    const maxSizeBytes = 200 * 1024 * 1024;
    for (const asset of assets) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      const size = asset.size ?? info.size ?? 0;
      if (size > maxSizeBytes) {
        oversized.push(asset.name ?? "file");
        continue;
      }
      const mimeType =
        asset.mimeType ??
        (asset.name?.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "image/jpeg");
      uploads.push({
        file: {
          name: asset.name ?? `upload-${Date.now()}`,
          size,
          type: mimeType,
          uri: asset.uri,
        },
        metadata: {
          title,
          categories: [category],
          tags: parseTags(tagsInput),
          entityLinks: entityId
            ? [{ type: entityType, id: entityId }]
            : [{ type: "PROFILE", id: "member_123" }],
          docDate: buildDocDate(docDateInput),
          notes: notes || undefined,
        },
        context: {
          entityLinks: entityId
            ? [{ type: entityType, id: entityId }]
            : [{ type: "PROFILE", id: "member_123" }],
          source: "PROFILE",
        },
      });
    }
    if (oversized.length) {
      setUploadError(
        `Some files exceed 200 MB: ${oversized.slice(0, 3).join(", ")}`
      );
      return;
    }
    if (!uploads.length) {
      return;
    }
    const handles = await uploadClient.enqueue(uploads);
    setQueueHandles((prev) => [...prev, ...handles]);
  };

  const handleStartUploads = async () => {
    if (!phiConsent) {
      setPhiConsentError(true);
      return;
    }
    setPhiConsentError(false);
    await uploadClient.startQueued();
    setQueueTick((tick) => tick + 1);
  };

  const findUploadHandle = React.useCallback(
    (id: string) =>
      uploadClient.listQueue().find((item) => item.id === id) ??
      queueHandles.find((item) => item.id === id),
    [queueHandles, uploadClient]
  );

  const pauseUploadEvent = React.useCallback(
    (id: string) => {
      const handle = findUploadHandle(id);
      if (!handle) {
        return;
      }
      handle.pause();
      setQueueTick((tick) => tick + 1);
    },
    [findUploadHandle]
  );

  const resumeUploadEvent = React.useCallback(
    (id: string) => {
      if (!phiConsent) {
        setPhiConsentError(true);
        return;
      }
      setPhiConsentError(false);
      const handle = findUploadHandle(id);
      if (!handle) {
        return;
      }
      handle.resume();
      setQueueTick((tick) => tick + 1);
    },
    [findUploadHandle, phiConsent]
  );

  const removeUploadEvent = React.useCallback(
    (id: string) => {
      uploadClient.remove(id);
      setUploadEvents((prev) => prev.filter((event) => event.id !== id));
      setQueueHandles((prev) => prev.filter((handle) => handle.id !== id));
    },
    [uploadClient]
  );

  const retryUploadEvent = React.useCallback(
    async (id: string) => {
      if (!phiConsent) {
        setPhiConsentError(true);
        return;
      }
      setPhiConsentError(false);
      const handle =
        uploadClient.listQueue().find((item) => item.id === id) ??
        queueHandles.find((item) => item.id === id);
      if (!handle) {
        return;
      }
      handle.retry();
      await uploadClient.startQueued();
      setQueueTick((tick) => tick + 1);
    },
    [phiConsent, queueHandles, uploadClient]
  );

  const retryAllFailed = React.useCallback(async () => {
    if (!phiConsent) {
      setPhiConsentError(true);
      return;
    }
    setPhiConsentError(false);
    const failed = uploadClient
      .listQueue()
      .filter((item) => item.status === "failed");
    if (!failed.length) {
      return;
    }
    failed.forEach((item) => item.retry());
    await uploadClient.startQueued();
    setQueueTick((tick) => tick + 1);
  }, [phiConsent, uploadClient]);

  const handleDeleteDocument = async (doc: DocumentRef) => {
    Alert.alert("Delete document", `Delete "${doc.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const response = await apiFetch(`/documents/${doc.id}`, {
            method: "DELETE",
          });
          if (!response.ok) {
            setUploadError("Failed to delete document.");
            return;
          }
          await queryClient.invalidateQueries({
            queryKey: ["documents"],
          });
          if (selected?.id === doc.id) {
            setSelected({ ...doc, deletedAt: new Date().toISOString() });
          }
        },
      },
    ]);
  };

  const handleRestoreDocument = async (doc: DocumentRef) => {
    const response = await apiFetch(`/documents/${doc.id}/restore`, {
      method: "POST",
    });
    if (!response.ok) {
      setUploadError("Failed to restore document.");
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ["documents"],
    });
    if (selected?.id === doc.id) {
      setSelected({ ...doc, deletedAt: null });
    }
  };

  const handleMarkSigned = async (doc: DocumentRef) => {
    Alert.alert("Mark signed", `Mark "${doc.title}" as signed?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark signed",
        onPress: async () => {
          const response = await apiFetch(`/documents/${doc.id}/signed`, {
            method: "POST",
          });
          if (!response.ok) {
            setUploadError("Failed to mark signed.");
            return;
          }
          await queryClient.invalidateQueries({
            queryKey: ["documents"],
          });
        },
      },
    ]);
  };

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

  if (!authToken) {
    return (
      <LinearGradient
        colors={["#f4efe6", "#f1dfc9", "#f7f3eb"]}
        style={styles.gradient}
      >
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Sign in to League Uploads</Text>
            <Text style={styles.loginSubtitle}>Sign in to continue.</Text>
            <LoginForm onSubmit={handleLogin} error={authError} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#f4efe6", "#f1dfc9", "#f7f3eb"]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>League Upload Management</Text>
              <Text style={styles.title}>
                Unified documents for claims and profiles.
              </Text>
              <Text style={styles.subtitle}>
                Upload, tag, and track sensitive documents with resumable
                uploads.
              </Text>
            </View>
            <View style={styles.userRow}>
              <Text style={styles.userText}>
                {authUser?.email ?? "Signed in"} - {authUser?.role ?? "USER"}
              </Text>
              <OutlineButton onPress={handleLogout}>Log out</OutlineButton>
            </View>
          </View>

          {authUser?.role === "USER" ? (
            <View style={styles.card}>
              <SectionHeader
                title="Upload documents"
                subtitle="Pick images or PDFs from your device."
              />
              <View style={styles.phiBanner}>
                <Text style={styles.phiText}>
                  PHI notice: Uploads may contain protected health information.
                  Only upload documents you are authorized to share.
                </Text>
                {!phiConsent ? (
                  <View style={styles.row}>
                    <OutlineButton
                      onPress={() => {
                        setPhiConsent(true);
                        setPhiConsentError(false);
                      }}
                    >
                      I understand and consent
                    </OutlineButton>
                    {phiConsentError ? (
                      <Text style={styles.errorText}>
                        Consent required before uploading.
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.queueMetaText}>
                    Consent recorded for this session.
                  </Text>
                )}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  style={styles.input}
                  placeholder="Document title"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <View style={styles.chipRow}>
                  {DocCategory.options.map((option) => (
                    <Chip
                      key={option}
                      selected={option === category}
                      onPress={() => setCategory(option)}
                    >
                      {option}
                    </Chip>
                  ))}
                </View>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tags (comma-separated)</Text>
                <TextInput
                  value={tagsInput}
                  onChangeText={setTagsInput}
                  style={styles.input}
                  placeholder="rx, urgent"
                />
              </View>
              <View style={styles.row}>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.label}>Entity Type</Text>
                  <View style={styles.chipRow}>
                    {["CLAIM", "PROFILE", "DEPENDENT", "PLAN_YEAR"].map(
                      (option) => (
                        <Chip
                          key={option}
                          selected={option === entityType}
                          onPress={() =>
                            setEntityType(
                              option as Metadata["entityLinks"][number]["type"]
                            )
                          }
                        >
                          {option}
                        </Chip>
                      )
                    )}
                  </View>
                </View>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.label}>Entity ID</Text>
                  <TextInput
                    value={entityId}
                    onChangeText={setEntityId}
                    style={styles.input}
                    placeholder="claim_123"
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.label}>Document Date</Text>
                  <TextInput
                    value={docDateInput}
                    onChangeText={setDocDateInput}
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={styles.formGroupHalf}>
                  <Text style={styles.label}>Notes</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    style={[styles.input, styles.inputMultiline]}
                    multiline
                    placeholder="Member uploaded from mobile."
                  />
                </View>
              </View>
              <View style={styles.row}>
                <PrimaryButton onPress={handlePickFiles}>
                  Choose files
                </PrimaryButton>
                <OutlineButton onPress={handleStartUploads}>
                  Save & upload all
                </OutlineButton>
              </View>
              {uploadError ? (
                <Text style={styles.errorText}>{uploadError}</Text>
              ) : null}
              <View style={styles.queueMeta}>
                <Text style={styles.queueMetaText}>
                  {queueHandles.length
                    ? `${queueHandles.length} queued`
                    : "No queued uploads"}
                </Text>
              </View>
              {queueHandles.length ? (
                <View style={styles.queueList}>
                  {queueHandles.map((handle) => (
                    <View key={`${handle.id}-${queueTick}`} style={styles.queueItem}>
                      <View style={styles.queueRow}>
                        <Text style={styles.queueTitle}>
                          {handle.init.file.name}
                        </Text>
                        <UploadStatusBadge status={handle.status} />
                      </View>
                      <Text style={styles.queueMetaText}>
                        {formatBytes(handle.progress.bytesSent)} /{" "}
                        {formatBytes(handle.progress.totalBytes)}
                      </Text>
                      {handle.error ? (
                        <Text style={styles.errorText}>{handle.error}</Text>
                      ) : null}
                      {handle.status === "failed" ? (
                        <PrimaryButton
                          onPress={async () => {
                            if (!phiConsent) {
                              setPhiConsentError(true);
                              return;
                            }
                            handle.retry();
                            await uploadClient.startQueued();
                          }}
                        >
                          Retry
                        </PrimaryButton>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <SectionHeader
              title="Documents"
              subtitle="Search, open, and edit metadata."
            />
            <View style={styles.formGroup}>
              <Text style={styles.label}>Search by title or tag</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                style={styles.input}
                placeholder="Search documents"
              />
            </View>
            {authUser?.role === "AGENT" ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Filter by uploader</Text>
                <TextInput
                  value={ownerFilter}
                  onChangeText={setOwnerFilter}
                  style={styles.input}
                  placeholder="user@test.com"
                  autoCapitalize="none"
                />
              </View>
            ) : null}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.chipRow}>
                {(["ALL", "ACTIVE", "SIGNED"] as const).map((option) => (
                  <Chip
                    key={`status-${option}`}
                    selected={statusFilter === option}
                    onPress={() => setStatusFilter(option)}
                  >
                    {option}
                  </Chip>
                ))}
                {authUser?.role === "AGENT" ? (
                  <Chip
                    selected={statusFilter === "DELETED"}
                    onPress={() => setStatusFilter("DELETED")}
                  >
                    DELETED
                  </Chip>
                ) : null}
              </View>
            </View>
            {listQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : listQuery.isError ? (
              <Text style={styles.errorText}>Unable to load documents.</Text>
            ) : (
              <FlatList
                data={documents}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setSelected(item)}
                    style={({ pressed }) => [
                      styles.docCard,
                      pressed && styles.docCardPressed,
                    ]}
                  >
                    <View style={styles.docRow}>
                    <View style={styles.docPreview}>
                      {item.mimeType.startsWith("image/") && item.previewUrl ? (
                        <Image
                          source={{ uri: item.previewUrl }}
                          style={styles.docPreviewImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.docPreviewText}>
                          {item.mimeType.includes("pdf") ? "PDF" : "DOC"}
                        </Text>
                      )}
                    </View>
                      <View style={styles.docBody}>
                        <Text style={styles.docTitle}>{item.title}</Text>
                        <Text style={styles.docMeta}>{item.mimeType}</Text>
                        <Text style={styles.docMeta}>
                          {item.categories?.join(", ") ?? "Uncategorized"}
                        </Text>
                        {authUser?.role === "AGENT" && item.ownerEmail ? (
                          <Text style={styles.docMeta}>
                            Uploaded by: {item.ownerEmail}
                          </Text>
                        ) : null}
                        <Text style={styles.docMeta}>Status: {item.status}</Text>
                      </View>
                    </View>
                  </Pressable>
                )}
                onEndReached={() => {
                  if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
                    void listQuery.fetchNextPage();
                  }
                }}
                onEndReachedThreshold={0.2}
                ListFooterComponent={
                  listQuery.isFetchingNextPage ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : null
                }
                scrollEnabled={false}
              />
            )}
          </View>

          <View style={styles.card}>
            <SectionHeader
              title="Upload activity"
              subtitle="Latest queue events."
            />
            {uploadActivityItems.length ? (
              <>
                {uploadActivityItems.map((event) => {
                  const progressPercent =
                    event.progress?.total &&
                    event.progress.total > 0 &&
                    event.progress.sent >= 0
                      ? Math.min(
                          100,
                          Math.round(
                            (event.progress.sent / event.progress.total) * 100
                          )
                        )
                      : null;
                  const showRetry = event.status === "failed";
                  const showPause = event.status === "uploading";
                  const showResume = event.status === "paused";
                  const showRemove = true;
                  return (
                    <View key={event.id} style={styles.eventRow}>
                      <View style={styles.eventBody}>
                        <View style={styles.eventHeader}>
                          <Text style={styles.eventText}>
                            {event.name ?? event.id}
                          </Text>
                          <View style={styles.eventActions}>
                            <UploadStatusBadge status={event.status} />
                            {showRetry ? (
                              <Pressable
                                onPress={() => retryUploadEvent(event.id)}
                                accessibilityLabel="Retry upload"
                                style={styles.eventActionButton}
                              >
                                <Text style={styles.eventActionText}>Retry</Text>
                              </Pressable>
                            ) : null}
                            {showPause ? (
                              <Pressable
                                onPress={() => pauseUploadEvent(event.id)}
                                accessibilityLabel="Pause upload"
                                style={styles.eventActionButton}
                              >
                                <Text style={styles.eventActionText}>||</Text>
                              </Pressable>
                            ) : null}
                            {showResume ? (
                              <Pressable
                                onPress={() => resumeUploadEvent(event.id)}
                                accessibilityLabel="Resume upload"
                                style={styles.eventActionButton}
                              >
                                <Text style={styles.eventActionText}>&gt;</Text>
                              </Pressable>
                            ) : null}
                            {showRemove ? (
                              <Pressable
                                onPress={() => removeUploadEvent(event.id)}
                                accessibilityLabel="Remove from queue"
                                style={styles.eventActionButton}
                              >
                                <Text style={styles.eventActionText}>X</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        {progressPercent !== null &&
                        event.status !== "completed" ? (
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${progressPercent}%` },
                              ]}
                            />
                          </View>
                        ) : null}
                        {event.error ? (
                          <Text style={styles.errorText}>{event.error}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                {uploadActivityItems.some((item) => item.status === "failed") ? (
                  <PrimaryButton onPress={retryAllFailed}>
                    Retry all failed
                  </PrimaryButton>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyText}>Upload events appear here.</Text>
            )}
          </View>
        </ScrollView>

        <Modal visible={Boolean(selected)} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {selected ? (
                <ScrollView
                  showsVerticalScrollIndicator
                  contentContainerStyle={styles.modalScroll}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Preview</Text>
                    <OutlineButton onPress={() => setSelected(null)}>
                      Close
                    </OutlineButton>
                  </View>
                  <View style={styles.previewMeta}>
                    <Text style={styles.previewTitle}>{selected.title}</Text>
                    <Text style={styles.previewMetaText}>{selected.mimeType}</Text>
                    <Text style={styles.previewMetaText}>
                      Status: {selected.status}
                    </Text>
                    {selected.deletedAt ? (
                      <Text style={styles.previewMetaText}>Deleted</Text>
                    ) : null}
                    {authUser?.role === "AGENT" && selected.ownerEmail ? (
                      <Text style={styles.previewMetaText}>
                        Uploaded by: {selected.ownerEmail}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.row}>
                    {authUser?.role === "AGENT" &&
                    selected.status !== "SIGNED" &&
                    !selected.deletedAt ? (
                      <PrimaryButton onPress={() => handleMarkSigned(selected)}>
                        Mark signed
                      </PrimaryButton>
                    ) : null}
                    {authUser?.role === "AGENT" && selected.deletedAt ? (
                      <OutlineButton onPress={() => handleRestoreDocument(selected)}>
                        Restore
                      </OutlineButton>
                    ) : null}
                    {authUser?.role === "USER" &&
                    selected.status !== "SIGNED" &&
                    !selected.deletedAt ? (
                      <OutlineButton onPress={() => handleDeleteDocument(selected)}>
                        Delete
                      </OutlineButton>
                    ) : null}
                  </View>
                  {previewLoading ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : selectedPreviewUrl && selected.mimeType.startsWith("image") ? (
                    <View
                      style={[
                        styles.previewImageContainer,
                        { maxHeight: Math.round(windowHeight * 0.55) },
                      ]}
                    >
                      <ScrollView
                        style={styles.previewImageScroll}
                        contentContainerStyle={styles.previewImageContent}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                      >
                        <View style={styles.previewImageWrapper}>
                          <Image
                            source={{ uri: selectedPreviewUrl }}
                            style={[
                              styles.previewImage,
                              previewAspectRatio
                                ? { aspectRatio: previewAspectRatio }
                                : styles.previewImageFallback,
                            ]}
                            resizeMode="contain"
                          />
                          {watermarkText ? (
                            <View style={styles.watermarkOverlay}>
                              <Text style={styles.watermarkText}>{watermarkText}</Text>
                            </View>
                          ) : null}
                        </View>
                      </ScrollView>
                    </View>
                  ) : selectedPreviewUrl && selected.mimeType.includes("pdf") ? (
                    <OutlineButton onPress={() => Linking.openURL(selectedPreviewUrl)}>
                      Open PDF preview
                    </OutlineButton>
                  ) : (
                    <Text style={styles.emptyText}>Preview unavailable.</Text>
                  )}

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Title</Text>
                    <TextInput
                      value={editTitle}
                      onChangeText={setEditTitle}
                      style={styles.input}
                      editable={
                        !(authUser?.role === "USER" && selected.status === "SIGNED")
                      }
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Category</Text>
                    <View style={styles.chipRow}>
                      {DocCategory.options.map((option) => (
                        <Chip
                          key={`edit-${option}`}
                          selected={option === editCategory}
                          onPress={() =>
                            authUser?.role === "USER" &&
                            selected.status === "SIGNED"
                              ? undefined
                              : setEditCategory(option)
                          }
                        >
                          {option}
                        </Chip>
                      ))}
                    </View>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Tags</Text>
                    <TextInput
                      value={editTagsInput}
                      onChangeText={setEditTagsInput}
                      style={styles.input}
                      editable={
                        !(authUser?.role === "USER" && selected.status === "SIGNED")
                      }
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Linked entities</Text>
                    <Text style={styles.metaText}>
                      {selected.entityLinks
                        .map((link) => `${link.type}:${link.id}`)
                        .join(", ")}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <View style={styles.formGroupHalf}>
                      <Text style={styles.label}>Document Date</Text>
                      <TextInput
                        value={editDocDateInput}
                        onChangeText={setEditDocDateInput}
                        style={styles.input}
                        editable={
                          !(authUser?.role === "USER" && selected.status === "SIGNED")
                        }
                      />
                    </View>
                    <View style={styles.formGroupHalf}>
                      <Text style={styles.label}>Notes</Text>
                      <TextInput
                        value={editNotes}
                        onChangeText={setEditNotes}
                        style={[styles.input, styles.inputMultiline]}
                        multiline
                        editable={
                          !(authUser?.role === "USER" && selected.status === "SIGNED")
                        }
                      />
                    </View>
                  </View>
                  {!(authUser?.role === "USER" && selected.status === "SIGNED") ? (
                    <PrimaryButton
                      onPress={async () => {
                        if (!selected) {
                          return;
                        }
                        const updated = await updateDocument(selected.id, {
                          title: editTitle,
                          categories: [editCategory],
                          tags: parseTags(editTagsInput),
                          entityLinks: selected.entityLinks,
                          docDate: buildDocDate(editDocDateInput),
                          notes: editNotes || undefined,
                        });
                        setSelected(updated);
                        await queryClient.invalidateQueries({
                          queryKey: ["documents"],
                        });
                      }}
                    >
                      Save changes
                    </PrimaryButton>
                  ) : (
                    <Text style={styles.emptyText}>
                      Signed documents cannot be edited.
                    </Text>
                  )}
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const LoginForm: React.FC<{
  onSubmit: (payload: { email: string; password: string }) => void;
  error: string | null;
}> = ({ onSubmit, error }) => {
  const [email, setEmail] = React.useState("user@test.com");
  const [password, setPassword] = React.useState("123456");
  return (
    <View style={styles.form}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="user@test.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="123456"
          secureTextEntry
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton onPress={() => onSubmit({ email, password })}>
        Sign in
      </PrimaryButton>
    </View>
  );
};

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AppShell />
  </QueryClientProvider>
);

export default App;

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.md,
  },
  kicker: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 12,
    color: colors.accent,
    fontFamily: fonts.body,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.heading,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 14,
    marginTop: spacing.xs,
    fontFamily: fonts.body,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  userText: {
    fontSize: 12,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    shadowColor: colors.ink,
    shadowOpacity: Platform.select({ ios: 0.08, android: 0 }),
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.ink,
  },
  sectionSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    fontFamily: fonts.body,
  },
  form: {
    gap: spacing.md,
  },
  formGroup: {
    gap: spacing.xs,
  },
  formGroupHalf: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  metaText: {
    fontSize: 12,
    color: colors.ink,
    fontFamily: fonts.body,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  phiBanner: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.xs,
  },
  phiText: {
    fontSize: 12,
    color: colors.ink,
    fontFamily: fonts.body,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipUnselected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 11,
    color: colors.ink,
    fontFamily: fonts.body,
  },
  chipTextSelected: {
    color: "white",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontFamily: fonts.body,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
  },
  outlineButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  outlineButtonDisabled: {
    opacity: 0.5,
  },
  outlineButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.body,
  },
  queueMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  queueMetaText: {
    fontSize: 12,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  queueList: {
    gap: spacing.sm,
  },
  queueItem: {
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  queueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueTitle: {
    fontFamily: fonts.body,
    color: colors.ink,
    flex: 1,
  },
  queueActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: 11,
    color: colors.ink,
    fontFamily: fonts.body,
  },
  docCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  docCardPressed: {
    backgroundColor: colors.accentSoft,
  },
  docRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  docPreview: {
    width: 50,
    height: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  docPreviewText: {
    fontSize: 12,
    color: colors.accent,
    fontFamily: fonts.body,
  },
  docPreviewImage: {
    width: "100%",
    height: "100%",
  },
  docBody: {
    flex: 1,
    gap: 2,
  },
  docTitle: {
    fontSize: 14,
    color: colors.ink,
    fontFamily: fonts.heading,
  },
  docMeta: {
    fontSize: 11,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  previewMeta: {
    gap: spacing.xs,
  },
  previewTitle: {
    fontSize: 16,
    color: colors.ink,
    fontFamily: fonts.heading,
  },
  previewMetaText: {
    fontSize: 12,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  eventRow: {
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  eventBody: {
    gap: spacing.xs,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  eventActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  eventActionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  eventActionText: {
    fontSize: 11,
    color: colors.ink,
    fontFamily: fonts.body,
  },
  eventText: {
    fontSize: 12,
    color: colors.ink,
    fontFamily: fonts.mono,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  emptyText: {
    fontSize: 12,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    fontFamily: fonts.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: "90%",
  },
  modalScroll: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    color: colors.ink,
    fontFamily: fonts.heading,
  },
  previewImageContainer: {
    width: "100%",
  },
  previewImageScroll: {
    width: "100%",
  },
  previewImageContent: {
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  previewImageFallback: {
    minHeight: 220,
  },
  previewImageWrapper: {
    width: "100%",
    borderRadius: radii.md,
    overflow: "hidden",
  },
  watermarkOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  watermarkText: {
    color: "rgba(95, 63, 33, 0.5)",
    fontSize: 12,
    textAlign: "center",
  },
  loginCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  loginTitle: {
    fontSize: 22,
    color: colors.ink,
    fontFamily: fonts.heading,
  },
  loginSubtitle: {
    fontSize: 13,
    color: colors.inkMuted,
    fontFamily: fonts.body,
  },
});
