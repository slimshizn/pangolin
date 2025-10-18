"use client";

import {
    ColumnDef,
} from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from 'next-intl';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    inviteUser?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function UsersDataTable<TData, TValue>({
    columns,
    data,
    inviteUser,
    onRefresh,
    isRefreshing
}: DataTableProps<TData, TValue>) {

    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            persistPageSize="users-table"
            title={t('users')}
            searchPlaceholder={t('accessUsersSearch')}
            searchColumn="email"
            onAdd={inviteUser}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            addButtonText={t('accessUserCreate')}
        />
    );
}
