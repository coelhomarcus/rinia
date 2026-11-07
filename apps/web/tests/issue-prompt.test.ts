import { describe, expect, test } from "bun:test";
import { markdownToTiptap, tiptapToMarkdown, type TiptapDocument } from "@rinia/shared";
import issueEn from "../src/i18n/resources/en/issue";
import menuEn from "../src/i18n/resources/en/contextMenu";
import issuePt from "../src/i18n/resources/pt-BR/issue";
import menuPt from "../src/i18n/resources/pt-BR/contextMenu";
import { buildIssuePrompt, type IssuePromptInput } from "../src/features/issues/lib/issue-prompt";

const todo = "31f0fcf2-1111-4111-8111-111111111111";
const done = "7e05a742-2222-4222-8222-222222222222";
const unknown = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const marcusId = "351dc47e-613f-4d06-8dda-7ec916a87a42";
const anaId = "11111111-2222-4333-8444-555555555555";
const labelId = "99999999-8888-4777-8666-555555555555";
const missingLabel = "12121212-3434-4545-8656-787878787878";
const parentId = "abababab-cdcd-4efe-8f0f-121212121212";
const otherId = "cdcdcdcd-efef-4012-8123-343434343434";
const relationId = "deadbeef-dead-4bee-8f00-000000000001";

const person = (id: string, name: string) => ({ id, name, username: name.toLowerCase().replace(" ", ""), avatarUrl: null });

const descriptionSource = `## O que verificar

- [x] Arquivos e módulos não importados
- [ ] Exports sem consumidores

Use \`web/\` e \`server/\`.

\`\`\`bash
echo "</Description>"
bun test
\`\`\`

| Área | Ação |
| --- | --- |
| web | revisar |

![diagrama](https://files.example/a.png)

Veja [a spec](https://example.com/spec).`;

