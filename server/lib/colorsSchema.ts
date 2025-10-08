import { z } from "zod";

export const colorsSchema = z.object({
    background: z.string().optional(),
    foreground: z.string().optional(),
    card: z.string().optional(),
    "card-foreground": z.string().optional(),
    popover: z.string().optional(),
    "popover-foreground": z.string().optional(),
    primary: z.string().optional(),
    "primary-foreground": z.string().optional(),
    secondary: z.string().optional(),
    "secondary-foreground": z.string().optional(),
    muted: z.string().optional(),
    "muted-foreground": z.string().optional(),
    accent: z.string().optional(),
    "accent-foreground": z.string().optional(),
    destructive: z.string().optional(),
    "destructive-foreground": z.string().optional(),
    border: z.string().optional(),
    input: z.string().optional(),
    ring: z.string().optional(),
    radius: z.string().optional(),
    "chart-1": z.string().optional(),
    "chart-2": z.string().optional(),
    "chart-3": z.string().optional(),
    "chart-4": z.string().optional(),
    "chart-5": z.string().optional()
});
