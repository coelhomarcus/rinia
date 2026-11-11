import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router";
import { LoadingState } from "@/components/feedback/loading-state";
import { AppShell } from "@/components/layout/app-shell";
import { AuthLayout } from "@/components/layout/auth-layout";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { ProjectRoute } from "@/features/projects/route-project";
import { urls, type ProjectSettingsSection } from "@/lib/urls";
import { useTranslation } from "react-i18next";

const ProjectSettingsPage = lazy(() => import("@/pages/project-settings-page").then((module) => ({ default: module.ProjectSettingsPage })));
const AdminProjectsPage = lazy(() => import("@/pages/admin-projects-page").then((module) => ({ default: module.AdminProjectsPage })));
const AdminUsersPage = lazy(() => import("@/pages/admin-users-page").then((module) => ({ default: module.AdminUsersPage })));
const AdminUserPage = lazy(() => import("@/pages/admin-user-page").then((module) => ({ default: module.AdminUserPage })));
const AdminProjectSettingsPage = lazy(() => import("@/pages/admin-project-settings-page").then((module) => ({ default: module.AdminProjectSettingsPage })));
const ProfileSettingsPage = lazy(() => import("@/pages/profile-settings-page").then((module) => ({ default: module.ProfileSettingsPage })));
const DesignSystemPage = lazy(() => import("@/pages/design-system-page").then((module) => ({ default: module.default })));

