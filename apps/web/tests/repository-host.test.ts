import { describe, expect, test } from "bun:test";
import { Github, Gitlab } from "@makeplane/propel/icons";
import { AppIcons } from "../src/components/foundations/icons";
import { repositoryHost } from "../src/features/projects/lib/repository";

describe("repositoryHost", () => {
    test("names the hosts we know and uses their marks where we have one", () => {
        expect(repositoryHost("https://github.com/coelhomarcus/rinia")).toEqual({ name: "GitHub", icon: Github });
        expect(repositoryHost("https://www.github.com/a/b")).toEqual({ name: "GitHub", icon: Github });
        expect(repositoryHost("https://gitlab.com/group/project")).toEqual({ name: "GitLab", icon: Gitlab });
        expect(repositoryHost("https://gitlab.empresa.com.br/time/app")).toEqual({ name: "GitLab", icon: Gitlab });
        expect(repositoryHost("https://bitbucket.org/team/repo")).toEqual({ name: "Bitbucket", icon: AppIcons.ExternalLink });
        expect(repositoryHost("https://codeberg.org/user/repo").name).toBe("Codeberg");
        expect(repositoryHost("https://dev.azure.com/org/project").name).toBe("Azure DevOps");
    });

    test("anything else, or not a link, gets the generic arrow and no name", () => {
        for (const url of ["https://git.example.com/repo", "https://notgithub.com/x", "https://github.io/x", "not a url", "", null, undefined]) {
            expect(repositoryHost(url)).toEqual({ name: null, icon: AppIcons.ExternalLink });
        }
    });
});
