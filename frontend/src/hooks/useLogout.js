import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "../lib/api";
import { disconnectStreamClient } from "../lib/stream";
import { localRuntime } from "../ai/runtime";

// Logout mutation
const useLogout = () => {
    const queryClient = useQueryClient();
    const { mutate: logoutMutation, isPending, error } = useMutation({
        mutationFn: logout,
        onSuccess: async () => {
            localRuntime.release("Local AI paused after logout.");
            await disconnectStreamClient();
            queryClient.invalidateQueries({ queryKey: ["authUser"] });
        } // Invalidate authUser query on logout
    });
    return { logoutMutation, isPending, error };
};

export default useLogout;
