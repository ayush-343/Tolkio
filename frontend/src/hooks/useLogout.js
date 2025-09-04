import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "../lib/api";


// Logout mutation
const useLogout = () => {
    const queryClient = useQueryClient();
    const { mutate: logoutMutation, isPending, error } = useMutation({
        mutationFn: logout,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authUser"] }), // Invalidate authUser query on logout
    });
    return { logoutMutation, isPending, error };
};

export default useLogout;
