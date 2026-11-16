import { Link, Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export default function AppLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4">
            <Link to="/" className="font-semibold">
              AI Delivery Copilot
            </Link>
            <Link to="/status" className="text-sm text-muted-foreground hover:text-foreground">
              Status
            </Link>
          </nav>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut().catch(() => toast.error('Could not sign out'))}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
