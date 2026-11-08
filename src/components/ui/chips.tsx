import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import React, { forwardRef } from "react";
import { Button } from "react-daisyui";

type Props = React.ComponentPropsWithoutRef<"div"> & {
  onClick?: () => void;
  onRemove?: () => void;
};

const Chips = forwardRef<HTMLDivElement, Props>(
  ({ className, children, onClick, onRemove, ...props }, ref) => {
    const classes = cn(
      "inline-flex flex-row items-center h-8 px-4 rounded-full text-sm border border-primary/80 text-base-content cursor-default",
      className
    );

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (!onClick) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    };

    return (
      <div
        ref={ref}
        className={classes}
        {...props}
        {...(onClick
          ? { role: "button", tabIndex: 0, onClick, onKeyDown }
          : {})}
      >
        {children}
        {onRemove ? (
          <Button
            type="button"
            color="ghost"
            shape="circle"
            size="sm"
            className="-mr-3"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X size={16} />
          </Button>
        ) : null}
      </div>
    );
  }
);

export default Chips;
