import {useMutation, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { login } from '../lib/api';
import { resetCsrfToken } from '../lib/axios';

const useLogin = () => {

    const queryClient = useQueryClient();
    const {
    mutate,
    isPending,
    error,
  } = useMutation({
    mutationFn: login,
    onSuccess: async data => {
      await queryClient.cancelQueries();
      resetCsrfToken();
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'authUser' });
      queryClient.setQueryData(['authUser'], data);
    },
  });
    return { error, isPending, loginMutation:mutate };
}

export default useLogin;
