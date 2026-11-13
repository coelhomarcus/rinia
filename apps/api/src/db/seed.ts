import { markdownToTiptap, type CreateIssueInput, type CreateProjectInput } from "@rinia/shared";
import { count, eq } from "drizzle-orm";
import { createCategory } from "../features/categories/categories.service";
import { listColumns } from "../features/columns/columns.service";
import { createDocument } from "../features/documents/documents.service";
import { addFavorite } from "../features/favorites/favorites.service";
import { createIssue, createIssueComment, createIssueRelation } from "../features/issues/issues.service";
import { addProjectMember, createProject } from "../features/projects/projects.service";
import { hashPassword } from "../lib/password";
import { db } from ".";
import { issueActivities, issues, projects, users } from "./schema";
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

/**
 * Months of finished work before the hand-written issues, so the overview's heatmap, streaks and per-person table
 * have something to show. Weights are relative shares among the project's members.
 */
interface SeedHistory {
    /** How far back the project was created, in days. */
    days: number;
    issues: number;
    /** Who the work is assigned to, and so who gets the completion. */
    assignees: Partial<Record<Username, number>>;
    /** Who opens the issues. */
    creators: Partial<Record<Username, number>>;
    /** Days ago that nobody worked, such as a holiday. */
    pause?: [from: number, to: number];
    topics: string[];
}

interface SeedProject {
    project: CreateProjectInput;
    members: Username[];
    history?: SeedHistory;
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
        },
        members: ["ana", "bruno"],
        history: {
            days: 330,
            issues: 170,
            assignees: { ana: 5, bruno: 3, admin: 2 },
            creators: { admin: 5, ana: 2, bruno: 1 },
            pause: [190, 204],
            topics: [
                "filtro de tarefas", "menu de contexto", "upload de anexos", "página de configurações", "convite de membros",
                "exportação CSV", "tema escuro", "busca por etiqueta", "ordenação do quadro", "atalhos de teclado",
                "notificações no app", "histórico da tarefa", "editor de documentos", "permissões de projeto", "tela de login",
                "cache das listas", "paginação de comentários", "avatar do usuário", "datas relativas", "estado vazio do quadro",
                "arrastar entre colunas", "log de erros da API", "migração de etiquetas", "tooltip dos gráficos", "modo offline",
            ],
        },
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
        },
        members: ["ana"],
        history: {
            days: 180,
            issues: 45,
            assignees: { ana: 3, admin: 1 },
            creators: { admin: 2, ana: 1 },
            topics: ["rodapé", "página de contato", "blog", "formulário de newsletter", "página sobre", "seção de depoimentos", "SEO das páginas", "imagens responsivas", "animação da hero", "página de carreiras"],
        },
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
        },
        members: ["bruno"],
        history: {
            days: 90,
            issues: 28,
            assignees: { bruno: 4, admin: 1 },
            creators: { bruno: 2, admin: 1 },
            topics: ["navegação por abas", "login com biometria", "notificações push", "tela de perfil", "modo escuro", "lista offline", "onboarding", "gestos no quadro"],
        },
        labels: [{ name: "Pesquisa", color: "#9b51e0" }],
        issues: [
            { title: "Levantar fluxos principais com usuários", column: 1, priority: "high", label: "Pesquisa", assignee: "bruno", estimate: 5 },
            { title: "Protótipo da lista de issues", column: 0, priority: "medium", assignee: "bruno", estimate: 3 },
        ],
        documents: [],
    },
];

const DAY = 24 * 60 * 60 * 1000;
const VERBS = ["Ajustar", "Corrigir", "Revisar", "Melhorar", "Documentar", "Testar", "Refatorar", "Criar", "Simplificar", "Otimizar"] as const;
const PRIORITIES: Priority[] = ["none", "low", "medium", "medium", "medium", "high", "high", "urgent"];
const ESTIMATES = [1, 2, 2, 3, 3, 5] as const;

type Random = () => number;

