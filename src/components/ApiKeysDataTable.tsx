"use client";

import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    SortingState,
    getSortedRowModel,
    ColumnFiltersState,
    getFilteredRowModel
} from "@tanstack/react-table";

import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Button } from "@app/components/ui/button";
import { useState } from "react";
import { Input } from "@app/components/ui/input";
import { DataTablePagination } from "@app/components/DataTablePagination";
import { Plus, Search } from "lucide-react";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    addApiKey?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function ApiKeysDataTable<TData, TValue>({
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
            persistPageSize="apiKeys-table"
            title={t('apiKeys')}
            searchPlaceholder={t('searchApiKeys')}
            searchColumn="name"
            onAdd={addApiKey}
            addButtonText={t('apiKeysAdd')}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
        />
    );
}
