"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { Button } from "@app/components/ui/button";
import { ArrowUpDown, Crown, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import { RolesDataTable } from "@app/components/RolesDataTable";
import { Role } from "@server/db";
import CreateRoleForm from "@app/components/CreateRoleForm";
import DeleteRoleForm from "@app/components/DeleteRoleForm";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export type RoleRow = Role;

type RolesTableProps = {
    roles: RoleRow[];
};

export default function UsersTable({ roles: r }: RolesTableProps) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const router = useRouter();

    const [roles, setRoles] = useState<RoleRow[]>(r);

    const [roleToRemove, setUserToRemove] = useState<RoleRow | null>(null);

    const api = createApiClient(useEnvContext());

    const { org } = useOrgContext();

    const t = useTranslations();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refreshData = async () => {
        console.log("Data refreshed");
        setIsRefreshing(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 200));
            router.refresh();
        } catch (error) {
            toast({
                title: t("error"),
                description: t("refreshError"),
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    const columns: ColumnDef<RoleRow>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("name")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "description",
            header: t("description")
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const roleRow = row.original;

                return (
                    <div className="flex items-center justify-end">
                        <Button
                            variant={"secondary"}
                            size="sm"
                            disabled={roleRow.isAdmin || false}
                            onClick={() => {
                                setIsDeleteModalOpen(true);
                                setUserToRemove(roleRow);
                            }}
                        >
                            {t("accessRoleDelete")}
                        </Button>
                    </div>
                );
            }
        }
    ];

    return (
        <>
            <CreateRoleForm
                open={isCreateModalOpen}
                setOpen={setIsCreateModalOpen}
                afterCreate={async (role) => {
                    setRoles((prev) => [...prev, role]);
                }}
            />

            {roleToRemove && (
                <DeleteRoleForm
                    open={isDeleteModalOpen}
                    setOpen={setIsDeleteModalOpen}
                    roleToDelete={roleToRemove}
                    afterDelete={() => {
                        setRoles((prev) =>
                            prev.filter((r) => r.roleId !== roleToRemove.roleId)
                        );
                        setUserToRemove(null);
                    }}
                />
            )}

            <RolesDataTable
                columns={columns}
                data={roles}
                createRole={() => {
                    setIsCreateModalOpen(true);
                }}
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
            />
        </>
    );
}
