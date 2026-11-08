import Page from "@/context/page-context";
import Button from "@/components/ui/button";

const NotFoundPage = () => {
  return (
    <div className="container flex flex-col items-center gap-4 py-16 text-center">
      <Page title="Not Found" />

      <h2 className="text-2xl font-bold">Page not found</h2>
      <p>This page does not exist.</p>

      <Button href="/" color="primary">
        Go to dashboard
      </Button>
    </div>
  );
};

export default NotFoundPage;