/** A small deterministic random generator (mulberry32), so every run of the seed tells the same story. */
function randomFrom(seed: number): Random {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick<T>(random: Random, items: readonly T[]): T {
    return items[Math.floor(random() * items.length)];
}

/** One of the keys, each as likely as its weight. */
function weighted<K extends string>(random: Random, weights: Partial<Record<K, number>>): K {
    const entries = Object.entries(weights) as Array<[K, number]>;
    let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [key, weight] of entries) {
        roll -= weight;
        if (roll < 0) return key;
    }
    return entries.at(-1)![0];
}

/** A moment `days` days before `now`, during working hours, never later than `now`. */
function daysAgo(now: Date, days: number, random: Random): Date {
    const date = new Date(now.getTime() - days * DAY);
    date.setHours(9 + Math.floor(random() * 9), Math.floor(random() * 60), 0, 0);
    return date.getTime() < now.getTime() ? date : new Date(now.getTime() - 60_000);
}

interface PlannedIssue {
    title: string;
    creator: Username;
    assignee: Username;
    priority: Priority;
    label?: string;
    estimate: (typeof ESTIMATES)[number];
    created: Date;
    started?: Date;
    done?: Date;
}

/**
 * The history's issues, oldest first. Work comes on weekdays more than weekends, picks up toward today and stops
 * during the pause; most issues are started within a few days and finished in about as many days as their estimate.
 */
