import { Router } from "express";
import {
  createDocumentSchema,
  documentParamsSchema,
  shareWithGuestSchema,
  updateDocumentSchema,
} from "@rinia/shared";
import { asyncHandler } from "../../middleware/async-handler";
import { assertRole, roleOf } from "../../middleware/project-membership.middleware";
import { assertDocumentVisible } from "../../lib/guest-access";
import { z } from "zod";
import { listDocumentShares, shareDocument, unshareDocument } from "../shares/shares.service";
import { attachmentDisposition, documentMarkdown, markdownFilename } from "./document-export";
import * as service from "./documents.service";

/** The page's ids, after checking the requester may see it. A page a guest was not given is not found. */
async function visibleDocument(req: Parameters<typeof roleOf>[0]) {
  const params = documentParamsSchema.parse(req.params);
  await assertDocumentVisible(req.user!.sub, roleOf(req), params.documentId);
  return params;
}

// Mounted behind authentication and project membership in projects.routes.ts; each route checks what the role allows.
export const documentsRouter = Router({ mergeParams: true });
documentsRouter.get(
  "/",
  asyncHandler<{ projectId: string }>(async (req, res) => {
    res.json({ documents: await service.listDocuments(req.params.projectId, { userId: req.user!.sub, role: roleOf(req) }) });
  }),
);
documentsRouter.post(
  "/",
  asyncHandler<{ projectId: string }>(async (req, res) => {
    assertRole(req, "pages.write");
    res
      .status(201)
      .json({
        document: await service.createDocument(
          req.params.projectId,
          req.user!.sub,
          createDocumentSchema.parse(req.body),
        ),
      });
  }),
);
const exportQuerySchema = z.object({ format: z.literal("md").optional() });

documentsRouter.get(
  "/export",
  asyncHandler<{ projectId: string }>(async (req, res) => {
    assertRole(req, "pages.export");
    const file = await service.exportProjectZip(req.params.projectId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", attachmentDisposition(file.filename));
    res.send(file.body);
  }),
);
documentsRouter.get(
  "/:documentId/export",
  asyncHandler(async (req, res) => {
    const { projectId, documentId } = await visibleDocument(req);
    exportQuerySchema.parse({ format: req.query.format });
    const document = await service.getDocument(projectId, documentId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", attachmentDisposition(markdownFilename(document)));
    res.send(documentMarkdown(document.contentJson));
  }),
);
documentsRouter.get(
  "/:documentId",
  asyncHandler(async (req, res) => {
    const { projectId, documentId } = await visibleDocument(req);
    res.json({ document: await service.getDocument(projectId, documentId) });
  }),
);
documentsRouter.patch(
  "/:documentId",
  asyncHandler(async (req, res) => {
    assertRole(req, "pages.write");
    const { projectId, documentId } = documentParamsSchema.parse(req.params);
    res.json({
      document: await service.updateDocument(
        projectId,
        documentId,
        req.user!.sub,
        updateDocumentSchema.parse(req.body),
      ),
    });
  }),
);
documentsRouter.delete(
  "/:documentId",
  asyncHandler(async (req, res) => {
    const role = assertRole(req, "pages.write");
    const { projectId, documentId } = documentParamsSchema.parse(req.params);
    const result = await service.deleteDocument(
      projectId,
      documentId,
      req.user!.sub,
      role,
    );
    res.json(result);
  }),
);
documentsRouter.post(
  "/:documentId/restore",
  asyncHandler(async (req, res) => {
    assertRole(req, "pages.write");
    const { projectId, documentId } = documentParamsSchema.parse(req.params);
    const { deletedAt } = z.object({ deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await service.restoreDocument(projectId, documentId, new Date(deletedAt)));
  }),
);

// Guests see a page only once someone shares it with them.
documentsRouter.get(
  "/:documentId/shares",
  asyncHandler(async (req, res) => {
    assertRole(req, "shares.manage");
    const { projectId, documentId } = documentParamsSchema.parse(req.params);
    res.json({ shares: await listDocumentShares(projectId, documentId) });
  }),
);
documentsRouter.post(
  "/:documentId/shares",
  asyncHandler(async (req, res) => {
    assertRole(req, "shares.manage");
    const { projectId, documentId } = documentParamsSchema.parse(req.params);
    const { userId } = shareWithGuestSchema.parse(req.body);
    res.status(201).json({ share: await shareDocument(projectId, documentId, userId, req.user!.sub) });
  }),
);
documentsRouter.delete(
  "/:documentId/shares/:userId",
  asyncHandler(async (req, res) => {
    assertRole(req, "shares.manage");
    const { projectId, documentId } = documentParamsSchema.parse(req.params);
    await unshareDocument(projectId, documentId, z.string().uuid().parse(req.params.userId));
    res.status(204).send();
  }),
);
