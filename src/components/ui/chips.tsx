import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import React, { forwardRef } from "react";
import { Button } from "react-daisyui";

type Props = React.ComponentPropsWithoutRef<"div"> & {
  onClick?: () => void;
  onRemove?: () => void;
};

const Chips = forwardRef<HTMLDivElement, Props>(
  ({ className, children, onRemove, ...props }, ref) => {
    const { onClick, ...rest } = props;
    const classes = cn(
      "inline-flex flex-row items-center h-8 px-4 rounded-full text-sm border border-primary/80 text-base-content cursor-default",
      className
    );
    const content = (
      <>
        {children}
        {onRemove ? (
          <Button
            color="ghost"
            shape="circle"
            size="sm"
            className="-mr-3"
            onClick={onRemove}
          >
            <X size={16} />
          </Button>
        ) : null}
      </>
    );

    if (onClick) {
      return (
        <button
          ref={ref as never}
          className={classes}
          onClick={onClick}
          {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {content}
        </button>
      );
    }

    return (
      <div ref={ref} className={classes} {...rest}>
        {content}
      </div>
    );
  }
);

export default Chips;
