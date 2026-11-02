import { markdownToTiptap, type CreateIssueInput, type CreateProjectInput } from "@rinia/shared";
import { count } from "drizzle-orm";
import { createCategory } from "../features/categories/categories.service";
import { listColumns } from "../features/columns/columns.service";
import { createDocument } from "../features/documents/documents.service";
import { addFavorite } from "../features/favorites/favorites.service";
import { createIssue, createIssueComment, createIssueRelation } from "../features/issues/issues.service";
import { addProjectMember, createProject } from "../features/projects/projects.service";
import { hashPassword } from "../lib/password";
import { db } from ".";
import { users } from "./schema";
import { assertDevelopmentDatabase } from "./dev-guard";

/** Every seeded account shares this password. Development only. */
export const SEED_PASSWORD = "rinia1234";

const SEED_USERS = [
    { name: "Admin", username: "admin", email: "admin@rinia.local", isAdmin: true },
    { name: "Ana Souza", username: "ana", email: "ana@rinia.local", isAdmin: false },
    { name: "Bruno Lima", username: "bruno", email: "bruno@rinia.local", isAdmin: false },
] as const;

type Username = (typeof SEED_USERS)[number]["username"];
type Priority = CreateIssueInput["priority"];

/** `SeedIssue.column` indexes these default columns: to do, in progress, done. */
const SEED_COLUMNS = ["A fazer", "Em andamento", "Concluído"] as const;

interface SeedIssue {
    title: string;
    column: 0 | 1 | 2;
    priority: Priority;
    label?: string;
    assignee?: Username;
    estimate?: 1 | 2 | 3 | 5 | 8;
    description?: string;
    parent?: string;
    comments?: Array<{ by: Username; text: string }>;
}

interface SeedProject {
    project: CreateProjectInput;
    members: Username[];
    labels: Array<{ name: string; color: string }>;
    issues: SeedIssue[];
    relations?: Array<{ from: string; to: string; type: "blocks" | "related" | "duplicate" }>;
    documents: Array<{ title: string; icon?: CreateProjectInput["iconAppearance"]; markdown: string }>;
    /** Shortcuts pinned to the admin's sidebar. */
    favorites?: { project?: boolean; issues?: boolean; documents?: string[] };
}

const PROJECTS: SeedProject[] = [
    {
        project: {
            name: "Rinia",
            description: "O próprio workspace: issues, documentos e quadro.",
            iconAppearance: { type: "icon", key: "rocket", color: "#5e6ad2" },
            cover: { type: "gradient", key: "aurora" },
        },
        members: ["ana", "bruno"],
        labels: [
            { name: "Bug", color: "#eb5757" },
            { name: "Feature", color: "#5e6ad2" },
            { name: "Design", color: "#e255a1" },
            { name: "Infra", color: "#26b5ce" },
        ],
        issues: [
            {
                title: "Seletor de cor para ícones de projeto",
                column: 2,
                priority: "medium",
                label: "Feature",
                assignee: "admin",
                estimate: 3,
                description: "Permitir escolher a cor do ícone no seletor de aparência.\n\n- [x] Cores prontas\n- [x] Seletor livre com HEX\n- [x] Fundo colorido no ícone grande",
            },
            {
                title: "Unificar lista e quadro em uma tela",
                column: 2,
                priority: "high",
                label: "Feature",
                assignee: "ana",
                estimate: 5,
            },
            {
                title: "Sidebar sobrepõe o texto ao recolher",
                column: 2,
                priority: "high",
                label: "Bug",
                assignee: "bruno",
                estimate: 2,
                comments: [
                    { by: "bruno", text: "Era o `overflow` do aside. Corrigido mantendo a largura fixa do conteúdo." },
                    { by: "admin", text: "Validado aqui, ficou suave." },
                ],
            },
            {
                title: "Busca global de issues e documentos",
                column: 1,
                priority: "high",
                label: "Feature",
                assignee: "ana",
                estimate: 8,
                description: "## Objetivo\n\nUm único atalho (`Cmd+K`) que encontra issues, documentos e projetos.\n\n## Escopo\n\n- Busca por título e identificador\n- Navegação por teclado\n- Resultados agrupados por tipo",
            },
            {
                title: "Indexar títulos de documentos",
                column: 1,
                priority: "medium",
                label: "Infra",
                assignee: "bruno",
                estimate: 3,
                parent: "Busca global de issues e documentos",
            },
            {
                title: "Atalhos de teclado na busca",
                column: 0,
                priority: "low",
                label: "Feature",
                estimate: 2,
                parent: "Busca global de issues e documentos",
            },
            {
                title: "Revisar contraste do tema claro",
                column: 0,
                priority: "medium",
                label: "Design",
                assignee: "ana",
                estimate: 2,
            },
            {
                title: "Backup automático diário do banco",
                column: 0,
                priority: "urgent",
                label: "Infra",
                assignee: "admin",
                estimate: 5,
                comments: [{ by: "ana", text: "Podemos reaproveitar o export de backup que já existe no admin." }],
            },
            {
                title: "Datas exibidas em UTC no histórico",
                column: 0,
                priority: "medium",
                label: "Bug",
                assignee: "bruno",
                estimate: 1,
            },
            {
                title: "Notificações por e-mail",
                column: 0,
                priority: "none",
                label: "Feature",
            },
        ],
        favorites: { project: true, issues: true, documents: ["Roadmap"] },
        relations: [
            { from: "Backup automático diário do banco", to: "Busca global de issues e documentos", type: "related" },
            { from: "Indexar títulos de documentos", to: "Atalhos de teclado na busca", type: "blocks" },
        ],
        documents: [
            {
                title: "Visão geral",
                icon: { type: "emoji", value: "🧭" },
                markdown: "# Rinia\n\nUm workspace calmo para projetos, issues e documentos.\n\n## Como trabalhamos\n\n- Cada issue tem um dono e uma estimativa\n- O quadro reflete o estado real do trabalho\n- Decisões ficam registradas em documentos\n\n> Menos ferramenta, mais trabalho feito.",
            },
            {
                title: "Roadmap",
                icon: { type: "icon", key: "flag", color: "#4cb782" },
                markdown: "## Agora\n\n- [x] Nova marca e favicon\n- [x] Cores nos ícones de projeto\n- [ ] Busca global\n\n## Próximo\n\n- [ ] Notificações\n- [ ] Backup automático\n\n## Depois\n\n- [ ] App mobile",
            },
        ],
    },
    {
        project: {
            name: "Site institucional",
            description: "Landing page e páginas públicas.",
            iconAppearance: { type: "icon", key: "globe", color: "#26b5ce" },
            cover: { type: "gradient", key: "lagoon" },
        },
        members: ["ana"],
        labels: [
            { name: "Conteúdo", color: "#f2c94c" },
            { name: "Design", color: "#e255a1" },
        ],
        issues: [
            { title: "Nova hero com screenshot do app", column: 1, priority: "high", label: "Design", assignee: "ana", estimate: 3 },
            { title: "Página de preços", column: 0, priority: "medium", label: "Conteúdo", estimate: 2 },
            { title: "Meta tags e imagem de compartilhamento", column: 0, priority: "low", label: "Conteúdo", assignee: "admin", estimate: 1 },
            { title: "Publicar o favicon novo", column: 2, priority: "medium", label: "Design", assignee: "admin", estimate: 1 },
        ],
        documents: [
            {
                title: "Tom de voz",
                icon: { type: "emoji", value: "✍️" },
                markdown: "## Princípios\n\n- Frases curtas\n- Sem jargão\n- Mostrar, não prometer",
            },
        ],
    },
    {
        project: {
            name: "App mobile",
            description: "Cliente iOS e Android.",
            iconAppearance: { type: "icon", key: "mobile", color: "#f2994a" },
            cover: { type: "gradient", key: "ember" },
        },
        members: ["bruno"],
        labels: [{ name: "Pesquisa", color: "#9b51e0" }],
        issues: [
            { title: "Levantar fluxos principais com usuários", column: 1, priority: "high", label: "Pesquisa", assignee: "bruno", estimate: 5 },
            { title: "Protótipo da lista de issues", column: 0, priority: "medium", assignee: "bruno", estimate: 3 },
        ],
        documents: [],
    },
];

