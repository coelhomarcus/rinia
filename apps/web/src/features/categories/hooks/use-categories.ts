import type { CreateCategoryInput, UpdateCategoryInput } from "@rinia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../api";

export function categoriesQueryKey(projectId: string) {
    return ["projects", projectId, "categories"] as const;
}

export function useCategories(projectId: string) {
    return useQuery({
        queryKey: categoriesQueryKey(projectId),
        queryFn: () => listCategories(projectId),
        enabled: !!projectId,
    });
}

export function useCreateCategory(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateCategoryInput) => createCategory(projectId, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoriesQueryKey(projectId) });
        },
    });
}

export function useDeleteCategory(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (categoryId: string) => deleteCategory(projectId, categoryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: categoriesQueryKey(projectId) });
        },
    });
}

export function useUpdateCategory(projectId: string) {
    const queryClient = useQueryClient();
    const key = categoriesQueryKey(projectId);
    return useMutation({
        mutationFn: ({ categoryId, input }: { categoryId: string; input: UpdateCategoryInput }) => updateCategory(projectId, categoryId, input),
        onMutate: async ({ categoryId, input }) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<Awaited<ReturnType<typeof listCategories>>>(key);
            queryClient.setQueryData<Awaited<ReturnType<typeof listCategories>>>(key, (current) =>
                current?.map((category) => (category.id === categoryId ? { ...category, ...input } : category)),
            );
            return { previous };
        },
        onError: (_error, _variables, context) => queryClient.setQueryData(key, context?.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
}
