import { z } from "zod";
export declare const DocCategory: z.ZodEnum<["RECEIPT", "PRESCRIPTION", "ID", "BENEFICIARY_FORM", "OTHER"]>;
export declare const EntityLink: z.ZodObject<{
    type: z.ZodEnum<["CLAIM", "PROFILE", "DEPENDENT", "PLAN_YEAR"]>;
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
    id: string;
}, {
    type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
    id: string;
}>;
export declare const MetadataSchema: z.ZodObject<{
    title: z.ZodString;
    categories: z.ZodArray<z.ZodEnum<["RECEIPT", "PRESCRIPTION", "ID", "BENEFICIARY_FORM", "OTHER"]>, "many">;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    entityLinks: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["CLAIM", "PROFILE", "DEPENDENT", "PLAN_YEAR"]>;
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
        id: string;
    }, {
        type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
        id: string;
    }>, "many">;
    docDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    categories: ("RECEIPT" | "PRESCRIPTION" | "ID" | "BENEFICIARY_FORM" | "OTHER")[];
    tags: string[];
    entityLinks: {
        type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
        id: string;
    }[];
    docDate?: string | undefined;
    notes?: string | undefined;
}, {
    title: string;
    categories: ("RECEIPT" | "PRESCRIPTION" | "ID" | "BENEFICIARY_FORM" | "OTHER")[];
    entityLinks: {
        type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
        id: string;
    }[];
    tags?: string[] | undefined;
    docDate?: string | undefined;
    notes?: string | undefined;
}>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type DocumentRef = {
    id: string;
    latestVersionId: string | null;
    ownerId: string;
    categories: z.infer<typeof DocCategory>[];
    title: string;
    tags: string[];
    entityLinks: Array<{
        type: "CLAIM" | "PROFILE" | "DEPENDENT" | "PLAN_YEAR";
        id: string;
    }>;
    docDate?: string;
    notes?: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    annotations?: unknown;
    acl?: {
        canView: boolean;
        canEdit: boolean;
        canDelete: boolean;
    };
    versionStatus?: "PROCESSING" | "CLEAN" | "BLOCKED";
    previewUrl?: string;
};
//# sourceMappingURL=index.d.ts.map