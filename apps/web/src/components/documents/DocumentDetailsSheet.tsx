import * as React from "react";
import { css } from "styled-system/css";
import { badge, chip, iconButton } from "styled-system/recipes";
import type { DocumentRef, Metadata } from "@league/types";
import { DocumentViewer, MetadataForm } from "@league/upload-ui";
import { formatDateTime, formatRelativeTime } from "../../utils/date";

type DocumentDetailsSheetProps = {
  document: DocumentRef;
  previewUrl: string | null;
  previewLoading: boolean;
  watermarkText: string | null;
  onClose: () => void;
  onOpenPreview: (url: string, mimeType: string) => void;
  onDelete?: (doc: DocumentRef) => void;
  onMarkSigned?: (doc: DocumentRef) => void;
  onRestore?: (doc: DocumentRef) => void;
  onMetadataSubmit: (metadata: Metadata) => void;
  selectedMetadata: Metadata | null;
  showOwner?: boolean;
  onMetadataChange?: (metadata: Metadata) => void;
};

export const DocumentDetailsSheet: React.FC<DocumentDetailsSheetProps> = ({
  document,
  previewUrl,
  previewLoading,
  watermarkText,
  onClose,
  onOpenPreview,
  onDelete,
  onMarkSigned,
  onRestore,
  onMetadataSubmit,
  selectedMetadata,
  showOwner,
  onMetadataChange,
}) => {
  const statusLabel = document.deletedAt ? "DELETED" : document.status ?? "ACTIVE";
  const statusTone =
    document.deletedAt ? "danger" : document.status === "SIGNED" ? "success" : "info";
  return (
      <aside
        className={css({
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "420px",
          background: "surface",
        borderLeftWidth: "thin",
        borderLeftStyle: "solid",
        borderLeftColor: "borderSubtle",
        boxShadow: "card",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
      })}
      aria-label="Document details"
    >
      <header
        className={css({
          borderBottomWidth: "thin",
          borderBottomStyle: "solid",
          borderBottomColor: "borderSubtle",
          padding: "3 4",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <div>
          <p className={css({ margin: 0, fontSize: "sm", color: "textMuted" })}>
            Document details
          </p>
          <h3 className={css({ margin: 0, fontSize: "lg" })}>{document.title}</h3>
        </div>
        <button
          type="button"
          className={iconButton()}
          aria-label="Close details"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div
        className={css({
          flex: 1,
          overflowY: "auto",
          padding: "4",
          display: "grid",
          gap: "4",
        })}
      >
        <section
          className={css({
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "borderSubtle",
            borderRadius: "lg",
            padding: "3",
            background: "surfaceAlt",
          })}
        >
          {previewLoading ? (
            <div
              className={css({
                height: "200px",
                borderRadius: "lg",
                background: "highlight",
              })}
              role="status"
              aria-live="polite"
            />
          ) : (
            <DocumentViewer
              document={{ ...document, previewUrl: previewUrl ?? undefined }}
              showWatermark={document.status === "SIGNED"}
              watermarkText={watermarkText ?? undefined}
              showOwner={showOwner}
              onPreviewClick={(url, mimeType) =>
                onOpenPreview(url, mimeType ?? document.mimeType)
              }
            />
          )}
        </section>
        <section className={css({ display: "grid", gap: "2" })}>
          <span className={badge({ tone: statusTone as "danger" | "success" | "info" })}>
            {statusLabel}
          </span>
          <div className={css({ display: "grid", gap: "1" })}>
            <p className={css({ margin: 0, fontSize: "xs", color: "textMuted" })}>
              Category
            </p>
            <p className={css({ margin: 0, fontWeight: "600" })}>
              {document.categories?.join(", ") ?? "Uncategorized"}
            </p>
          </div>
          <div className={css({ display: "grid", gap: "1" })}>
            <p className={css({ margin: 0, fontSize: "xs", color: "textMuted" })}>Tags</p>
            <div className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
              {(document.tags ?? []).map((tag) => (
                <span key={tag} className={chip()}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {document.entityLinks?.length ? (
            <div className={css({ display: "grid", gap: "1" })}>
              <p className={css({ margin: 0, fontSize: "xs", color: "textMuted" })}>
                Linked to
              </p>
              <p className={css({ margin: 0 })}>
                {document.entityLinks
                  .map((link) => `${link.type}:${link.id}`)
                  .join(", ")}
              </p>
            </div>
          ) : null}
          <div className={css({ display: "grid", gap: "1" })}>
            <p className={css({ margin: 0, fontSize: "xs", color: "textMuted" })}>
              Uploaded by
            </p>
            <p className={css({ margin: 0 })}>
              {document.ownerEmail ?? "Unknown"} ·{" "}
              <time title={document.createdAt}>
                {formatRelativeTime(document.createdAt)} ({formatDateTime(document.createdAt)})
              </time>
            </p>
          </div>
          {document.docDate ? (
            <div className={css({ display: "grid", gap: "1" })}>
              <p className={css({ margin: 0, fontSize: "xs", color: "textMuted" })}>
                Document date
              </p>
              <p className={css({ margin: 0 })}>{formatDateTime(document.docDate)}</p>
            </div>
          ) : null}
        </section>
        {document.acl?.canEdit && selectedMetadata ? (
          <section
            className={css({
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "borderSubtle",
              borderRadius: "lg",
              padding: "3",
            })}
          >
            <h4 className={css({ margin: 0, fontSize: "md" })}>Metadata</h4>
            <MetadataForm
              value={selectedMetadata}
              allowEntityLinkEdit={false}
              showSubmit={false}
              onSubmit={onMetadataSubmit}
              onChange={onMetadataChange}
            />
          </section>
        ) : null}
        <section
          className={css({
            display: "flex",
            gap: "2",
            flexWrap: "wrap",
            justifyContent: "space-between",
            borderTopWidth: "thin",
            borderTopStyle: "solid",
            borderTopColor: "borderSubtle",
            paddingTop: "3",
          })}
        >
            <button
              type="button"
              className={css({
                borderRadius: "full",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "border",
                padding: "2 5",
                fontSize: "xs",
                background: "surfaceRaised",
              })}
              onClick={() => previewUrl && onOpenPreview(previewUrl, document.mimeType)}
              disabled={!previewUrl}
            >
              Open preview
            </button>
          {onDelete && document.acl?.canDelete ? (
            <button
              type="button"
              className={css({
                borderRadius: "full",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "danger",
                padding: "2 5",
                fontSize: "xs",
                background: "danger",
                color: "surface",
              })}
              onClick={() => onDelete(document)}
            >
              Delete document
            </button>
          ) : null}
          {document.deletedAt && onRestore ? (
            <button
              type="button"
              className={css({
                borderRadius: "full",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "accentSecondary",
                padding: "2 5",
                fontSize: "xs",
              })}
              onClick={() => onRestore(document)}
            >
              Restore
            </button>
          ) : null}
          {!document.deletedAt && document.acl?.canEdit && document.status !== "SIGNED" && onMarkSigned ? (
            <button
              type="button"
              className={css({
                borderRadius: "full",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "accentPrimary",
                padding: "2 5",
                fontSize: "xs",
                background: "accentPrimary",
                color: "surface",
              })}
              onClick={() => onMarkSigned(document)}
            >
              Mark signed
            </button>
          ) : null}
        </section>
      </div>
    </aside>
  );
};
