"use client";

import { useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { InfoPopup } from "@app/components/ui/info-popup";
import { useTranslations } from "next-intl";

type Region = {
    value: string;
    label: string;
    flag: string;
};

const regions: Region[] = [
    {
        value: "us",
        label: "North America",
        flag: ""
    },
    {
        value: "eu",
        label: "Europe",
        flag: ""
    }
];

export default function RegionSelector() {
    const [selectedRegion, setSelectedRegion] = useState<string>("us");
    const t = useTranslations();

    const handleRegionChange = (value: string) => {
        setSelectedRegion(value);
        const region = regions.find((r) => r.value === value);
        if (region) {
            console.log(`Selected region: ${region.label}`);
        }
    };

    return (
        <div className="flex flex-col items-center space-y-2">
            <label className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                {t('regionSelectorTitle')}
                <InfoPopup info={t('regionSelectorInfo')} />
            </label>

            <Select value={selectedRegion} onValueChange={handleRegionChange}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t('regionSelectorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                    {regions.map((region) => (
                        <SelectItem
                            key={region.value}
                            value={region.value}
                            disabled={region.value === "eu"}
                        >
                            <div className="flex items-center space-x-2">
                                <span className="text-lg">{region.flag}</span>
                                <div className="flex flex-col">
                                    <span
                                        className={
                                            region.value === "eu"
                                                ? "text-muted-foreground"
                                                : ""
                                        }
                                    >
                                        {region.label}
                                    </span>
                                    {region.value === "eu" && (
                                        <span className="text-xs text-muted-foreground">
                                            {t('regionSelectorComingSoon')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
