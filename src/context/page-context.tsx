import React, {
  createContext,
  memo,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type PageContextValues = {
  title: string | null;
  prev: string | null;
  actions: React.ReactNode | null;
};

export const PageContext = createContext<
  | (PageContextValues & {
      setValue: (values: Partial<PageContextValues>) => void;
    })
  | null
>(null);

const initialValues: PageContextValues = {
  title: null,
  prev: null,
  actions: null,
};

export const PageContextProvider = ({ children }: PropsWithChildren) => {
  const [values, setValues] = useState<PageContextValues>(initialValues);

  const setValue = useCallback((value: Partial<PageContextValues>) => {
    setValues((prev) => ({ ...prev, ...value }));
  }, []);

  return (
    <PageContext.Provider value={{ ...values, setValue }}>
      {children}
    </PageContext.Provider>
  );
};

type PageProps = Partial<PageContextValues>;

const Page = memo(({ title, prev, actions }: PageProps) => {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error("Page component must be used within a PageContextProvider");
  }
  const { setValue } = context;

  // The values this instance replaces, for the fields it sets. The
  // cleanup restores them, so unmounting one Page never wipes the
  // values of another.
  const [previous] = useState<Partial<PageContextValues>>(() => ({
    ...(title !== undefined ? { title: context.title } : {}),
    ...(prev !== undefined ? { prev: context.prev } : {}),
    ...(actions !== undefined ? { actions: context.actions } : {}),
  }));

  useEffect(() => {
    const values: Partial<PageContextValues> = {};
    if (title !== undefined) values.title = title;
    if (prev !== undefined) values.prev = prev;
    if (actions !== undefined) values.actions = actions;
    setValue(values);

    return () => {
      setValue(previous);
    };
  }, [title, prev, actions, setValue, previous]);

  return null;
});

export default Page;
