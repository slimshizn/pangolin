"use client";

import {
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormDescription,
    FormMessage
} from "@app/components/ui/form";
import { SwitchInput } from "@app/components/SwitchInput";
import { RadioGroup, RadioGroupItem } from "@app/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Input } from "@app/components/ui/input";
import { useTranslations } from "next-intl";
import { Control, FieldValues, Path } from "react-hook-form";

type Role = {
    roleId: number;
    name: string;
};

type AutoProvisionConfigWidgetProps<T extends FieldValues> = {
    control: Control<T>;
    autoProvision: boolean;
    onAutoProvisionChange: (checked: boolean) => void;
    roleMappingMode: "role" | "expression";
    onRoleMappingModeChange: (mode: "role" | "expression") => void;
    roles: Role[];
    roleIdFieldName: Path<T>;
    roleMappingFieldName: Path<T>;
};

export default function AutoProvisionConfigWidget<T extends FieldValues>({
    control,
    autoProvision,
    onAutoProvisionChange,
    roleMappingMode,
    onRoleMappingModeChange,
    roles,
    roleIdFieldName,
    roleMappingFieldName
}: AutoProvisionConfigWidgetProps<T>) {
    const t = useTranslations();

    return (
        <div className="space-y-4">
            <div className="mb-4">
                <SwitchInput
                    id="auto-provision-toggle"
                    label={t("idpAutoProvisionUsers")}
                    defaultChecked={autoProvision}
                    onCheckedChange={onAutoProvisionChange}
                />
                <span className="text-sm text-muted-foreground">
                    {t("idpAutoProvisionUsersDescription")}
                </span>
            </div>

            {autoProvision && (
                <div className="space-y-4">
                    <div>
                        <FormLabel className="mb-2">
                            {t("roleMapping")}
                        </FormLabel>
                        <FormDescription className="mb-4">
                            {t("roleMappingDescription")}
                        </FormDescription>

                        <RadioGroup
                            value={roleMappingMode}
                            onValueChange={onRoleMappingModeChange}
                            className="flex space-x-6"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="role" id="role-mode" />
                                <label
                                    htmlFor="role-mode"
                                    className="text-sm font-medium"
                                >
                                    {t("selectRole")}
                                </label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                    value="expression"
                                    id="expression-mode"
                                />
                                <label
                                    htmlFor="expression-mode"
                                    className="text-sm font-medium"
                                >
                                    {t("roleMappingExpression")}
                                </label>
                            </div>
                        </RadioGroup>
                    </div>

                    {roleMappingMode === "role" ? (
                        <FormField
                            control={control}
                            name={roleIdFieldName}
                            render={({ field }) => (
                                <FormItem>
                                    <Select
                                        onValueChange={(value) =>
                                            field.onChange(Number(value))
                                        }
                                        value={field.value?.toString()}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={t(
                                                        "selectRolePlaceholder"
                                                    )}
                                                />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {roles.map((role) => (
                                                <SelectItem
                                                    key={role.roleId}
                                                    value={role.roleId.toString()}
                                                >
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {t("selectRoleDescription")}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ) : (
                        <FormField
                            control={control}
                            name={roleMappingFieldName}
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            defaultValue={field.value || ""}
                                            value={field.value || ""}
                                            placeholder={t(
                                                "roleMappingExpressionPlaceholder"
                                            )}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {t("roleMappingExpressionDescription")}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
