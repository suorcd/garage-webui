import { Loading } from "react-daisyui";
import { cn } from "@/lib/utils";

type PageLoadingProps = {
  className?: string;
};

const PageLoading = ({ className }: PageLoadingProps) => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("flex items-center justify-center py-16", className)}
    >
      <Loading size="lg" />
    </div>
  );
};

export default PageLoading;
