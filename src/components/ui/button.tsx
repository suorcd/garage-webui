import { LucideIcon } from "lucide-react";
import { ComponentPropsWithoutRef, forwardRef } from "react";
import { Button as BaseButton } from "react-daisyui";
import { Link } from "react-router-dom";

type ButtonProps = ComponentPropsWithoutRef<typeof BaseButton> & {
  type?: HTMLButtonElement["type"];
  href?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  icon?: LucideIcon;
};

const isExternalHref = (href: string) =>
  href.startsWith("http://") || href.startsWith("https://");

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ href, target, children, icon: Icon, shape, ...props }, ref) => {
    const isExternal = href ? isExternalHref(href) : false;

    return (
      <BaseButton
        ref={ref}
        tag={href ? (isExternal ? "a" : Link) : undefined}
        shape={shape ?? (Icon && !children ? "circle" : undefined)}
        {...props}
        {...(target ? { target } : {})}
        {...(target === "_blank" ? { rel: "noopener noreferrer" } : {})}
        {...(href ? (isExternal ? { href } : { to: href }) : {})}
      >
        {Icon ? <Icon size={18} className={children ? "-ml-1" : ""} /> : null}
        {children}
      </BaseButton>
    );
  }
);

export default Button;
