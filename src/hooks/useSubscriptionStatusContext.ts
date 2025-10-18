import SubscriptionStatusContext from "@app/contexts/subscriptionStatusContext";
import { build } from "@server/build";
import { useContext } from "react";

export function useSubscriptionStatusContext() {
    if (build == "oss") {
        return null;
    }
    const context = useContext(SubscriptionStatusContext);
    if (context === undefined) {
        throw new Error(
            "useSubscriptionStatusContext must be used within an SubscriptionStatusProvider"
        );
    }
    return context;
}
