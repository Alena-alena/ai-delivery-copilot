import { NavLink, Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import BrandMark from '@/components/BrandMark';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-2.5 py-1.5 text-sm transition-colors',
    isActive
      ? 'bg-muted font-medium text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export default function AppLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex h-13 max-w-[1080px] items-center gap-5 px-5">
          <BrandMark />
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Projects
            </NavLink>
            <NavLink to="/usage" className={navClass}>
              Usage
            </NavLink>
            <NavLink to="/status" className={navClass}>
              Status
            </NavLink>
          </nav>
          <span className="flex-1" />
          <ThemeToggle />
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
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
      <main className="mx-auto max-w-[1080px] px-5 py-7">
        <Outlet />
      </main>
    </div>
  );
}
