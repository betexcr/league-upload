import * as React from "react";
import {
  ActivityIndicator,
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
  return envUrl && envUrl.trim().length > 0 ? envUrl : defaultBaseUrl;
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
    <Text style={styles.chipText}>{children}</Text>
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
  const [selected, setSelected] = React.useState<DocumentRef | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = React.useState<string | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [uploadEvents, setUploadEvents] = React.useState<
    Array<{ id: string; status: string; error?: string; name?: string }>
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

  const handleLogout = React.useCallback(async () => {
    authTokenRef.current = null;
    setAuthToken(null);
    setAuthUser(null);
    setSelected(null);
    setSelectedPreviewUrl(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
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
      authTokenRef.current = token;
      setAuthToken(token);
    })();
  }, []);

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
        const latest = prev[0];
        if (latest && latest.id === handle.id && latest.status === status) {
          return prev;
        }
        return [
          {
            id: handle.id,
            status,
            error: handle.error,
            name: handle.init.file.name,
          },
          ...prev,
        ].slice(0, 6);
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
      void queryClient.invalidateQueries({ queryKey: ["documents", search] });
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
  }, [uploadClient, queryClient, search]);

  React.useEffect(() => {
    if (!selected) {
      setSelectedPreviewUrl(null);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    const loadPreview = async () => {
      try {
        const response = await apiFetch(
          `/documents/${selected.id}/preview-url?watermark=on`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch preview");
        }
        const data = (await response.json()) as { url: string };
        if (active) {
          setSelectedPreviewUrl(data.url);
          setPreviewLoading(false);
        }
      } catch {
        if (active) {
          setSelectedPreviewUrl(null);
          setPreviewLoading(false);
        }
      }
    };
    void loadPreview();
    return () => {
      active = false;
    };
  }, [apiFetch, selected]);

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

  const handleLogin = async (payload: {
    email: string;
    role: "USER" | "AGENT";
  }) => {
    setAuthError(null);
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setAuthError("Login failed. Check your email and role.");
      return;
    }
    const data = (await response.json()) as {
      accessToken: string;
      user: { email: string; role: "MEMBER" | "AGENT" };
    };
    authTokenRef.current = data.accessToken;
    await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
    setAuthToken(data.accessToken);
    setAuthUser({
      email: data.user.email,
      role: data.user.role === "AGENT" ? "AGENT" : "USER",
    });
  };

  const listQuery = useInfiniteQuery({
    queryKey: ["documents", search],
    queryFn: async ({ pageParam }) => {
      const params: string[] = [];
      if (pageParam) {
        params.push(`cursor=${encodeURIComponent(String(pageParam))}`);
      }
      if (search) {
        params.push(`q=${encodeURIComponent(search)}`);
      }
      params.push("limit=6");
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
    await uploadClient.startQueued();
    setQueueTick((tick) => tick + 1);
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
            <Text style={styles.loginSubtitle}>Choose your role to continue.</Text>
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

          <View style={styles.card}>
            <SectionHeader
              title="Upload documents"
              subtitle="Pick images or PDFs from your device."
            />
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
              <PrimaryButton onPress={handlePickFiles}>Choose files</PrimaryButton>
              <OutlineButton onPress={handleStartUploads}>
                Start queued
              </OutlineButton>
            </View>
            {uploadError ? (
              <Text style={styles.errorText}>{uploadError}</Text>
            ) : null}
            <View style={styles.queueMeta}>
              <Text style={styles.queueMetaText}>
                Queue: {restoreState.status}
                {restoreState.status === "restored"
                  ? ` (${restoreState.count})`
                  : ""}
              </Text>
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
                      <Text style={styles.queueTitle}>{handle.init.file.name}</Text>
                      <UploadStatusBadge status={handle.status} />
                    </View>
                    <Text style={styles.queueMetaText}>
                      {formatBytes(handle.progress.bytesSent)} /{" "}
                      {formatBytes(handle.progress.totalBytes)}
                    </Text>
                    {handle.error ? (
                      <Text style={styles.errorText}>{handle.error}</Text>
                    ) : null}
                    <View style={styles.queueActions}>
                      <OutlineButton onPress={() => handle.pause()}>
                        Pause
                      </OutlineButton>
                      <OutlineButton onPress={() => handle.resume()}>
                        Resume
                      </OutlineButton>
                      <OutlineButton onPress={() => handle.cancel()}>
                        Cancel
                      </OutlineButton>
                      {handle.status === "failed" ? (
                        <PrimaryButton onPress={() => handle.retry()}>
                          Retry
                        </PrimaryButton>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

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
                        <Text style={styles.docPreviewText}>
                          {item.mimeType.includes("pdf") ? "PDF" : "IMG"}
                        </Text>
                      </View>
                      <View style={styles.docBody}>
                        <Text style={styles.docTitle}>{item.title}</Text>
                        <Text style={styles.docMeta}>{item.mimeType}</Text>
                        <Text style={styles.docMeta}>
                          {item.categories?.join(", ") ?? "Uncategorized"}
                        </Text>
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
            {uploadEvents.length ? (
              uploadEvents.map((event) => (
                <View key={`${event.id}-${event.status}`} style={styles.eventRow}>
                  <View>
                    <Text style={styles.eventText}>
                      {event.id}
                      {event.name ? ` - ${event.name}` : ""}
                    </Text>
                    {event.error ? (
                      <Text style={styles.errorText}>{event.error}</Text>
                    ) : null}
                  </View>
                  <UploadStatusBadge status={event.status} />
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Upload events appear here.</Text>
            )}
          </View>
        </ScrollView>

        <Modal visible={Boolean(selected)} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {selected ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Preview</Text>
                    <OutlineButton onPress={() => setSelected(null)}>
                      Close
                    </OutlineButton>
                  </View>
                  {previewLoading ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : selectedPreviewUrl && selected.mimeType.startsWith("image") ? (
                    <Image
                      source={{ uri: selectedPreviewUrl }}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
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
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Category</Text>
                    <View style={styles.chipRow}>
                      {DocCategory.options.map((option) => (
                        <Chip
                          key={`edit-${option}`}
                          selected={option === editCategory}
                          onPress={() => setEditCategory(option)}
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
                      />
                    </View>
                    <View style={styles.formGroupHalf}>
                      <Text style={styles.label}>Notes</Text>
                      <TextInput
                        value={editNotes}
                        onChangeText={setEditNotes}
                        style={[styles.input, styles.inputMultiline]}
                        multiline
                      />
                    </View>
                  </View>
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
                        queryKey: ["documents", search],
                      });
                    }}
                  >
                    Save changes
                  </PrimaryButton>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const LoginForm: React.FC<{
  onSubmit: (payload: { email: string; role: "USER" | "AGENT" }) => void;
  error: string | null;
}> = ({ onSubmit, error }) => {
  const [email, setEmail] = React.useState("member@league.test");
  const [role, setRole] = React.useState<"USER" | "AGENT">("USER");
  return (
    <View style={styles.form}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="member@league.test"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Role</Text>
        <View style={styles.row}>
          <Chip selected={role === "USER"} onPress={() => setRole("USER")}>
            User
          </Chip>
          <Chip selected={role === "AGENT"} onPress={() => setRole("AGENT")}>
            Agent
          </Chip>
        </View>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton onPress={() => onSubmit({ email, role })}>
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
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  eventText: {
    fontSize: 12,
    color: colors.ink,
    fontFamily: fonts.mono,
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
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
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
