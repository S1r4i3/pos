"use client";

import { useActionState, startTransition, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { initialState, type ActionState } from "@/lib/action";

/**
 * Connects a form to a Server Action WITHOUT React's automatic form reset,
 * so if validation fails the user keeps what they typed.
 * After a successful save it refreshes the page data (sidebar names etc.).
 *
 *   const { state, pending, onSubmit } = useFormAction(saveThing);
 *   <form onSubmit={onSubmit}> … <SubmitButton pending={pending}>Save</SubmitButton>
 */
export function useFormAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, onSubmit, fieldErrors: state.fieldErrors ?? {} };
}