function doc(text: string): TiptapDocument {
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function input(overrides: Partial<IssuePromptInput> = {}): IssuePromptInput {
    const description = markdownToTiptap(descriptionSource);
    return {
        issue: {
            id: "issue-1",
            projectId: "project-1",
            number: 11,
            identifier: "LINKORD-11",
            columnId: done,
            title: "Verificar e remover código morto",
            descriptionJson: description,
            descriptionRevision: 1,
            assigneeId: marcusId,
            categoryIds: [labelId],
            priority: "high",
            position: 1000,
            parentIssueId: null,
            estimate: null,
            dueDate: "2026-11-20",
            createdAt: "2026-11-04T05:33:00.000Z",
            updatedAt: "2026-11-05T11:44:00.000Z",
            project: { id: "project-1", name: "Linkord", issueKey: "LINKORD" },
            assignee: person(marcusId, "Marcus Coelho"),
            createdBy: person(marcusId, "Marcus Coelho"),
            categories: [{ id: labelId, name: "chore", color: null }],
            column: { id: done, name: "Done" },
            parent: null,
            children: [
                { id: "child-1", number: 12, title: "Limpar imports", columnId: todo, priority: "low", column: { id: todo, name: "In progress" } },
            ],
        },
        comments: [
            {
                id: "comment-1",
                issueId: "issue-1",
                authorId: marcusId,
                parentCommentId: null,
                contentJson: doc("Manter o comportamento."),
                source: null,
                createdAt: "2026-11-04T15:00:00.000Z",
                updatedAt: "2026-11-04T16:00:00.000Z",
                author: person(marcusId, "Marcus Coelho"),
                reactions: [{ emoji: "👍", users: [person(anaId, "Ana Souza")] }],
            },
            {
                id: "comment-2",
                issueId: "issue-1",
                authorId: anaId,
                parentCommentId: "comment-1",
                contentJson: doc("O critério de pronto continua valendo."),
                source: null,
                createdAt: "2026-11-04T15:30:00.000Z",
                updatedAt: "2026-11-04T15:30:00.000Z",
                author: person(anaId, "Ana Souza"),
                reactions: [],
            },
        ],
        activity: [
            { id: "a1", issueId: "issue-1", actorId: marcusId, type: "created", payload: {}, source: null, createdAt: "2026-11-04T05:33:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a2", issueId: "issue-1", actorId: marcusId, type: "assignee_changed", payload: { field: "assigneeId", from: null, to: marcusId }, source: null, createdAt: "2026-11-04T05:52:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a3", issueId: "issue-1", actorId: marcusId, type: "priority_changed", payload: { field: "priority", from: "none", to: "high" }, source: null, createdAt: "2026-11-04T15:45:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a4", issueId: "issue-1", actorId: marcusId, type: "status_changed", payload: { field: "columnId", from: todo, to: done }, source: null, createdAt: "2026-11-05T11:44:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a5", issueId: "issue-1", actorId: marcusId, type: "label_added", payload: { categoryId: labelId }, source: null, createdAt: "2026-11-04T06:00:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a6", issueId: "issue-1", actorId: marcusId, type: "label_removed", payload: { categoryId: missingLabel }, source: null, createdAt: "2026-11-04T06:05:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a7", issueId: "issue-1", actorId: marcusId, type: "relation_added", payload: { relationId, targetIssueId: otherId, relationType: "blocks" }, source: { client: "claude-code" }, createdAt: "2026-11-04T18:00:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a8", issueId: "issue-1", actorId: marcusId, type: "status_changed", payload: { field: "columnId", from: unknown, to: unknown }, source: null, createdAt: "2026-11-04T07:00:00.000Z", actor: person(marcusId, "Marcus Coelho") },
            { id: "a9", issueId: "issue-1", actorId: marcusId, type: "parent_changed", payload: { field: "parentIssueId", from: parentId, to: null }, source: null, createdAt: "2026-11-04T08:00:00.000Z", actor: person(marcusId, "Marcus Coelho") },
        ],
        relations: [
            {
                id: relationId,
                sourceIssueId: "issue-1",
                targetIssueId: otherId,
                type: "blocks",
                target: { id: otherId, number: 3, title: "Publicar API", projectId: "project-1", project: { issueKey: "LINKORD" } },
            },
        ],
        lookups: {
            columns: [
                { id: todo, name: "In progress" },
                { id: done, name: "Done" },
            ],
            members: [person(marcusId, "Marcus Coelho"), person(anaId, "Ana Souza")],
            categories: [{ id: labelId, name: "chore" }],
            issues: [{ id: parentId, identifier: "LINKORD-9", title: "Organizar o módulo" }],
        },
        locale: "pt-BR",
        timeZone: "UTC",
        ...overrides,
    };
}

function prompt(overrides: Partial<IssuePromptInput> = {}) {
    return buildIssuePrompt(input(overrides));
}

describe("buildIssuePrompt", () => {
    test("wraps the issue in instructions and semantic sections", () => {
        const text = prompt();
        expect(text.startsWith("<Instructions>\n")).toBe(true);
        expect(text).toContain("Analise a tarefa descrita abaixo");
        expect(text).toContain('<Task id="LINKORD-11">');
        expect(text).toContain("<Title>\n    Verificar e remover código morto\n  </Title>");
        expect(text).toContain("Projeto: Linkord");
        expect(text).toContain("Estado: Concluída");
        expect(text).toContain("Prioridade: Alta");
        expect(text).toContain("Responsável: Marcus Coelho");
        expect(text).toContain("Etiquetas: chore");
        expect(text).toContain("Estimativa: Nenhum");
        expect(text).toContain("Data de entrega: 2026-11-20");
        expect(text).toContain("Criado por: Marcus Coelho");
        expect(text).toContain("Criado em: 2026-11-04 05:33");
        expect(text).toContain("Atualizado em: 2026-11-05 11:44");
        expect(text).toContain("Tarefa principal: Nenhum");
        expect(text.endsWith("</Task>")).toBe(true);
    });

    test("keeps the description, checklist state, code and table intact", () => {
        const text = prompt();
        const rendered = tiptapToMarkdown(markdownToTiptap(descriptionSource)).replaceAll("</Description>", "<\\/Description>");
        const description = text.slice(text.indexOf("<Description>") + "<Description>".length, text.indexOf("</Description>"));
        expect(description.trim()).toBe(rendered.trim());
        expect(description).toContain("- [x] Arquivos e módulos não importados");
        expect(description).toContain("- [ ] Exports sem consumidores");
        expect(description).toContain("```bash\necho \"<\\/Description>\"\nbun test\n```");
        expect(description).toContain("| Área | Ação |");
        expect(description).toContain("![diagrama](https://files.example/a.png)");
        expect(description).toContain("[a spec](https://example.com/spec)");
        expect(text.match(/<\/Description>/g)).toEqual(["</Description>"]);
    });

    test("includes subtasks, relations, attachments and comments when they exist", () => {
        const text = prompt();
        expect(text).toContain("<Subtasks>\n    - LINKORD-12: Limpar imports — Em andamento\n  </Subtasks>");
        expect(text).toContain("<Relations>\n    - Bloqueia: LINKORD-3: Publicar API\n  </Relations>");
        expect(text).toContain("<Attachments>");
        expect(text).toContain("- ![diagrama](https://files.example/a.png)");
        expect(text).toContain("- [a spec](https://example.com/spec)");
        expect(text).toContain("- 2026-11-04 15:00 — Marcus Coelho · editado:\nManter o comportamento.\nReações: 👍 Ana Souza");
        expect(text).toContain("- 2026-11-04 15:30 — Ana Souza · resposta:\nO critério de pronto continua valendo.");
        expect(text.indexOf("15:00")).toBeLessThan(text.indexOf("15:30"));
    });

    test("describes activity in readable language and hides internal ids", () => {
        const text = prompt();
        const activity = text.slice(text.indexOf("<Activity>"), text.indexOf("</Activity>"));
        expect(activity).toContain('- 2026-11-05 11:44:\n      Marcus Coelho alterou o estado de "Em andamento" para "Concluída".');
        expect(activity).toContain('Marcus Coelho alterou a prioridade de "Sem prioridade" para "Alta".');
        expect(activity).toContain('Marcus Coelho alterou o responsável de "Nenhum" para "Marcus Coelho".');
        expect(activity).toContain('Marcus Coelho adicionou a etiqueta "chore".');
        expect(activity).toContain("Marcus Coelho removeu a etiqueta.");
        expect(activity).toContain("Marcus Coelho adicionou uma relação: Bloqueia LINKORD-3: Publicar API. (via Claude Code)");
        expect(activity).toContain('Marcus Coelho alterou a tarefa principal de "LINKORD-9: Organizar o módulo" para "Nenhum".');
        expect(activity).toContain("Marcus Coelho alterou o estado.");
        expect(activity).toContain("Marcus Coelho criou esta tarefa.");
        expect(activity.indexOf("2026-11-05 11:44")).toBeLessThan(activity.indexOf("2026-11-04 05:33"));
        for (const id of [todo, done, unknown, marcusId, anaId, labelId, missingLabel, parentId, otherId, relationId]) {
            expect(activity).not.toContain(id);
        }
        expect(activity).not.toContain("columnId");
        expect(activity).not.toContain("{");
    });

    test("omits empty sections and names a missing description", () => {
        const text = prompt({
            issue: {
                ...input().issue,
                descriptionJson: { type: "doc", content: [] },
                children: [],
                dueDate: null,
                assignee: null,
                assigneeId: null,
                categories: [],
                categoryIds: [],
                parent: null,
            },
            comments: [],
            activity: [],
            relations: [],
        });
        expect(text).toContain("<Description>\n(Sem descrição)\n  </Description>");
        expect(text).toContain("Responsável: Sem responsável");
        expect(text).toContain("Etiquetas: Nenhum");
        expect(text).toContain("Data de entrega: Nenhum");
        for (const tag of ["Subtasks", "Relations", "Attachments", "Comments", "Activity"]) {
            expect(text).not.toContain(`<${tag}>`);
        }
    });

    test("exports a sub-issue as itself", () => {
        const text = prompt({
            issue: {
                ...input().issue,
                id: "child-1",
                number: 12,
                identifier: "LINKORD-12",
                title: "Limpar imports",
                parentIssueId: "issue-1",
                parent: { id: "issue-1", number: 11, title: "Verificar e remover código morto" },
                children: [],
                columnId: todo,
                column: { id: todo, name: "In progress" },
            },
            comments: [],
            activity: [],
            relations: [],
        });
        expect(text).toContain('<Task id="LINKORD-12">');
        expect(text).toContain("Limpar imports");
        expect(text).toContain("Tarefa principal: LINKORD-11: Verificar e remover código morto");
        expect(text).not.toContain("<Subtasks>");
        expect(text).not.toContain('<Task id="LINKORD-11">');
    });

    test("uses the same text for the same issue, including unsaved edits", () => {
        const base = input();
        const edited = { title: "Título ainda não salvo", description: doc("Rascunho com </Title> e <Task id=\"x\">") };
        const first = buildIssuePrompt({ ...base, overrides: edited });
        const second = buildIssuePrompt({ ...base, overrides: edited });
        expect(first).toBe(second);
        expect(first).toContain("Título ainda não salvo");
        expect(first).toContain("Rascunho com \\<\\/Title> e \\<\\Task id=\"x\">");
        expect(base.issue.title).toBe("Verificar e remover código morto");
    });

    test("localizes the same structure in English", () => {
        const text = prompt({ locale: "en" });
        expect(text).toContain("Analyze the task described below");
        expect(text).toContain("Status: Done");
        expect(text).toContain("Priority: High");
        expect(text).toContain('Marcus Coelho changed the status from "In progress" to "Done".');
        expect(text).toContain("- LINKORD-12: Limpar imports — In progress");
    });

    test("turns a stored image into an absolute URL and says to send the token", () => {
        const id = "11111111-2222-4333-8444-555555555555";
        const text = prompt({
            locale: "en",
            origin: "https://rinia.test",
            overrides: { description: { type: "doc", content: [{ type: "image", attrs: { src: `/api/files/${id}`, alt: "shot" } }] } },
        });
        expect(text).toContain(`https://rinia.test/api/files/${id}`);
        expect(text).not.toContain(`](/api/files/${id})`);
        expect(text).toContain(issueEn.promptFileAccess);
        expect(text).toContain("Authorization: Bearer");
    });
});

describe("copy with prompt labels", () => {
    test("both actions use the same name in Portuguese and English", () => {
        expect(issuePt.copyWithPrompt).toBe("Copiar com prompt");
        expect(menuPt.copyWithPrompt).toBe(issuePt.copyWithPrompt);
        expect(issueEn.copyWithPrompt).toBe("Copy with prompt");
        expect(menuEn.copyWithPrompt).toBe(issueEn.copyWithPrompt);
    });
});
