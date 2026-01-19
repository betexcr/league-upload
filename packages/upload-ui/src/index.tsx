import * as React from "react";
import type { DocumentRef, Metadata } from "@league/types";
import { DocCategory } from "@league/types";
import { css } from "styled-system/css";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import {
  createMockEngine,
  createUploadClient,
  type UploadClient,
  type UploadHandle,
  type UploadInit,
} from "@league/upload-core";

export type UploaderWidgetProps = {
  maxSizeMB: number;
  accept: Record<string, string[]>;
  defaultCategory: Metadata["categories"][number];
  getContext: () => UploadInit["context"];
  getMetadata?: (file: File) => Partial<Metadata>;
  onCompleted?: (docs: Array<{ id: string; title: string }>) => void;
  client?: UploadClient;
  maxFiles?: number;
  onQueueChange?: (state: { hasFiles: boolean; queuedCount: number }) => void;
};

export const UploaderWidget: React.FC<UploaderWidgetProps> = ({
  maxSizeMB,
  accept,
  defaultCategory,
  getContext,
  getMetadata,
  onCompleted,
  client,
  maxFiles = 50,
  onQueueChange,
}) => {
  const [handles, setHandles] = React.useState<UploadHandle[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [metadataById, setMetadataById] = React.useState<
    Record<string, Metadata>
  >({});
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = React.useState<Set<string>>(
    new Set()
  );
  const [localPreviews, setLocalPreviews] = React.useState<
    Record<string, string>
  >({});
  const previewUrlsRef = React.useRef<Record<string, string>>({});
  const dismissTimersRef = React.useRef<Record<string, number>>({});
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadClient = React.useMemo(
    () => client ?? createUploadClient({ engine: createMockEngine() }),
    [client]
  );

  const removeHandle = (id: string) => {
    uploadClient.remove(id);
    setHandles((prev) => prev.filter((handle) => handle.id !== id));
    setMetadataById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  React.useEffect(() => {
    const unsubCompleted = uploadClient.on("completed", (handle) => {
      onCompleted?.([{ id: handle.id, title: "Uploaded document" }]);
      setDismissingIds((current) => {
        const next = new Set(current);
        next.add(handle.id);
        return next;
      });
      if (dismissTimersRef.current[handle.id]) {
        window.clearTimeout(dismissTimersRef.current[handle.id]);
      }
      dismissTimersRef.current[handle.id] = window.setTimeout(() => {
        setHandles((prev) => {
          const next = prev.filter((item) => item.id !== handle.id);
          if (!next.length) {
            setMetadataById({});
            setExpandedIds(new Set());
            setErrors([]);
            setPendingFiles([]);
            setDismissingIds(new Set());
          } else {
            setMetadataById((current) => {
              const updated = { ...current };
              delete updated[handle.id];
              return updated;
            });
            setExpandedIds((current) => {
              const updated = new Set(current);
              updated.delete(handle.id);
              return updated;
            });
            setDismissingIds((current) => {
              const updated = new Set(current);
              updated.delete(handle.id);
              return updated;
            });
          }
          return next;
        });
        delete dismissTimersRef.current[handle.id];
      }, 260);
    });
    return () => {
      unsubCompleted();
    };
  }, [uploadClient, onCompleted]);

  React.useEffect(() => {
    onQueueChange?.({
      hasFiles: handles.length > 0 || pendingFiles.length > 0,
      queuedCount: handles.length,
    });
  }, [handles.length, pendingFiles.length, onQueueChange]);

  React.useEffect(() => {
    const next = { ...previewUrlsRef.current };
    const activeIds = new Set(handles.map((handle) => handle.id));
    for (const [id, url] of Object.entries(next)) {
      if (!activeIds.has(id)) {
        URL.revokeObjectURL(url);
        delete next[id];
      }
    }
    for (const handle of handles) {
      if (next[handle.id]) {
        continue;
      }
      const blob = handle.init.file.blob;
      const type = handle.init.file.type ?? "";
      if (blob && type.startsWith("image/")) {
        next[handle.id] = URL.createObjectURL(blob);
      }
    }
    previewUrlsRef.current = next;
    setLocalPreviews(next);
  }, [handles]);

  React.useEffect(() => {
    return () => {
      Object.values(dismissTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });
      dismissTimersRef.current = {};
      for (const url of Object.values(previewUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current = {};
    };
  }, []);

  const handleFiles = async (fileList: FileList | File[]): Promise<void> => {
    const files = Array.from(fileList);
    if (!files.length) {
      return;
    }
    setPendingFiles(files);

    const nextErrors: string[] = [];
    if (files.length > maxFiles) {
      nextErrors.push(`Max ${maxFiles} files per batch.`);
    }
    const oversized = files.filter((file) => file.size > maxSizeMB * 1024 * 1024);
    if (oversized.length) {
      nextErrors.push(
        `Some files exceed ${maxSizeMB} MB: ${oversized
          .slice(0, 3)
          .map((file) => file.name)
          .join(", ")}`
      );
    }
    setErrors(nextErrors);
    if (nextErrors.length) {
      setPendingFiles([]);
      return;
    }

    const uploads: UploadInit[] = files.map((file) => {
      const context = getContext();
      const overrides = getMetadata?.(file) ?? {};
      const metadata: Metadata = {
        title: overrides.title ?? file.name,
        categories: overrides.categories ?? [defaultCategory],
        tags: overrides.tags ?? [],
        entityLinks: overrides.entityLinks ?? context.entityLinks,
        docDate: overrides.docDate,
        notes: overrides.notes,
      };
      return {
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          blob: file,
        },
        metadata,
        context,
      };
    });

    const totalBytes = uploads.reduce((sum, u) => sum + u.file.size, 0);
    if (totalBytes > maxSizeMB * 1024 * 1024) {
      return;
    }

    const nextHandles = await uploadClient.enqueue(uploads);
    setHandles((prev) => [...prev, ...nextHandles]);
    setMetadataById((prev) => {
      const next = { ...prev };
      for (const handle of nextHandles) {
        next[handle.id] = handle.init.metadata;
      }
      return next;
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const handle of nextHandles) {
        next.add(handle.id);
      }
      return next;
    });
    setPendingFiles([]);
  };

  const onSelectFiles = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const fileList = event.target.files;
    if (!fileList) {
      return;
    }
    await handleFiles(fileList);
    event.target.value = "";
  };

  return (
    <section
      className={css({
        display: "grid",
        gap: "3",
      })}
    >
      <span className={visuallyHidden} id="upload-instructions">
        Upload documents. Drag and drop files or use the browse button.
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={Object.keys(accept).join(",")}
        onChange={onSelectFiles}
        aria-describedby="upload-instructions"
        className={css({ display: "none" })}
        style={{ display: "none" }}
      />
      <div
        className={css({
          display: "grid",
          gap: "3",
          borderWidth: "thick",
          borderStyle: "dashed",
          borderColor: isDragging ? "accent" : "border",
          borderRadius: "xl",
          padding: "5",
          background: isDragging ? "highlight" : "surfaceAlt",
          transition: "border-color 0.2s ease, background 0.2s ease",
        })}
        role="button"
        tabIndex={0}
        aria-describedby="upload-help"
        aria-label="Upload files. Drag and drop or press enter to browse."
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer?.files?.length) {
            await handleFiles(event.dataTransfer.files);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <div
          className={css({
            display: "grid",
            gap: "2",
            justifyItems: "start",
          })}
        >
          <strong className={css({ fontSize: "md" })}>
            Drag files here to upload
          </strong>
          <span className={css({ fontSize: "xs", color: "muted" })}>
            Images or PDFs up to {maxSizeMB}MB. Max {maxFiles} files per batch.
          </span>
          <span
            id="upload-help"
            className={css({ fontSize: "xs", color: "muted" })}
          >
            Supported formats: PDF, JPG, PNG, HEIC.
          </span>
          <div
            className={css({
              display: "flex",
              gap: "2",
              flexWrap: "wrap",
              fontSize: "xs",
              color: "muted",
            })}
          >
            <span
              className={css({
                borderRadius: "full",
                padding: "3 5",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
              })}
            >
              PDF
            </span>
            <span
              className={css({
                borderRadius: "full",
                padding: "3 5",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
              })}  
            >
              JPG/PNG
            </span>
            <span
              className={css({
                borderRadius: "full",
                padding: "2 4",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
              })}
            >
              HEIC
            </span>
          </div>
        </div>
        <div className={css({ display: "flex", gap: "3", flexWrap: "wrap" })}>
          <button
            type="button"
            className={css({
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              padding: "3 6",
              background: "accent",
              color: "surface",
              fontSize: "xs",
              fontWeight: "600",
              cursor: "pointer",
            })}
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </button>
          <span className={css({ fontSize: "xs", color: "muted" })}>
            or drag and drop
          </span>
          {pendingFiles.length ? (
            <span className={css({ fontSize: "xs", color: "muted" })}>
              {pendingFiles.length} file(s) queued
            </span>
          ) : null}
        </div>
      </div>
      {errors.length ? (
        <ul
          className={css({
            margin: 0,
            paddingLeft: "4",
            fontSize: "xs",
            color: "errorText",
          })}
          role="alert"
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {handles.length ? (
        <div
          className={css({
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "border",
            borderRadius: "md",
            padding: "3 4",
            bg: "surfaceAlt",
            display: "grid",
            gap: "3",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "2",
              fontSize: "sm",
              fontWeight: "600",
            })}
          >
            Documents to upload
            <span
              className={css({
                borderRadius: "full",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
                padding: "3 5",
                fontSize: "xs",
                background: "highlight",
              })}
            >
              {handles.length}
            </span>
          </div>
          <div className={css({ display: "grid", gap: "2" })}>
            {handles.map((handle) => (
              <div
                key={handle.id}
                className={css({
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  borderRadius: "md",
                  padding: "3 4",
                  bg: "surfaceAlt",
                  display: "grid",
                  gap: "2",
                  opacity: dismissingIds.has(handle.id) ? 0 : 1,
                  transform: dismissingIds.has(handle.id)
                    ? "translateY(6px)"
                    : "translateY(0)",
                  maxHeight: dismissingIds.has(handle.id) ? "0" : "420px",
                  overflow: "hidden",
                  transition:
                    "opacity 0.24s ease, transform 0.24s ease, max-height 0.24s ease",
                })}
                aria-live="polite"
              >
                <div
                  className={css({
                    height: "thumb",
                    borderRadius: "md",
                    bg: "highlight",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    fontSize: "xs",
                    color: "muted",
                  })}
                >
                  {localPreviews[handle.id] ? (
                    <img
                      src={localPreviews[handle.id]}
                      alt={handle.init.file.name}
                      className={css({
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      })}
                    />
                  ) : handle.init.file.type.includes("pdf") ? (
                    <span>PDF</span>
                  ) : (
                    <span>FILE</span>
                  )}
                </div>
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "2",
                    flexWrap: "wrap",
                  })}
                >
                  <strong>{handle.init.file.name}</strong>
                  <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
                    <span
                      className={css({
                        fontSize: "xs",
                        fontWeight: "600",
                        color: handle.status === "failed" ? "errorText" : "muted",
                      })}
                    >
                      {handle.status}
                    </span>
                    {handle.status === "failed" ? (
                      <button
                        className={buttonClass}
                        type="button"
                        onClick={() => handle.retry()}
                      >
                        Retry
                      </button>
                    ) : null}
                    {["queued", "failed", "canceled"].includes(handle.status) ? (
                      <button
                        className={buttonClass}
                        type="button"
                        onClick={() => removeHandle(handle.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <span className={css({ fontSize: "xs", color: "muted" })}>
                  {handle.progress.bytesSent}/{handle.progress.totalBytes}
                </span>
                <div
                  className={css({
                    display: "flex",
                    gap: "2",
                    flexWrap: "wrap",
                  })}
                >
                  <button
                    className={buttonClass}
                    type="button"
                    onClick={() =>
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(handle.id)) {
                          next.delete(handle.id);
                        } else {
                          next.add(handle.id);
                        }
                        return next;
                      })
                    }
                  >
                    {expandedIds.has(handle.id) ? "Hide metadata" : "Edit metadata"}
                  </button>
                </div>
                {expandedIds.has(handle.id) ? (
                  <div
                    className={css({
                      marginTop: "2",
                      paddingTop: "2",
                      borderTopWidth: "thin",
                      borderTopStyle: "solid",
                      borderColor: "border",
                    })}
                  >
                    <MetadataForm
                      value={metadataById[handle.id] ?? handle.init.metadata}
                      onChange={(next) => {
                        setMetadataById((prev) => ({ ...prev, [handle.id]: next }));
                        handle.init.metadata = next;
                      }}
                      onSubmit={(next) => {
                        setMetadataById((prev) => ({ ...prev, [handle.id]: next }));
                        handle.init.metadata = next;
                      }}
                      showSubmit={false}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export type MetadataFormProps = {
  value: Metadata;
  onChange?: (next: Metadata) => void;
  onSubmit: (value: Metadata) => void;
  allowEntityLinkEdit?: boolean;
  showSubmit?: boolean;
};

const MetadataFormSchema = z.object({
  title: z.string().min(1).max(120),
  category: DocCategory,
  tags: z.string().optional(),
  entityType: z.enum(["CLAIM", "PROFILE", "DEPENDENT", "PLAN_YEAR"]).optional(),
  entityId: z.string().optional(),
  docDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

type MetadataFormValues = z.infer<typeof MetadataFormSchema>;

const categories = DocCategory.options;
const inputClass = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "border",
  borderRadius: "sm",
  padding: "3 6",
  bg: "surfaceAlt",
  fontSize: "sm",
});
const labelClass = css({
  display: "grid",
  gap: "2",
  fontSize: "sm",
  color: "muted",
});
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
const buttonClass = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "border",
  borderRadius: "full",
  padding: "3 6",
  background: "accent",
  color: "surface",
  fontSize: "xs",
  fontWeight: "600",
  cursor: "pointer",
  _hover: { background: "accentHover" },
});

const metadataToFormValues = (value: Metadata): MetadataFormValues => {
  return {
    title: value.title,
    category: value.categories[0] ?? "OTHER",
    tags: value.tags.join(", "),
    entityType: value.entityLinks[0]?.type ?? "PROFILE",
    entityId: value.entityLinks[0]?.id ?? "",
    docDate: value.docDate ? value.docDate.slice(0, 10) : "",
    notes: value.notes ?? "",
  };
};

const formValuesToMetadata = (
  values: MetadataFormValues,
  fallbackLinks: Metadata["entityLinks"]
): Metadata => {
  const tags = values.tags
    ? values.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const entityLinks =
    values.entityId && values.entityType
      ? [{ type: values.entityType, id: values.entityId }]
      : fallbackLinks;
  return {
    title: values.title,
    categories: [values.category],
    tags,
    entityLinks,
    docDate: values.docDate ? `${values.docDate}T00:00:00.000Z` : undefined,
    notes: values.notes ? values.notes : undefined,
  };
};

export const MetadataForm: React.FC<MetadataFormProps> = ({
  value,
  onChange,
  onSubmit,
  allowEntityLinkEdit = true,
  showSubmit = true,
}) => {
  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(MetadataFormSchema),
    defaultValues: metadataToFormValues(value),
    mode: "onChange",
  });

  React.useEffect(() => {
    form.reset(metadataToFormValues(value));
  }, [form, value]);

  React.useEffect(() => {
    const subscription = form.watch((next) => {
      const values = next as MetadataFormValues;
      onChange?.(formValuesToMetadata(values, value.entityLinks));
    });
    return () => subscription.unsubscribe();
  }, [form, onChange, value.entityLinks]);

  return (
    <form
      onSubmit={form.handleSubmit((next) =>
        onSubmit(formValuesToMetadata(next, value.entityLinks))
      )}
      className={css({ display: "grid", gap: "3" })}
    >
      <label className={labelClass}>
        Title
        <input className={inputClass} {...form.register("title")} />
      </label>
      <label className={labelClass}>
        Category
        <select className={inputClass} {...form.register("category")}>
          {categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Tags (comma-separated)
        <input className={inputClass} {...form.register("tags")} />
      </label>
      <label className={labelClass}>
        Entity Type
        <select
          className={inputClass}
          {...form.register("entityType")}
          disabled={!allowEntityLinkEdit}
        >
          <option value="CLAIM">CLAIM</option>
          <option value="PROFILE">PROFILE</option>
          <option value="DEPENDENT">DEPENDENT</option>
          <option value="PLAN_YEAR">PLAN_YEAR</option>
        </select>
      </label>
      <label className={labelClass}>
        Entity ID
        <input
          className={inputClass}
          {...form.register("entityId")}
          disabled={!allowEntityLinkEdit}
        />
      </label>
      <label className={labelClass}>
        Document Date
        <input className={inputClass} type="date" {...form.register("docDate")} />
      </label>
      <label className={labelClass}>
        Notes
        <textarea className={inputClass} {...form.register("notes")} />
      </label>
      {showSubmit ? (
        <button className={buttonClass} type="submit">
          Save
        </button>
      ) : null}
    </form>
  );
};

export type DocumentGalleryProps = {
  documents: DocumentRef[];
  onOpen?: (doc: DocumentRef) => void;
  onDelete?: (doc: DocumentRef) => void;
  onMarkSigned?: (doc: DocumentRef) => void;
  onRestore?: (doc: DocumentRef) => void;
  showOwner?: boolean;
  view?: "grid" | "list";
};

const formatDate = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
};

export const DocumentGallery: React.FC<DocumentGalleryProps> = ({
  documents,
  onOpen,
  onDelete,
  onMarkSigned,
  onRestore,
  showOwner = false,
  view = "grid",
}) => {
  const isGrid = view === "grid";
  return (
    <section
      className={css({
        display: "grid",
        gap: "3",
        gridTemplateColumns: isGrid
          ? {
              base: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))",
              xl: "repeat(4, minmax(0, 1fr))",
            }
          : "1fr",
      })}
      role="list"
    >
      {documents.map((doc) => (
        <article
          key={doc.id}
          className={css({
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "border",
            borderRadius: "lg",
            padding: "5",
            bg: "surfaceAlt",
            display: "grid",
            gap: "3",
            gridTemplateColumns: isGrid ? "1fr" : "var(--sizes-thumb) 1fr",
            alignItems: "start",
            cursor: onOpen ? "pointer" : "default",
          })}
          role="listitem"
          onClick={() => onOpen?.(doc)}
        >
          <div
            className={css({
              height: "thumb",
              borderRadius: "md",
              bg: "highlight",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              fontSize: "xs",
              color: "muted",
            })}
          >
            {doc.previewUrl && doc.mimeType.startsWith("image") ? (
              <img
                src={doc.previewUrl}
                alt={doc.title}
                className={css({ width: "100%", height: "100%", objectFit: "cover" })}
              />
            ) : doc.previewUrl && doc.mimeType.includes("pdf") ? (
              <object
                data={doc.previewUrl}
                type="application/pdf"
                aria-label={`${doc.title} PDF preview`}
                className={css({ width: "100%", height: "100%", pointerEvents: "none" })}
              >
                <span>PDF</span>
              </object>
            ) : (
              <span>{doc.mimeType.includes("pdf") ? "PDF" : "FILE"}</span>
            )}
          </div>
          <div>
            <div
              className={css({
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "2",
                flexWrap: "wrap",
              })}
            >
              <h3 className={css({ margin: 0, fontSize: "md" })}>{doc.title}</h3>
              <span
                className={css({
                  borderRadius: "full",
                  borderWidth: "thin",
                  borderStyle: "solid",
                  borderColor: "border",
                  padding: "3 5",
                  fontSize: "xs",
                  background: doc.deletedAt
                    ? "warningBg"
                    : doc.status === "SIGNED"
                    ? "successBg"
                    : "highlight",
                })}
              >
                {doc.deletedAt ? "DELETED" : doc.status ?? "ACTIVE"}
              </span>
            </div>
            <p className={css({ margin: "1 0", fontSize: "xs", color: "muted" })}>
              {doc.mimeType}
            </p>
            {showOwner && doc.ownerEmail ? (
              <p className={css({ margin: "1 0", fontSize: "xs" })}>
                Uploaded by: {doc.ownerEmail}
              </p>
            ) : null}
            {doc.categories?.length ? (
              <p className={css({ margin: "1 0", fontSize: "xs" })}>
                Category: {doc.categories.join(", ")}
              </p>
            ) : null}
            {doc.tags?.length ? (
              <p className={css({ margin: "1 0", fontSize: "xs" })}>
                Tags: {doc.tags.join(", ")}
              </p>
            ) : null}
            {doc.entityLinks?.length ? (
              <p className={css({ margin: "1 0", fontSize: "xs" })}>
                Links:{" "}
                {doc.entityLinks.map((link) => `${link.type}:${link.id}`).join(", ")}
              </p>
            ) : null}
            {doc.docDate ? (
              <p className={css({ margin: "1 0", fontSize: "xs" })}>
                Date: {formatDate(doc.docDate)}
              </p>
            ) : null}
            {doc.notes ? (
              <p className={css({ margin: "1 0", fontSize: "xs" })}>
                Notes: {doc.notes}
              </p>
            ) : null}
            <div className={css({ display: "flex", gap: "3", flexWrap: "wrap" })}>
              <button
                className={buttonClass}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen?.(doc);
                }}
              >
                Open
              </button>
              {doc.deletedAt && onRestore ? (
                <button
                  className={buttonClass}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRestore(doc);
                  }}
                >
                  Restore
                </button>
              ) : null}
              {!doc.deletedAt && doc.acl?.canDelete && onDelete ? (
                <button
                  className={buttonClass}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(doc);
                  }}
                >
                  Delete
                </button>
              ) : null}
              {!doc.deletedAt && doc.status !== "SIGNED" && onMarkSigned ? (
                <button
                  className={buttonClass}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkSigned(doc);
                  }}
                >
                  Mark signed
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
};

export type DocumentQueryResult = {
  items: DocumentRef[];
  nextCursor?: string;
};

export type DocumentQueryOptions = {
  queryKey: readonly unknown[];
  queryFn: (args: { pageParam?: string | null }) => Promise<DocumentQueryResult>;
  getNextPageParam?: (lastPage: DocumentQueryResult) => string | undefined;
};

export const useDocumentsQuery = (options: DocumentQueryOptions) => {
  return useInfiniteQuery<
    DocumentQueryResult,
    Error,
    InfiniteData<DocumentQueryResult, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: options.queryKey,
    queryFn: ({ pageParam }) => options.queryFn({ pageParam }),
    getNextPageParam: options.getNextPageParam ?? ((last) => last.nextCursor),
    initialPageParam: null,
  });
};

