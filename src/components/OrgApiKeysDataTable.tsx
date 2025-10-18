"use client";

import { DataTable } from "@app/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    addApiKey?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function OrgApiKeysDataTable<TData, TValue>({
    addApiKey,
    columns,
    data,
    onRefresh,
    isRefreshing
}: DataTableProps<TData, TValue>) {

    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            persistPageSize="Org-apikeys-table"
            title={t('apiKeys')}
            searchPlaceholder={t('searchApiKeys')}
            searchColumn="name"
            onAdd={addApiKey}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            addButtonText={t('apiKeysAdd')}
        />
    );
}
