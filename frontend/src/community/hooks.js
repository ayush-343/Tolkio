import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useAuthUser from "../hooks/useAuthUser";
import { communityGet, communityWrite } from "./api";
export function useCommunity(path, { enabled = true, poll = false } = {}) {
  const { authUser } = useAuthUser();
  return useQuery({
    queryKey: ["community", authUser?._id, path],
    queryFn: () => communityGet(path),
    enabled: !!authUser && enabled,
    refetchInterval: poll ? 5000 : false,
    retry: false,
  });
}
export function useCommunityMutation(onSuccess) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: communityWrite,
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ["community"] });
      onSuccess?.(data);
    },
  });
}
