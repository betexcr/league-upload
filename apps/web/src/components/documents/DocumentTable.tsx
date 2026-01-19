import * as React from "react";
import { css } from "styled-system/css";
import { badge, chip, iconButton } from "styled-system/recipes";
import type { DocumentRef } from "@league/types";
import { formatRelativeTime } from "../../utils/date";

type DocumentTableProps = {
  documents: DocumentRef[];
  loading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  filtersActive: boolean;
  onOpen: (doc: DocumentRef) => void;
  onUploadClick: () => void;
};

const loaderClass = css({
  display: "flex",
  justifyContent: "center",
  padding: "4",
});

const resultBadgeClass = css({
  fontSize: "xs",
  color: "textSecondary",
});

const tableWrapperClass = css({
  background: "surface",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "borderSubtle",
  borderRadius: "xl",
  overflow: "hidden",
  boxShadow: "card",
});

const tableHeaderClass = css({
  background: "surfaceRaised",
  padding: "3",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "borderSubtle",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "3",
});

const bulkBarClass = css({
  background: "surfaceAlt",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "borderSubtle",
  padding: "3 4",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const emptyStateClass = css({
  padding: "6",
  textAlign: "center",
  display: "grid",
  gap: "3",
});

const cellClass = css({
  padding: "3 4",
  fontSize: "sm",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "borderSubtle",
});

const headerCellClass = css({
  padding: "3 4",
  textAlign: "left",
  fontSize: "xs",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "textMuted",
});

const selectionCheckboxClass = css({
  width: "4",
  height: "4",
});

const allowedTags = 2;

const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  loading,
  isFetching,
  hasMore,
  onLoadMore,
  selectedIds,
  toggleSelection,
  clearSelection,
  filtersActive,
  onOpen,
  onUploadClick,
}) => {
  const loaderRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!loaderRef.current || !hasMore || loading || isFetching) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void onLoadMore();
      }
    });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, isFetching, onLoadMore]);

  const selectedCount = selectedIds.size;

  if (!loading && !documents.length) {
    return (
      <div className={emptyStateClass}>
        <p className={css({ margin: 0, fontSize: "lg", fontWeight: "600" })}>
          No documents yet.
        </p>
        <p className={css({ margin: 0, fontSize: "sm", color: "textMuted" })}>
          Upload a document to start tracking claims and profiles.
        </p>
        <button
          className={css({
            borderRadius: "full",
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "accentPrimary",
            padding: "3 6",
            fontSize: "sm",
            fontWeight: "600",
            background: "accentPrimary",
            color: "surface",
          })}
          type="button"
          onClick={onUploadClick}
        >
          Upload documents
        </button>
      </div>
    );
  }

  return (
    <div className={tableWrapperClass}>
      <div className={tableHeaderClass}>
        <div>
          <p className={css({ margin: 0, fontSize: "lg", fontWeight: "600" })}>
            Documents
          </p>
          <p className={css({ margin: 0, fontSize: "sm", color: "textMuted" })}>
            Showing {documents.length} documents
            {filtersActive ? " · Filters applied" : ""}
          </p>
        </div>
        <span className={resultBadgeClass} aria-live="polite">
          {isFetching ? "Updating…" : `${documents.length} visible`}
        </span>
      </div>
      {selectedCount ? (
        <div className={bulkBarClass}>
          <span>{selectedCount} selected</span>
          <button
            type="button"
            className={css({
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              borderRadius: "full",
              padding: "2 5",
              fontSize: "xs",
              background: "surfaceRaised",
            })}
            onClick={clearSelection}
          >
            Clear selection
          </button>
        </div>
      ) : null}
      <table className={css({ width: "100%", borderCollapse: "collapse" })}>
        <thead>
          <tr>
            <th className={headerCellClass}>
              <span className={selectionCheckboxClass} />
            </th>
            <th className={headerCellClass}>Document</th>
            <th className={headerCellClass}>Category</th>
            <th className={headerCellClass}>Status</th>
            <th className={headerCellClass}>Linked to</th>
            <th className={headerCellClass}>Tags</th>
            <th className={headerCellClass}>Uploaded by</th>
            <th className={headerCellClass}>Uploaded at</th>
            <th className={headerCellClass} />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  {Array.from({ length: 9 }).map((__, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cellClass}
                      style={{ minHeight: 40 }}
                    >
                      <div
                        className={css({
                          height: "1.5rem",
                          background: "highlight",
                          borderRadius: "md",
                        })}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : documents.map((doc) => {
                const selected = selectedIds.has(doc.id);
                const linked = doc.entityLinks?.map((link) => `${link.type}:${link.id}`);
                const statusLabel = doc.deletedAt ? "DELETED" : doc.status ?? "ACTIVE";
                const statusTone = doc.deletedAt ? "danger" : doc.status === "SIGNED" ? "success" : "info";
                return (
                  <tr
                    key={doc.id}
                    className={css({
                      background: selected ? "surfaceAlt" : "surface",
                      cursor: "pointer",
                    })}
                    onClick={() => onOpen(doc)}
                  >
                    <td className={cellClass}>
                      <input
                        type="checkbox"
                        checked={selected}
                        className={selectionCheckboxClass}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleSelection(doc.id);
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className={cellClass}>
                      <div className={css({ fontWeight: "600" })}>{doc.title}</div>
                      <div className={css({ fontSize: "xs", color: "textMuted" })}>{doc.mimeType}</div>
                    </td>
                    <td className={cellClass}>{doc.categories?.[0] ?? "—"}</td>
                    <td className={cellClass}>
                      <span className={badge({ tone: statusTone === "danger" ? "danger" : statusTone === "success" ? "success" : "neutral" })}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className={cellClass}>{linked?.join(", ") ?? "—"}</td>
                    <td className={cellClass}>
                      <div className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
                        {(doc.tags ?? []).slice(0, allowedTags).map((tag) => (
                          <span key={tag} className={chip()}>
                            {tag}
                          </span>
                        ))}
                        {(doc.tags?.length ?? 0) > allowedTags ? (
                          <span className={css({ fontSize: "xs", color: "textMuted" })}>
                            +{(doc.tags?.length ?? 0) - allowedTags}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={cellClass}>{doc.ownerEmail ?? "Unknown"}</td>
                    <td className={cellClass}>
                      <time title={doc.createdAt ?? doc.docDate}>
                        {formatRelativeTime(doc.createdAt ?? doc.docDate)}
                      </time>
                    </td>
                    <td className={cellClass}>
                      <button
                        type="button"
                        className={iconButton()}
                        aria-label="Open actions"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(doc);
                        }}
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      {hasMore ? (
        <div className={loaderClass}>
          <button
            type="button"
            onClick={() => void onLoadMore()}
            className={css({
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "border",
              borderRadius: "full",
              padding: "2 5",
              background: "surfaceRaised",
              fontSize: "xs",
              cursor: "pointer",
            })}
            disabled={isFetching}
          >
            {isFetching ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
      <div ref={loaderRef} />
    </div>
  );
};

export { DocumentTable };