const IssueView = lazy(() => import("@/features/issues/components/issue-view/issue-view").then((module) => ({ default: module.IssueView })));
const MobileNavPage = lazy(() => import("@/pages/mobile-nav-page").then((module) => ({ default: module.MobileNavPage })));
const InboxPage = lazy(() => import("@/pages/inbox-page").then((module) => ({ default: module.InboxPage })));
const LoginPage = lazy(() => import("@/pages/login-page").then((module) => ({ default: module.LoginPage })));
const MyIssuesPage = lazy(() => import("@/pages/my-issues-page").then((module) => ({ default: module.MyIssuesPage })));
const NotFound = lazy(() => import("@/pages/not-found").then((module) => ({ default: module.NotFound })));
const ProjectDocumentPage = lazy(() => import("@/pages/project-documents-page").then((module) => ({ default: module.ProjectDocumentPage })));
const ProjectDocumentsPage = lazy(() => import("@/pages/project-documents-page").then((module) => ({ default: module.ProjectDocumentsPage })));
const ProjectMembersPage = lazy(() => import("@/pages/project-members-page").then((module) => ({ default: module.ProjectMembersPage })));
const ProjectViewsPage = lazy(() => import("@/pages/project-views-page").then((module) => ({ default: module.ProjectViewsPage })));
const ProjectViewPage = lazy(() => import("@/pages/project-view-page").then((module) => ({ default: module.ProjectViewPage })));
const ProjectIssuesPage = lazy(() => import("@/pages/project-issues-page").then((module) => ({ default: module.ProjectIssuesPage })));
const ProjectOverviewPage = lazy(() => import("@/pages/project-overview-page").then((module) => ({ default: module.ProjectOverviewPage })));
const IntegrationsSettingsPage = lazy(() => import("@/pages/integrations-settings-page").then((module) => ({ default: module.IntegrationsSettingsPage })));
const IntegrationSettingsPage = lazy(() => import("@/pages/integration-settings-page").then((module) => ({ default: module.IntegrationSettingsPage })));
const ApiTokensSettingsPage = lazy(() => import("@/pages/api-tokens-settings-page").then((module) => ({ default: module.ApiTokensSettingsPage })));
const SecuritySettingsPage = lazy(() => import("@/pages/security-settings-page").then((module) => ({ default: module.SecuritySettingsPage })));
const PreferencesSettingsPage = lazy(() => import("@/pages/preferences-settings-page").then((module) => ({ default: module.PreferencesSettingsPage })));
const OAuthConsentPage = lazy(() => import("@/pages/oauth-consent-page").then((module) => ({ default: module.OAuthConsentPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password-page").then((module) => ({ default: module.ForgotPasswordPage })));
const ConfirmEmailPage = lazy(() => import("@/pages/confirm-email-page").then((module) => ({ default: module.ConfirmEmailPage })));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password-page").then((module) => ({ default: module.ResetPasswordPage })));
const RegisterPage = lazy(() => import("@/pages/register-page").then((module) => ({ default: module.RegisterPage })));

/** Old `/projects/<uuid>/...` links (bookmarks, pasted URLs) land on the matching key-based URL. */
function LegacyProjectRedirect() {
    const { projectId = "", "*": rest = "" } = useParams();
    const [params] = useSearchParams();
    const { t } = useTranslation();
    const { data: projects, isLoading } = useProjects();
    const project = projects?.find((candidate) => candidate.id === projectId);
    if (isLoading) return <LoadingState label={t("common.loadingPage")} className="p-6" />;
    if (!project) return <NotFound />;

    const [section, item] = rest.split("/").filter(Boolean);
    const key = project.issueKey;
    const search = new URLSearchParams(params);
    let to = urls.project(key);
    if (section === "issues" && item && item !== "list") to = urls.issue(item);
    else if (section === "issues") {
        const scope = search.get("scope");
        search.delete("scope");
        // Old links left the scope out to mean active, which is the default again.
        to = urls.issues(key, scope === "backlog" || scope === "all" ? scope : "active");
    } else if (section === "board") {
        search.set("view", "board");
        to = urls.issues(key);
    } else if (section === "documents" || section === "page") to = item ? `${urls.documents(key)}/${item}` : urls.documents(key);
    else if (section === "members") to = urls.members(key);
    else if (section === "settings") to = urls.projectSettings(key, item as ProjectSettingsSection | undefined);
    const query = search.toString();
    return <Navigate replace to={`${to}${query ? `?${query}` : ""}`} />;
}

export const AppRoutes = () => {
    const { t } = useTranslation();

    return (
        <Suspense fallback={<div className="min-h-dvh bg-canvas" aria-hidden="true" />}>
            <Routes>
                <Route element={<AuthLayout />}>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/confirm-email" element={<ConfirmEmailPage />} />
                    {/* Where MCP clients send someone to sign in with Rinia. */}
                    <Route path="/oauth/authorize" element={<RequireAuth><OAuthConsentPage /></RequireAuth>} />
                </Route>

                <Route
                    element={
                        <RequireAuth>
                            <AppShell />
                        </RequireAuth>
                    }
                >
                    <Route path="/" element={<Navigate to={urls.myIssues()} replace />} />
                    <Route path="/home" element={<MobileNavPage desktopTo={urls.myIssues()} />} />
                    <Route path="/settings" element={<MobileNavPage desktopTo="/settings/profile" />} />
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/my-issues" element={<MyIssuesPage />} />
                    <Route path="/my-issues/:filter" element={<MyIssuesPage />} />
                    <Route path="/settings/profile" element={<ProfileSettingsPage />} />
                    <Route path="/settings/preferences" element={<PreferencesSettingsPage />} />
                    <Route path="/settings/security" element={<SecuritySettingsPage />} />
                    <Route path="/settings/integrations" element={<IntegrationsSettingsPage />} />
                    <Route path="/settings/integrations/:slug" element={<IntegrationSettingsPage />} />
                    <Route path="/settings/api-tokens" element={<ApiTokensSettingsPage />} />
                    {/* Where these pages lived before integrations had a catalog of their own. */}
                    <Route path="/settings/agent/tokens" element={<Navigate to={urls.apiTokens()} replace />} />
                    <Route path="/settings/agent/*" element={<Navigate to={urls.integrations()} replace />} />
                    {/* Administration was one page before it had a page for projects and one for users. */}
                    <Route path="/settings/admin" element={<Navigate to={urls.adminProjects()} replace />} />
                    <Route path="/settings/admin/projects" element={<AdminProjectsPage />} />
                    <Route path="/settings/admin/projects/:projectId" element={<AdminProjectSettingsPage />} />
                    <Route path="/settings/admin/users" element={<AdminUsersPage />} />
                    <Route path="/settings/admin/users/:userId" element={<AdminUserPage />} />
                    <Route path="/settings/project/:projectKey" element={<ProjectRoute><ProjectSettingsPage /></ProjectRoute>} />
                    <Route path="/settings/project/:projectKey/:section" element={<ProjectRoute><ProjectSettingsPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey" element={<ProjectRoute><ProjectOverviewPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/issues" element={<ProjectRoute><ProjectIssuesPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/issues/:scope" element={<ProjectRoute><ProjectIssuesPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/views" element={<ProjectRoute><ProjectViewsPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/views/:viewSlug" element={<ProjectRoute><ProjectViewPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/members" element={<ProjectRoute><ProjectMembersPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/docs" element={<ProjectRoute><ProjectDocumentsPage /></ProjectRoute>} />
                    <Route path="/project/:projectKey/docs/:documentSlug" element={<ProjectRoute><ProjectDocumentPage /></ProjectRoute>} />
                    <Route path="/issue/:issueIdentifier" element={<IssueView />} />
                    <Route path="/issue/:issueIdentifier/:slug" element={<IssueView />} />
                    <Route path="/projects/:projectId/*" element={<LegacyProjectRedirect />} />
                </Route>

                {import.meta.env.DEV && (
                    <Route
                        path="/__design-system"
                        element={
                            <Suspense fallback={<LoadingState label={t("common.loadingPage")} className="p-6" />}>
                                <DesignSystemPage />
                            </Suspense>
                        }
                    />
                )}
                <Route
                    path="*"
                    element={
                        <Suspense fallback={<LoadingState label={t("common.loadingPage")} className="p-6" />}>
                            <NotFound />
                        </Suspense>
                    }
                />
            </Routes>

        </Suspense>
    );
};
