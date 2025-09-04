import { useMutation, useQueryClient } from '@tanstack/react-query';
import React from 'react'
import toast from 'react-hot-toast';
import { signup } from '../lib/api';

const useSignup = () => {
  const queryClient = useQueryClient();

  // Mutation for signing up the user
  const {
    mutate: signupMutation,
    isPending,
    error,
  } = useMutation({
    mutationFn: signup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authUser"] }); // Refetch authUser query to update auth state
      toast.success("Signup successful!");
      // Redirect to the Onboarding page
    },
  });

  return { isPending, error, signupMutation };
};

export default useSignup