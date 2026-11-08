import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  value?: string | number | null;
  icon: LucideIcon;
  valueClassName?: string;
};

const StatsCard = ({ title, value, icon: Icon, valueClassName }: Props) => {
  return (
    <div className="bg-base-100 rounded-box p-4 md:p-6 flex flex-row items-center">
      <div className="shrink-0 w-[60px]">
        <Icon size={32} />
      </div>

      <div className="flex-1 truncate">
        <p className={cn("flex-1 text-3xl font-bold", valueClassName)}>
          {typeof value === "undefined" ? "..." : value}
        </p>
        <p className="text-sm mt-0.5 truncate">{title}</p>
      </div>
    </div>
  );
};

export default StatsCard;
