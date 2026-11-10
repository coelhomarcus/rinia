/** Same shape as Linear's branch names: `user/key-12-short-title`. */
export function gitBranchName(username: string | undefined, identifier: string, title: string) {
    const slug = title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .replace(/-+$/g, "");
    const branch = [identifier.toLowerCase(), slug].filter(Boolean).join("-");
    return username ? `${username.toLowerCase()}/${branch}` : branch;
}