async function main() {
    assertDevelopmentDatabase("seed");

    const [{ value: existingUsers }] = await db.select({ value: count() }).from(users);
    if (existingUsers > 0) {
        throw new Error("The database already has users. Run `bun run db:reset` to start from a clean seed.");
    }

    const passwordHash = await hashPassword(SEED_PASSWORD);
    const insertedUsers = await db
        .insert(users)
        .values(SEED_USERS.map((user) => ({ ...user, passwordHash, locale: "pt-BR" })))
        .returning({ id: users.id, username: users.username });
    const userId = Object.fromEntries(insertedUsers.map((user) => [user.username, user.id])) as Record<Username, string>;
    const admin = userId.admin;

    for (const seed of PROJECTS) {
        const project = await createProject(seed.project, admin);
        for (const member of seed.members) await addProjectMember(project.id, member);

        const columns = await listColumns(project.id);
        const labelId = new Map<string, string>();
        for (const label of seed.labels) {
            const category = await createCategory(project.id, label, admin);
            labelId.set(label.name, category.id);
        }

        const issueByTitle = new Map<string, { id: string; identifier: string }>();
        for (const issue of seed.issues) {
            const created = await createIssue(
                project.id,
                {
                    columnId: columns.find((column) => column.name === SEED_COLUMNS[issue.column])!.id,
                    title: issue.title,
                    priority: issue.priority,
                    categoryIds: issue.label ? [labelId.get(issue.label)!] : [],
                    assigneeId: issue.assignee ? userId[issue.assignee] : null,
                    estimate: issue.estimate ?? null,
                    parentIssueId: issue.parent ? issueByTitle.get(issue.parent)?.id : null,
                    ...(issue.description ? { descriptionJson: markdownToTiptap(issue.description) } : {}),
                },
                admin,
            );
            issueByTitle.set(issue.title, created);
            for (const comment of issue.comments ?? []) {
                await createIssueComment(created.identifier, { contentJson: markdownToTiptap(comment.text) }, userId[comment.by]);
            }
        }

        for (const relation of seed.relations ?? []) {
            const from = issueByTitle.get(relation.from)!;
            const to = issueByTitle.get(relation.to)!;
            await createIssueRelation(from.identifier, { targetIssueIdentifier: to.identifier, type: relation.type }, admin);
        }

        const documentByTitle = new Map<string, string>();
        for (const document of seed.documents) {
            const created = await createDocument(project.id, admin, {
                title: document.title,
                iconAppearance: document.icon ?? null,
                contentJson: markdownToTiptap(document.markdown),
            });
            documentByTitle.set(document.title, created.id);
        }

        if (seed.favorites?.project) await addFavorite(admin, { kind: "project", projectId: project.id });
        if (seed.favorites?.issues) await addFavorite(admin, { kind: "issues", projectId: project.id });
        for (const title of seed.favorites?.documents ?? []) {
            await addFavorite(admin, { kind: "document", projectId: project.id, documentId: documentByTitle.get(title)! });
        }

        console.log(`Seeded ${project.name} (${project.issueKey}) with ${seed.issues.length} issues`);
    }

    console.log(`\nLog in as admin, ana, or bruno with the password "${SEED_PASSWORD}".`);
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
