import { useMutation, useQueryClient } from '@tanstack/react-query';
import React from 'react'
import toast from 'react-hot-toast';
import { signup } from '../lib/api';
import { resetCsrfToken } from '../lib/axios';

const useSignup = () => {
  const queryClient = useQueryClient();

  // Mutation for signing up the user
  const {
    mutate: signupMutation,
    isPending,
    error,
  } = useMutation({
    mutationFn: signup,
    onSuccess: async data => {
      await queryClient.cancelQueries();
      resetCsrfToken();
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'authUser' });
      queryClient.setQueryData(['authUser'], data);
      toast.success("Signup successful!");
      // Redirect to the Onboarding page
    },
  });

  return { isPending, error, signupMutation };
};

export default useSignup
