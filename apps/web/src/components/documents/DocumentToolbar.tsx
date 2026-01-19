import * as React from "react";
import { css } from "styled-system/css";
import { button, input } from "styled-system/recipes";

const filterInputClass = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "borderSubtle",
  borderRadius: "md",
  padding: "3 4",
  fontSize: "sm",
  background: "surface",
  minWidth: "200px",
});

const selectClass = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "borderSubtle",
  borderRadius: "md",
  padding: "3 4",
  fontSize: "sm",
  background: "surface",
});

export type DocumentStatusFilter = "ALL" | "ACTIVE" | "SIGNED" | "DELETED";

type DocumentToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  ownerFilter: string;
  onOwnerFilterChange: (value: string) => void;
  statusFilter: DocumentStatusFilter;
  onStatusFilterChange: (value: DocumentStatusFilter) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  resultCount: number;
  isAgent?: boolean;
};

export const DocumentToolbar: React.FC<DocumentToolbarProps> = ({
  search,
  onSearchChange,
  ownerFilter,
  onOwnerFilterChange,
  statusFilter,
  onStatusFilterChange,
  filtersActive,
  onClearFilters,
  resultCount,
  isAgent,
}) => {
  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onStatusFilterChange(event.target.value as DocumentStatusFilter);
  };

  return (
    <div
      className={css({
        display: "grid",
        gap: "4",
        padding: "0",
      })}
    >
      <div
        className={css({
          display: "grid",
          gap: "3",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        })}
      >
        <label className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
          <span className={css({ fontSize: "xs", color: "textMuted", textTransform: "uppercase", letterSpacing: "0.12em" })}>
            Search
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search documents"
            className={input()}
          />
        </label>
        {isAgent ? (
          <label className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
            <span className={css({ fontSize: "xs", color: "textMuted", textTransform: "uppercase", letterSpacing: "0.12em" })}>
              Uploader
            </span>
            <input
              type="text"
              value={ownerFilter}
              onChange={(event) => onOwnerFilterChange(event.target.value)}
              placeholder="Filter by email"
              className={input()}
            />
          </label>
        ) : null}
        <label className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
          <span className={css({ fontSize: "xs", color: "textMuted", textTransform: "uppercase", letterSpacing: "0.12em" })}>
            Status
          </span>
          <select value={statusFilter} onChange={handleStatusChange} className={selectClass}>
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SIGNED">Signed</option>
            <option value="DELETED">Deleted</option>
          </select>
        </label>
      </div>
      <fieldset
        className={css({
          borderWidth: "thin",
          borderStyle: "solid",
          borderColor: "borderSubtle",
          borderRadius: "lg",
          padding: "3 4",
          display: "grid",
          gap: "3",
          background: "surfaceRaised",
        })}
        disabled
        aria-label="Future filters (category, linked type, date range)"
        title="Coming soon"
      >
        <legend className={css({ fontSize: "xs", letterSpacing: "0.1em", textTransform: "uppercase", color: "textMuted" })}>
          Additional filters (coming soon)
        </legend>
        <div
          className={css({
            display: "grid",
            gap: "2",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          })}
        >
          <label className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
            <span className={css({ fontSize: "xs", color: "textMuted" })}>Category</span>
            <select className={selectClass}>
              <option>All categories</option>
              <option>Claims</option>
              <option>Profiles</option>
              <option>Receipts</option>
            </select>
          </label>
          <label className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
            <span className={css({ fontSize: "xs", color: "textMuted" })}>Linked to</span>
            <select className={selectClass}>
              <option>Claims / Profiles</option>
              <option>Claims only</option>
              <option>Profiles only</option>
            </select>
          </label>
          <label className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
            <span className={css({ fontSize: "xs", color: "textMuted" })}>Date range</span>
            <input type="date" className={filterInputClass} />
          </label>
        </div>
      </fieldset>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "3",
          flexWrap: "wrap",
        })}
      >
        <p className={css({ margin: 0, fontSize: "sm", color: "textMuted" })}>
          Showing {resultCount} document{resultCount === 1 ? "" : "s"}
        </p>
        {filtersActive ? (
          <button
            type="button"
            className={button({ variant: "ghost", tone: "neutral", size: "sm" })}
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
};
