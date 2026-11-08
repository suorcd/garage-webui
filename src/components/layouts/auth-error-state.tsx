import { Alert } from "react-daisyui";
import { CircleXIcon } from "lucide-react";
import Button from "../ui/button";

// Shown when the auth status query fails. A failed status query is a
// server error, not proof that the user is logged out.
const AuthErrorState = ({ onRetry }: { onRetry: () => void }) => {
  return (
    <div className="min-h-svh flex items-center justify-center p-4">
      <Alert status="error" icon={<CircleXIcon />}>
        <span>
          Could not reach the server. Check the connection and try again.
        </span>
        <Button onClick={onRetry}>Retry</Button>
      </Alert>
    </div>
  );
};

export default AuthErrorState;
