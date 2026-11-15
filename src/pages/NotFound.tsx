import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="That address doesn't match anything here."
      action={
        <Link to="/" className="text-sm font-medium text-accent hover:underline">
          Go home
        </Link>
      }
    />
  );
}