export type DocumentGalleryQueryProps = {
  query: DocumentQueryOptions;
  onOpen?: (doc: DocumentRef) => void;
  onDelete?: (doc: DocumentRef) => void;
  onMarkSigned?: (doc: DocumentRef) => void;
  onRestore?: (doc: DocumentRef) => void;
  showOwner?: boolean;
  view?: "grid" | "list";
};

export const DocumentGalleryQuery: React.FC<DocumentGalleryQueryProps> = ({
  query,
  onOpen,
  onDelete,
  onMarkSigned,
  onRestore,
  showOwner = false,
  view,
}) => {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetching } =
    useDocumentsQuery(query);
  const loaderRef = React.useRef<HTMLDivElement | null>(null);
  const lastCursor = data?.pages[data.pages.length - 1]?.nextCursor;
  const hasMore = Boolean(lastCursor);

  React.useEffect(() => {
    if (!loaderRef.current || !hasNextPage || !hasMore || isFetching) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void fetchNextPage();
      }
    });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, hasNextPage, isFetching]);

  if (isLoading) {
    return <DocumentGallerySkeleton view={view} count={2} />;
  }

  if (isError || !data) {
    return <p>Unable to load documents.</p>;
  }

  const documents = data.pages.flatMap((page) => page.items);

  return (
    <section>
      <DocumentGallery
        documents={documents}
        onOpen={onOpen}
        onDelete={onDelete}
        onMarkSigned={onMarkSigned}
        onRestore={onRestore}
        showOwner={showOwner}
        view={view}
      />
      {isFetching ? <DocumentGallerySkeleton view={view} count={2} /> : null}
      {hasMore ? <div ref={loaderRef} /> : null}
      {hasMore ? (
        <button className={buttonClass} type="button" onClick={() => void fetchNextPage()}>
          {isFetching ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </section>
  );
};

const DocumentGallerySkeleton: React.FC<{ view?: "grid" | "list"; count: number }> = ({
  view = "grid",
  count,
}) => {
  const isGrid = view === "grid";
  return (
    <>
      <style>{`
        @keyframes skeletonPulse {
          0% { opacity: 0.65; }
          50% { opacity: 1; }
          100% { opacity: 0.65; }
        }
      `}</style>
      <section
      className={css({
        display: "grid",
        gap: "3",
        gridTemplateColumns: isGrid
          ? {
              base: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))",
              xl: "repeat(4, minmax(0, 1fr))",
            }
          : "1fr",
      })}
      role="status"
      aria-live="polite"
    >
        {Array.from({ length: count }).map((_, index) => {
          const faded = index === 1;
          return (
            <div
              key={`doc-skeleton-${index}`}
              className={css({
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
                borderRadius: "lg",
                padding: "3",
                bg: "surfaceAlt",
                display: "grid",
                gap: "2",
                gridTemplateColumns: isGrid ? "1fr" : "var(--sizes-thumb) 1fr",
                alignItems: "start",
                opacity: faded ? 0.45 : 1,
              })}
            >
              <div
                className={css({
                  height: "thumb",
                  borderRadius: "md",
                  bg: "highlight",
                  animation: "skeletonPulse 1.6s ease-in-out infinite",
                })}
              />
              <div className={css({ display: "grid", gap: "2" })}>
                <div
                  className={css({
                    background: "highlight",
                    borderRadius: "md",
                    height: "4",
                    width: "70%",
                    animation: "skeletonPulse 1.6s ease-in-out infinite",
                  })}
                />
                <div
                  className={css({
                    background: "highlight",
                    borderRadius: "md",
                    height: "4",
                    width: "40%",
                    animation: "skeletonPulse 1.6s ease-in-out infinite",
                  })}
                />
                <div
                  className={css({
                    background: "highlight",
                    borderRadius: "md",
                    height: "4",
                    width: "60%",
                    animation: "skeletonPulse 1.6s ease-in-out infinite",
                  })}
                />
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
};

export type DocumentViewerProps = {
  document: DocumentRef;
  showWatermark?: boolean;
  watermarkText?: string;
  showOwner?: boolean;
  onPreviewClick?: (url: string, mimeType?: string) => void;
};

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  showWatermark,
  watermarkText,
  showOwner = false,
  onPreviewClick,
}) => {
  const shouldShowWatermark = Boolean(showWatermark && watermarkText && document.previewUrl);
  return (
    <section
      className={css({
        display: "grid",
        gap: "2",
      })}
    >
      <header>
        <h2>{document.title}</h2>
        {showWatermark ? (
          <p>{watermarkText ?? "For Review"}</p>
        ) : null}
        {showOwner && document.ownerEmail ? (
          <p>Uploaded by: {document.ownerEmail}</p>
        ) : null}
      </header>
      <div>
        {document.previewUrl && document.mimeType.startsWith("image") ? (
          <div
            className={css({
              position: "relative",
              borderRadius: "md",
              overflow: "hidden",
            })}
          >
            <img
              src={document.previewUrl}
              alt={document.title}
              className={css({
                width: "100%",
                borderRadius: "md",
                cursor: onPreviewClick ? "zoom-in" : "default",
                display: "block",
              })}
              onClick={() =>
                document.previewUrl
                  ? onPreviewClick?.(document.previewUrl, document.mimeType)
                  : null
              }
            />
            {shouldShowWatermark ? (
              <div
                className={css({
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none",
                })}
              >
                <span
                  className={css({
                    fontSize: "lg",
                    fontWeight: "600",
                    color: "accent",
                    opacity: 0.2,
                    transform: "rotate(-18deg)",
                    textAlign: "center",
                    padding: "3",
                  })}
                >
                  {watermarkText}
                </span>
              </div>
            ) : null}
          </div>
        ) : document.previewUrl && document.mimeType.includes("pdf") ? (
          <div
            className={css({
              position: "relative",
              width: "100%",
              borderRadius: "md",
              cursor: onPreviewClick ? "zoom-in" : "default",
            })}
            onClick={() =>
              document.previewUrl
                ? onPreviewClick?.(document.previewUrl, document.mimeType)
                : null
            }
          >
            <object
              data={document.previewUrl}
              type="application/pdf"
              aria-label={`${document.title} PDF preview`}
              className={css({
                width: "100%",
                height: "viewerHeight",
                borderRadius: "md",
                background: "highlight",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
                pointerEvents: "none",
              })}
            >
              <p>PDF preview unavailable.</p>
            </object>
            {shouldShowWatermark ? (
              <div
                className={css({
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none",
                })}
              >
                <span
                  className={css({
                    fontSize: "lg",
                    fontWeight: "600",
                    color: "accent",
                    opacity: 0.2,
                    transform: "rotate(-18deg)",
                    textAlign: "center",
                    padding: "3",
                  })}
                >
                  {watermarkText}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <p>Preview URL: {document.previewUrl ?? "Not available"}</p>
        )}
        {document.categories?.length ? (
          <p>Category: {document.categories.join(", ")}</p>
        ) : null}
        {document.tags?.length ? <p>Tags: {document.tags.join(", ")}</p> : null}
        {document.entityLinks?.length ? (
          <p>
            Links:{" "}
            {document.entityLinks
              .map((link) => `${link.type}:${link.id}`)
              .join(", ")}
          </p>
        ) : null}
        {document.docDate ? <p>Date: {formatDate(document.docDate)}</p> : null}
        {document.notes ? <p>Notes: {document.notes}</p> : null}
      </div>
    </section>
  );
};


