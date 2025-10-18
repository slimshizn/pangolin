"use client";

import {
    ColumnDef,
} from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from 'next-intl';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function InvitationsDataTable<TData, TValue>({
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
            persistPageSize="invitations-table"
            title={t('invite')}
            searchPlaceholder={t('inviteSearch')}
            searchColumn="email"
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
        />
    );
}
