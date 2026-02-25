import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          padding: '2rem',
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
              The application encountered an unexpected error.
            </p>
            <pre style={{
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              textAlign: 'left',
              overflow: 'auto',
              maxHeight: '200px',
              marginBottom: '1rem',
              border: '1px solid #fecaca',
            }}>
              {this.state.error?.message}
              {this.state.error?.stack && `\n\n${this.state.error.stack}`}
            </pre>
            <button
              onClick={this.handleReload}
              style={{
                backgroundColor: '#4f46e5',
                color: '#fff',
                padding: '0.5rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
