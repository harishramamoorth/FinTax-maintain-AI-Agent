import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/primitives';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('UI error:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="h-full grid place-items-center p-6 text-center">
        <div className="glass rounded-xl2 p-8 max-w-md space-y-3">
          <p className="text-lg font-semibold">This view crashed</p>
          <p className="text-sm text-muted break-words">{this.state.error.message}</p>
          <div className="flex gap-2 justify-center"><Button onClick={() => this.setState({ error: null })}>Try again</Button><Button variant="primary" onClick={() => window.location.assign('/')}>Go to overview</Button></div>
        </div>
      </div>
    );
  }
}
