/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@app/components/ui/data-table";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    createRemoteExitNode?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

export function ExitNodesDataTable<TData, TValue>({
    columns,
    data,
    createRemoteExitNode,
    onRefresh,
    isRefreshing
}: DataTableProps<TData, TValue>) {

    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            title={t('remoteExitNodes')}
            searchPlaceholder={t('searchRemoteExitNodes')}
            searchColumn="name"
            onAdd={createRemoteExitNode}
            addButtonText={t('remoteExitNodeAdd')}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            defaultSort={{
                id: "name",
                desc: false
            }}
        />
    );
}
