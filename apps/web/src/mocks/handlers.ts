import { http, HttpResponse } from "msw";
import type { DocumentRef } from "@league/types";

const seedDocs: DocumentRef[] = [
  {
    id: "doc_1",
    latestVersionId: "ver_1",
    ownerId: "member_123",
    ownerEmail: "user@test.com",
    status: "ACTIVE",
    categories: ["RECEIPT"],
    title: "2024-02 Prescription",
    tags: ["rx"],
    entityLinks: [{ type: "CLAIM", id: "claim_123" }],
    docDate: new Date().toISOString(),
    notes: "Rx scan from mobile upload.",
    mimeType: "application/pdf",
    sizeBytes: 1024 * 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    acl: { canView: true, canEdit: true, canDelete: true },
    versionStatus: "CLEAN",
  },
  {
    id: "doc_2",
    latestVersionId: "ver_2",
    ownerId: "member_123",
    ownerEmail: "user@test.com",
    status: "ACTIVE",
    categories: ["ID"],
    title: "Driver License",
    tags: ["id"],
    entityLinks: [{ type: "PROFILE", id: "member_123" }],
    docDate: new Date().toISOString(),
    notes: "Government ID for verification.",
    mimeType: "image/jpeg",
    sizeBytes: 1024 * 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    acl: { canView: true, canEdit: true, canDelete: true },
    versionStatus: "CLEAN",
  },
  {
    id: "doc_3",
    latestVersionId: "ver_3",
    ownerId: "member_123",
    ownerEmail: "user@test.com",
    status: "ACTIVE",
    categories: ["RECEIPT"],
    title: "Physio Receipt",
    tags: ["physio"],
    entityLinks: [{ type: "CLAIM", id: "claim_456" }],
    docDate: new Date().toISOString(),
    notes: "Receipts batch for claim 456.",
    mimeType: "application/pdf",
    sizeBytes: 1024 * 240,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    acl: { canView: true, canEdit: true, canDelete: true },
    versionStatus: "CLEAN",
  },
];

type UploadInitBody = {
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  categories?: DocumentRef["categories"];
  tags?: string[];
  entityLinks?: DocumentRef["entityLinks"];
  docDate?: string;
  notes?: string;
  documentId?: string;
};

const uploads = new Map<string, UploadInitBody>();

const getOrigin = (url: string): string => new URL(url).origin;
const getUploadIdFromUrl = (url: string): string => {
  const match = url.match(/\/uploads\/([^/]+)/);
  return match ? match[1] : "";
};
const encodeCursor = (doc: DocumentRef) =>
  btoa(`${doc.createdAt}|${doc.id}`);
const parseCursor = (cursor: string) => {
  const decoded = atob(cursor);
  const [createdAt, id] = decoded.split("|");
  return { createdAt, id };
};

