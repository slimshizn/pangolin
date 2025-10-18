"use client";

import {
    ColumnDef,
} from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from 'next-intl';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    createRole?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function RolesDataTable<TData, TValue>({
    columns,
    data,
    createRole,
    onRefresh,
    isRefreshing
}: DataTableProps<TData, TValue>) {

    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            persistPageSize="roles-table"
            title={t('roles')}
            searchPlaceholder={t('accessRolesSearch')}
            searchColumn="name"
            onAdd={createRole}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            addButtonText={t('accessRolesAdd')}
        />
    );
}
