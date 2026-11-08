import { cn } from "@/lib/utils";
import { ComponentPropsWithoutRef } from "react";
import {
  FieldValues,
  UseFormReturn,
  Controller,
  ControllerRenderProps,
  ControllerFieldState,
  FieldPath,
  UseFormStateReturn,
} from "react-hook-form";

type FormControlProps<
  T extends FieldValues,
  U extends FieldPath<T> = FieldPath<T>
> = ComponentPropsWithoutRef<"div"> & {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  title?: string;

  render: (
    field: ControllerRenderProps<T, U> & {
      id: string;
      "aria-describedby"?: string;
      "aria-invalid"?: boolean;
    },
    fieldProps: {
      fieldState: ControllerFieldState;
      formState: UseFormStateReturn<T>;
    }
  ) => React.ReactElement;
};

const FormControl = <T extends FieldValues>({
  form,
  name,
  title,
  className,
  render,
}: FormControlProps<T>) => {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState, formState }) => {
        const inputId = field.name;
        const errorId = `${field.name}-error`;
        const error = fieldState.error;
        return (
          <div className={cn("form-control", className)}>
            {title ? (
              <label htmlFor={inputId} className="label label-text">
                {title}
              </label>
            ) : null}

            {render(
              {
                ...field,
                id: inputId,
                ...(error
                  ? { "aria-describedby": errorId, "aria-invalid": true }
                  : {}),
              },
              { fieldState, formState }
            )}

            {error ? (
              <p id={errorId} role="alert" className="label label-text text-error">
                {error.message}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
};

export default FormControl;
