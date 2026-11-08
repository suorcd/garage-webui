import { useEffect, useRef } from "react";
import { createStore, useStore } from "zustand";

type DisclosureState<T> = {
  data: T | null | undefined;
  isOpen: boolean;
  dialog: HTMLDialogElement | null;
};

export const createDisclosure = <T = unknown>() => {
  const store = createStore<DisclosureState<T>>(() => ({
    data: undefined,
    isOpen: false,
    dialog: null,
  }));

  const useDisclosure = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const isOpen = useStore(store, (state) => state.isOpen);
    const data = useStore(store, (state) => state.data);

    // Register the dialog element so close() can close it even when it
    // was opened with showModal() instead of the open attribute.
    useEffect(() => {
      store.setState({ dialog: dialogRef.current });
      return () => {
        store.setState({ dialog: null });
      };
    }, [dialogRef]);

    useEffect(() => {
      const dlg = dialogRef.current;
      if (!dlg || !isOpen) return;

      const onDialogClose = () => {
        store.setState({ isOpen: false });
      };

      dlg.addEventListener("close", onDialogClose);
      return () => dlg.removeEventListener("close", onDialogClose);
    }, [dialogRef, isOpen]);

    return { data, isOpen, dialogRef } as const;
  };

  return {
    store,
    use: useDisclosure,
    open: (data?: T | null) => store.setState({ isOpen: true, data }),
    close: () => {
      const { dialog } = store.getState();
      if (dialog?.open && typeof dialog.close === "function") {
        dialog.close();
      }
      store.setState({ isOpen: false, data: undefined });
    },
  };
};
