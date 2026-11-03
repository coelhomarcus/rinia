/** Lowercase, without accents, so "situacao" finds "Situação". */
export function normalizeSearch(text: string) {
    return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** True when every word of the query appears somewhere in the text, in any order. */
export function matchesQuery(text: string, query: string) {
    const haystack = normalizeSearch(text);
    return normalizeSearch(query)
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => haystack.includes(term));
}
