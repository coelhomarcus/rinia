import { describe, expect, test } from "bun:test";
import { gitBranchName } from "../src/features/issues/lib/git-branch-name";

describe("gitBranchName", () => {
    test("joins the user, the identifier and a slug of the title", () => {
        expect(gitBranchName("Ana", "RIN-12", "Fix the login page")).toBe("ana/rin-12-fix-the-login-page");
    });

    test("drops accents and punctuation from the title", () => {
        expect(gitBranchName("ana", "RIN-3", "Correção: botão “Salvar”!")).toBe("ana/rin-3-correcao-botao-salvar");
    });

    test("leaves out the user when there is none, and the slug when the title has no letters", () => {
        expect(gitBranchName(undefined, "RIN-4", "Add search")).toBe("rin-4-add-search");
        expect(gitBranchName("ana", "RIN-5", "???")).toBe("ana/rin-5");
    });

    test("keeps the slug short without ending on a dash", () => {
        const branch = gitBranchName(undefined, "RIN-6", "a ".repeat(60));
        expect(branch.length).toBeLessThanOrEqual("rin-6-".length + 48);
        expect(branch.endsWith("-")).toBe(false);
    });
});
