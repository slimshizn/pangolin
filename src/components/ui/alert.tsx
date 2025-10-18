import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@app/lib/cn";

const alertVariants = cva(
    "relative w-full rounded-lg p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
    {
        variants: {
            variant: {
                default: "bg-card border text-foreground",
                neutral: "bg-card bg-muted border text-foreground",
                destructive:
                    "border-destructive/50 border bg-destructive/10 text-destructive dark:border-destructive [&>svg]:text-destructive",
                success:
                    "border-green-500/50 border bg-green-500/10 text-green-500 dark:border-success [&>svg]:text-green-500",
                info: "border-blue-500/50 border bg-blue-500/10 text-blue-500 dark:border-blue-400 [&>svg]:text-blue-500",
                warning:
                    "border-yellow-500/50 border bg-yellow-500/10 text-yellow-500 dark:border-yellow-400 [&>svg]:text-yellow-500"
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
);

const Alert = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
    <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
    />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h5
        ref={ref}
        className={cn(
            "mb-1 font-medium leading-none tracking-tight",
            className
        )}
        {...props}
    />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("text-sm [&_p]:leading-relaxed", className)}
        {...props}
    />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
