"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function IdpDataTable<TData, TValue>({
    columns,
    data,
    onRefresh,
    isRefreshing
}: DataTableProps<TData, TValue>) {
    const router = useRouter();
    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            persistPageSize="idp-table"
            title={t('idp')}
            searchPlaceholder={t('idpSearch')}
            searchColumn="name"
            addButtonText={t('idpAdd')}
            onAdd={() => {
                router.push("/admin/idp/create");
            }}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
        />
    );
}