export const handlers = [
  http.get(/\/v1\/documents$/, ({ request }) => {
    if (request.headers.get("x-fail-documents") === "1") {
      return new HttpResponse("Document fetch failed", { status: 500 });
    }
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const search = url.searchParams.get("q")?.toLowerCase();
    const category = url.searchParams.get("category");
    const linkType = url.searchParams.get("linkType");
    const linkId = url.searchParams.get("linkId");
    const limit = Number(url.searchParams.get("limit") ?? "6");
    let filtered = [...seedDocs];

    if (search) {
      filtered = filtered.filter((doc) => {
        const tagMatch = doc.tags?.some((tag) =>
          tag.toLowerCase().includes(search)
        );
        return (
          doc.title.toLowerCase().includes(search) ||
          doc.mimeType.toLowerCase().includes(search) ||
          tagMatch
        );
      });
    }
    if (category) {
      filtered = filtered.filter((doc) => doc.categories?.includes(category));
    }
    if (linkType && linkId) {
      filtered = filtered.filter((doc) =>
        doc.entityLinks?.some((link) => link.type === linkType && link.id === linkId)
      );
    }

    filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (cursor) {
      const parsed = parseCursor(cursor);
      filtered = filtered.filter((doc) => {
        if (doc.createdAt === parsed.createdAt) {
          return doc.id < parsed.id;
        }
        return new Date(doc.createdAt) < new Date(parsed.createdAt);
      });
    }

    const items = filtered.slice(0, limit);
    const nextCursor =
      filtered.length > limit ? encodeCursor(items[items.length - 1]) : undefined;
    return HttpResponse.json({ items, nextCursor });
  }),
  http.get(/\/v1\/documents\/([^/]+)$/, ({ request }) => {
    const idMatch = request.url.match(/\/v1\/documents\/([^/]+)$/);
    const id = idMatch ? idMatch[1] : "";
    const doc = seedDocs.find((item) => item.id === id);
    if (!doc) {
      return new HttpResponse("Document not found", { status: 404 });
    }
    return HttpResponse.json(doc);
  }),
  http.patch(/\/v1\/documents\/([^/]+)$/, async ({ request }) => {
    const idMatch = request.url.match(/\/v1\/documents\/([^/]+)$/);
    const id = idMatch ? idMatch[1] : "";
    const body = (await request.json()) as {
      title?: string;
      categories?: DocumentRef["categories"];
      tags?: string[];
      docDate?: string;
      notes?: string;
    };
    const index = seedDocs.findIndex((doc) => doc.id === id);
    if (index === -1) {
      return new HttpResponse("Document not found", { status: 404 });
    }
    const existing = seedDocs[index];
    const updated: DocumentRef = {
      ...existing,
      title: body.title ?? existing.title,
      categories: body.categories ?? existing.categories,
      tags: body.tags ?? existing.tags,
      docDate: body.docDate ?? existing.docDate,
      notes: body.notes ?? existing.notes,
      updatedAt: new Date().toISOString(),
    };
    seedDocs[index] = updated;
    return HttpResponse.json(updated);
  }),
  http.get(/\/v1\/documents\/([^/]+)\/preview-url$/, ({ request }) => {
    const idMatch = request.url.match(/\/v1\/documents\/([^/]+)\/preview-url$/);
    const id = idMatch ? idMatch[1] : "";
    const doc = seedDocs.find((item) => item.id === id);
    if (!doc) {
      return new HttpResponse("Document not found", { status: 404 });
    }
    return HttpResponse.json({
      url: `https://example.com/preview/${doc.id}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }),
  http.post(/\/v1\/uploads$/, async ({ request }) => {
    if (request.headers.get("x-fail-uploads") === "1") {
      return new HttpResponse("Upload init failed", { status: 500 });
    }
    const body = (await request.json()) as UploadInitBody;
    const uploadId = `ver_${Date.now()}`;
    const documentId = `doc_${Date.now()}`;
    uploads.set(uploadId, { ...body, documentId });

    const origin = getOrigin(request.url);
    const parts = Array.from({ length: 3 }, (_, i) => ({
      partNumber: i + 1,
      url: `${origin}/uploads/${uploadId}/parts/${i + 1}`,
    }));

    const now = new Date().toISOString();
    const newDoc: DocumentRef = {
      id: documentId,
      latestVersionId: null,
      ownerId: "member_123",
      ownerEmail: "user@test.com",
      status: "ACTIVE",
      categories: body.categories ?? ["OTHER"],
      title: body.fileName ?? "Uploaded document",
      tags: body.tags ?? [],
      entityLinks: body.entityLinks ?? [{ type: "PROFILE", id: "member_123" }],
      docDate: body.docDate,
      notes: body.notes,
      mimeType: body.mimeType ?? "application/octet-stream",
      sizeBytes: body.sizeBytes ?? 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      acl: { canView: true, canEdit: true, canDelete: true },
      versionStatus: "PROCESSING",
    };
    seedDocs.unshift(newDoc);

    return HttpResponse.json({
      uploadId,
      engine: "multipart",
      parts,
      objectKey: `documents/member_123/${uploadId}`,
    });
  }),
  http.post(/\/v1\/uploads\/([^/]+)\/complete$/, async ({ request }) => {
    if (request.headers.get("x-fail-uploads") === "1") {
      return new HttpResponse("Upload complete failed", { status: 500 });
    }
    const uploadId = getUploadIdFromUrl(request.url);
    const init = uploads.get(uploadId);
    const documentId = init?.documentId ?? `doc_${uploadId}`;
    const index = seedDocs.findIndex((doc) => doc.id === documentId);
    if (index !== -1) {
      seedDocs[index] = {
        ...seedDocs[index],
        latestVersionId: uploadId,
        updatedAt: new Date().toISOString(),
        versionStatus: "PROCESSING",
      };
    }
    return HttpResponse.json({
      documentId,
      versionId: uploadId,
      status: "processing",
    });
  }),
  http.put(/\/uploads\/([^/]+)\/parts\/(\d+)$/, ({ request }) => {
    if (request.headers.get("x-fail-uploads") === "1") {
      return new HttpResponse("Upload part failed", { status: 500 });
    }
    return new HttpResponse(null, {
      status: 200,
      headers: { ETag: `"mock-etag-${Date.now()}"` },
    });
  }),
];
