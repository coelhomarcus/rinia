import { createFavoriteSchema } from "@rinia/shared";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { addFavorite, listFavorites, removeFavorite, restoreFavorite } from "./favorites.service";

export const list = asyncHandler(async (req, res) => {
    res.json({ favorites: await listFavorites(req.user!.sub) });
});

export const create = asyncHandler(async (req, res) => {
    const input = createFavoriteSchema.parse(req.body);
    res.status(201).json({ favorite: await addFavorite(req.user!.sub, input) });
});

export const remove = asyncHandler<{ favoriteId: string }>(async (req, res) => {
    res.json(await removeFavorite(req.user!.sub, z.string().uuid().parse(req.params.favoriteId)));
});

export const restore = asyncHandler<{ favoriteId: string }>(async (req, res) => {
    const { deletedAt } = z.object({ deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await restoreFavorite(req.user!.sub, z.string().uuid().parse(req.params.favoriteId), new Date(deletedAt)));
});
