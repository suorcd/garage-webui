import Button from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "react-daisyui";
import { useForm } from "react-hook-form";
import { loginSchema } from "./schema";
import { InputField } from "@/components/ui/input";
import { useLogin } from "./hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { parseReturnTo } from "@/lib/utils";
import { APIError } from "@/lib/api";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = parseReturnTo(searchParams.get("returnTo"));
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const login = useLogin({
    onSuccess: () => navigate(returnTo, { replace: true }),
    onError: (error) => {
      if (
        error instanceof APIError &&
        error.status === 429 &&
        error.retryAfter != null
      ) {
        setLockedUntil(Date.now() + error.retryAfter * 1000);
        setNow(Date.now());
      }
    },
  });

  useEffect(() => {
    if (lockedUntil === null) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const secondsLeft =
    lockedUntil === null
      ? 0
      : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = secondsLeft > 0;

  useEffect(() => {
    if (lockedUntil !== null && secondsLeft === 0) {
      setLockedUntil(null);
    }
  }, [lockedUntil, secondsLeft]);

  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        if (!login.isPending && !locked) {
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
            autoComplete="username"
          />

          <InputField
            form={form}
            name="password"
            title="Password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
          />

          <Card.Actions className="mt-4">
            <Button
              type="submit"
              color="primary"
              className="w-full md:w-auto min-w-[100px]"
              loading={login.isPending}
              disabled={login.isPending || locked}
            >
              {locked ? `Try again in ${secondsLeft}s` : "Login"}
            </Button>
          </Card.Actions>
        </Card.Body>
      </Card>
    </form>
  );
}
