import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "../lib/api";
import { disconnectStreamClient } from "../lib/stream";
import { localRuntime } from "../ai/runtime";
import { disconnectVideoSession } from '../lib/video-session';
import { resetCsrfToken } from '../lib/axios';

// Logout mutation
const useLogout = () => {
    const queryClient = useQueryClient();
    const { mutate: logoutMutation, isPending, error } = useMutation({
        mutationFn: logout,
        onSuccess: async () => {
            localRuntime.release("Local AI paused after logout.");
            await queryClient.cancelQueries();
            await Promise.allSettled([disconnectStreamClient(), disconnectVideoSession()]);
            resetCsrfToken();
            queryClient.setQueryData(['authUser'], { user: null });
            // Keep the active auth observer attached while removing every
            // account-scoped resource; clearing the entire cache detaches it.
            queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'authUser' });
        } // Invalidate authUser query on logout
    });
    return { logoutMutation, isPending, error };
};

export default useLogout;
