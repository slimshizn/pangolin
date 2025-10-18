"use client";

import {
    ColumnDef,
} from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function UsersDataTable<TData, TValue>({
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
            persistPageSize="userServer-table"
            title={t('userServer')}
            searchPlaceholder={t('userSearch')}
            searchColumn="email"
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
        />
    );
}