function planHistory(history: SeedHistory, labels: string[], now: Date, random: Random): PlannedIssue[] {
    const weights = Array.from({ length: history.days }, (_, daysBack) => {
        const weekday = new Date(now.getTime() - daysBack * DAY).getDay();
        const paused = history.pause && daysBack >= history.pause[0] && daysBack <= history.pause[1];
        return paused ? 0 : (weekday === 0 || weekday === 6 ? 0.15 : 1) * (0.4 + 0.6 * (1 - daysBack / history.days));
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const dayFor = () => {
        let roll = random() * total;
        return Math.max(0, weights.findIndex((weight) => (roll -= weight) < 0));
    };

    const planned = Array.from({ length: history.issues }, (): PlannedIssue => {
        const createdBack = dayFor();
        const estimate = pick(random, ESTIMATES);
        const startedBack = createdBack - Math.floor(random() * 3);
        const doneBack = startedBack - 1 - Math.floor(random() * estimate * 1.2);
        const finished = doneBack >= 0 && random() > 0.06;
        return {
            title: `${pick(random, VERBS)} ${pick(random, history.topics)}`,
            creator: weighted(random, history.creators),
            assignee: weighted(random, history.assignees),
            priority: pick(random, PRIORITIES),
            label: labels.length ? pick(random, labels) : undefined,
            estimate,
            created: daysAgo(now, createdBack, random),
            started: startedBack >= 0 ? daysAgo(now, startedBack, random) : undefined,
            done: finished ? daysAgo(now, doneBack, random) : undefined,
        };
    });
    return planned.sort((a, b) => a.created.getTime() - b.created.getTime());
}

type ColumnIds = Record<"todo" | "progress" | "done", string>;

/**
 * Dates an issue's life: when it was created, assigned, started and finished. The activity rows are written here
 * directly, as the app would have written them at the time, so dating them does not send any notifications.
 */
async function backdateIssue(issueId: string, columns: ColumnIds, steps: { created: Date; assigned?: { by: string; to: string }; started?: Date; done?: Date; actor: string }) {
    const { created, actor } = steps;
    // Hours are drawn per day, so a step can land before the one it follows; each is kept after the last and before now.
    const after = (date: Date | undefined, previous: Date | undefined, hours: number) => {
        if (!date || !previous) return undefined;
        const at = Math.max(date.getTime(), previous.getTime() + hours * 60 * 60_000);
        return at < Date.now() ? new Date(at) : undefined;
    };
    const started = after(steps.started, created, 2);
    const done = after(steps.done, started, 3);
    const last = done ?? started ?? created;
    await db
        .update(issues)
        .set({ createdAt: created, updatedAt: last, columnId: done ? columns.done : started ? columns.progress : columns.todo, ...(steps.assigned ? { assigneeId: steps.assigned.to } : {}) })
        .where(eq(issues.id, issueId));
    await db.update(issueActivities).set({ createdAt: created }).where(eq(issueActivities.issueId, issueId));

    const rows: Array<typeof issueActivities.$inferInsert> = [];
    if (steps.assigned) rows.push({ issueId, actorId: steps.assigned.by, type: "assignee_changed", payload: { field: "assigneeId", from: null, to: steps.assigned.to }, createdAt: new Date(created.getTime() + 20 * 60_000) });
    if (started) rows.push({ issueId, actorId: actor, type: "status_changed", payload: { field: "columnId", from: columns.todo, to: columns.progress }, createdAt: started });
    if (done) rows.push({ issueId, actorId: actor, type: "status_changed", payload: { field: "columnId", from: columns.progress, to: columns.done }, createdAt: done });
    if (rows.length) await db.insert(issueActivities).values(rows);
}

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
    const now = new Date();
    const random = randomFrom(20_241_113);

    for (const seed of PROJECTS) {
        const project = await createProject(seed.project, admin);
        for (const member of seed.members) await addProjectMember(project.id, member, "member", "owner");

        const columns = await listColumns(project.id);
        const columnId = (index: 0 | 1 | 2) => columns.find((column) => column.name === SEED_COLUMNS[index])!.id;
        const columnIds: ColumnIds = { todo: columnId(0), progress: columnId(1), done: columnId(2) };
        const labelId = new Map<string, string>();
        for (const label of seed.labels) {
            const category = await createCategory(project.id, label, admin);
            labelId.set(label.name, category.id);
        }

        const days = seed.history?.days ?? 21;
        await db.update(projects).set({ createdAt: new Date(now.getTime() - days * DAY) }).where(eq(projects.id, project.id));

        const history = seed.history ? planHistory(seed.history, seed.labels.map((label) => label.name), now, random) : [];
        for (const issue of history) {
            const created = await createIssue(
                project.id,
                {
                    columnId: columnIds.todo,
                    title: issue.title,
                    priority: issue.priority,
                    categoryIds: issue.label ? [labelId.get(issue.label)!] : [],
                    assigneeId: null,
                    estimate: issue.estimate,
                },
                userId[issue.creator],
            );
            await backdateIssue(created.id, columnIds, {
                created: issue.created,
                assigned: { by: userId[issue.creator], to: userId[issue.assignee] },
                started: issue.started,
                done: issue.done,
                actor: userId[issue.assignee],
            });
        }

        // The hand-written issues are the latest work, spread over the last three weeks.
        const issueByTitle = new Map<string, { id: string; identifier: string }>();
        for (const [index, issue] of seed.issues.entries()) {
            const created = await createIssue(
                project.id,
                {
                    columnId: columnId(issue.column),
                    title: issue.title,
                    priority: issue.priority,
                    categoryIds: issue.label ? [labelId.get(issue.label)!] : [],
                    assigneeId: issue.assignee ? userId[issue.assignee] : null,
                    estimate: issue.estimate ?? null,
                    parentIssueId: issue.parent ? issueByTitle.get(issue.parent)?.id : null,
                    ...(issue.description ? { descriptionJson: markdownToTiptap(issue.description, "description") } : {}),
                },
                admin,
            );
            issueByTitle.set(issue.title, created);
            const createdBack = Math.round(((seed.issues.length - index) * 20) / seed.issues.length);
            const startedBack = Math.max(0, createdBack - 2);
            await backdateIssue(created.id, columnIds, {
                created: daysAgo(now, createdBack, random),
                started: issue.column >= 1 ? daysAgo(now, startedBack, random) : undefined,
                done: issue.column === 2 ? daysAgo(now, Math.max(0, startedBack - 2), random) : undefined,
                actor: issue.assignee ? userId[issue.assignee] : admin,
            });
            for (const comment of issue.comments ?? []) {
                await createIssueComment(created.identifier, { contentJson: markdownToTiptap(comment.text, "comment") }, userId[comment.by]);
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

        console.log(`Seeded ${project.name} (${project.issueKey}) with ${seed.issues.length + history.length} issues over ${days} days`);
    }

    console.log(`\nLog in as admin, ana, or bruno with the password "${SEED_PASSWORD}".`);
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
