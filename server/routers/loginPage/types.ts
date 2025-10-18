import { LoginPage } from "@server/db";

export type CreateLoginPageResponse = LoginPage;

export type DeleteLoginPageResponse = LoginPage;

export type GetLoginPageResponse = LoginPage;

export type UpdateLoginPageResponse = LoginPage;

export type LoadLoginPageResponse = LoginPage & { orgId: string };