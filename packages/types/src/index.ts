import { z } from "zod";

export const DocCategory = z.enum([
  "RECEIPT",
  "PRESCRIPTION",
  "ID",
  "BENEFICIARY_FORM",
  "OTHER",
]);

export const EntityLink = z.object({
  type: z.enum(["CLAIM", "PROFILE", "DEPENDENT", "PLAN_YEAR"]),
  id: z.string().min(1),
});

export const MetadataSchema = z.object({
  title: z.string().min(1).max(120),
  categories: z.array(DocCategory).min(1),
  tags: z.array(z.string().min(1)).max(25).default([]),
  entityLinks: z.array(EntityLink).max(10),
  docDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export type DocumentRef = {
  id: string;
  latestVersionId: string | null;
  ownerId: string;
  ownerEmail?: string;
  status: "ACTIVE" | "SIGNED";
  categories: z.infer<typeof DocCategory>[];
  title: string;
  tags: string[];
  entityLinks: Array<{ type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR"; id: string }>;
  docDate?: string;
  notes?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  annotations?: unknown;
  acl?: { canView: boolean; canEdit: boolean; canDelete: boolean };
  versionStatus?: "PROCESSING" | "CLEAN" | "BLOCKED";
  previewUrl?: string;
};
