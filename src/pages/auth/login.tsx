import Button from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "react-daisyui";
import { useForm } from "react-hook-form";
import { loginSchema } from "./schema";
import { InputField } from "@/components/ui/input";
import { useLogin } from "./hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { parseReturnTo } from "@/lib/utils";

export default function LoginPage() {
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = parseReturnTo(searchParams.get("returnTo"));
  const login = useLogin({
    onSuccess: () => navigate(returnTo, { replace: true }),
  });

  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        if (!login.isPending) {
          login.mutate(v);
        }
      })}
    >
      <Card className="w-full max-w-md" bordered>
        <Card.Body>
          <Card.Title tag="h2">Login</Card.Title>
          <p className="text-base-content/60">
            Enter username and password below to log in to your account
          </p>

          <InputField
            form={form}
            name="username"
            title="Username"
            placeholder="Enter your username"
          />

          <InputField
            form={form}
            name="password"
            title="Password"
            type="password"
            placeholder="Enter your password"
          />

          <Card.Actions className="mt-4">
            <Button
              type="submit"
              color="primary"
              className="w-full md:w-auto min-w-[100px]"
              loading={login.isPending}
              disabled={login.isPending}
            >
              Login
            </Button>
          </Card.Actions>
        </Card.Body>
      </Card>
    </form>
  );
}
