import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import BrandMark from '@/components/BrandMark';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

const credentials = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
const signUpSchema = credentials
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

type Values = { email: string; password: string; confirm?: string };

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(mode === 'signup' ? signUpSchema : credentials),
    defaultValues: { email: '', password: '', confirm: '' },
  });

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      if (mode === 'login') {
        await signIn(values.email, values.password);
        navigate(from, { replace: true });
      } else if (await signUp(values.email, values.password)) {
        navigate(from, { replace: true });
      } else {
        setNeedsConfirmation(true);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const isLogin = mode === 'login';
  const { isSubmitting } = form.formState;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center px-4">
      <div className="fixed top-3 right-3">
        <ThemeToggle />
      </div>
      <Card className="w-full gap-5 p-1.5">
        <CardHeader className="gap-3">
          <BrandMark linked={false} />
          <CardTitle className="text-xl">{isLogin ? 'Sign in' : 'Create account'}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isLogin
              ? 'Welcome back. Use your email and password.'
              : 'Use your email and a password.'}
          </p>
        </CardHeader>
        <CardContent>
          {needsConfirmation ? (
            <p className="text-sm">Check your email to confirm your address, then sign in.</p>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <FieldGroup>
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <Input {...field} id="email" type="email" autoComplete="email" />
                      {fieldState.error && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        {...field}
                        id="password"
                        type="password"
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                      />
                      {fieldState.error && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                {!isLogin && (
                  <Controller
                    name="confirm"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="confirm">Repeat password</FieldLabel>
                        <Input
                          {...field}
                          id="confirm"
                          type="password"
                          autoComplete="new-password"
                        />
                        {fieldState.error && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                )}
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
                {/* disabled while submitting: prevents a double submit */}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {isLogin ? 'No account yet? ' : 'Already have an account? '}
                  <Link
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                    to={isLogin ? '/signup' : '/login'}
                    state={location.state}
                  >
                    {isLogin ? 'Create one' : 'Sign in'}
                  </Link>
                </p>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
