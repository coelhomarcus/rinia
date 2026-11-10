import { can, createCategorySchema, updateCategorySchema } from "@rinia/shared";
import { roleOf } from "../../middleware/project-membership.middleware";
import { asyncHandler } from "../../middleware/async-handler";
import { createCategory, deleteCategory, listCategories, updateCategory } from "./categories.service";

export const list = asyncHandler<{ projectId: string }>(async (req, res) => {
    const categoryList = await listCategories(req.params.projectId);
    res.json({ categories: categoryList });
});

export const create = asyncHandler<{ projectId: string }>(async (req, res) => {
    const input = createCategorySchema.parse(req.body);
    const category = await createCategory(req.params.projectId, input, req.user!.sub);
    res.status(201).json({ category });
});

export const remove = asyncHandler<{ projectId: string; categoryId: string }>(async (req, res) => {
    await deleteCategory(req.params.projectId, req.params.categoryId, {
        userId: req.user!.sub,
        canManageAll: can(roleOf(req), "labels.manage"),
    });
    res.status(204).send();
});

export const update = asyncHandler<{ projectId: string; categoryId: string }>(async (req, res) => {
    const input = updateCategorySchema.parse(req.body);
    const category = await updateCategory(req.params.projectId, req.params.categoryId, input, {
        userId: req.user!.sub,
        canManageAll: can(roleOf(req), "labels.manage"),
    });
    res.json({ category });
});
