import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from "react";
import { Tabs } from "react-daisyui";
import { useSearchParams } from "react-router-dom";

export type Tab = {
  name: string;
  title?: string;
  icon?: LucideIcon;
  Component?: () => ReactElement | null;
};

type Props = {
  tabs: Tab[];
  name?: string;
  className?: string;
  contentClassName?: string;
};

const TabView = ({
  tabs,
  name = "tab",
  className,
  contentClassName,
}: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get(name);
  const matched = tabs.some((tab) => tab.name === paramTab);
  const curTab = matched && paramTab ? paramTab : tabs[0].name;
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const selectTab = useCallback(
    (tabName: string) => {
      setSearchParams(
        (params) => {
          params.set(name, tabName);
          return params;
        },
        { replace: true }
      );
    },
    [name, setSearchParams]
  );

  useEffect(() => {
    if (!matched) {
      selectTab(tabs[0].name);
    }
  }, [matched, selectTab, tabs]);

  const content = useMemo(() => {
    const Comp = tabs.find((tab) => tab.name === curTab)?.Component;
    return Comp ? <Comp /> : null;
  }, [curTab, tabs]);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLAnchorElement>,
    index: number
  ) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectTab(tabs[next].name);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <Tabs
        variant="boxed"
        className={cn(
          "w-auto inline-flex flex-row items-stretch overflow-x-auto",
          className
        )}
      >
        {tabs.map(({ icon: Icon, ...tab }, index) => {
          const active = curTab === tab.name;
          return (
            <Tabs.Tab
              key={tab.name}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              active={active}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className="flex flex-row items-center gap-x-2 h-auto shrink-0"
              onClick={() => selectTab(tab.name)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {Icon ? <Icon size={20} /> : null}
              <span>{tab.title || tab.name}</span>
            </Tabs.Tab>
          );
        })}
      </Tabs>

      <div className={cn("mt-4", contentClassName)}>{content}</div>
    </>
  );
};

export default TabView;
