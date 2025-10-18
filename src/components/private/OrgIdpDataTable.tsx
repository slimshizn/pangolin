"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    onAdd?: () => void;
}

export function IdpDataTable<TData, TValue>({
    columns,
    data,
    onAdd
}: DataTableProps<TData, TValue>) {
    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            persistPageSize="idp-table"
            title={t("idp")}
            searchPlaceholder={t("idpSearch")}
            searchColumn="name"
            addButtonText={t("idpAdd")}
            onAdd={onAdd}
        />
    );
}
