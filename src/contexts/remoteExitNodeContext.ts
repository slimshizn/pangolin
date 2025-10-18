import { GetRemoteExitNodeResponse } from "@server/routers/remoteExitNode/types";
import { createContext } from "react";

type RemoteExitNodeContextType = {
    remoteExitNode: GetRemoteExitNodeResponse;
    updateRemoteExitNode: (updatedRemoteExitNode: Partial<GetRemoteExitNodeResponse>) => void;
};

const RemoteExitNodeContext = createContext<RemoteExitNodeContextType | undefined>(undefined);

export default RemoteExitNodeContext;
