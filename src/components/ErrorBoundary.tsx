'use client';

import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="bg-red-900 bg-opacity-90 text-white px-6 py-4 rounded-lg shadow-2xl max-w-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-3xl">⚠️</div>
            <div>
              <p className="font-bold text-lg">Error Loading Component</p>
              <p className="text-sm opacity-90">{this.state.error?.message || 'Unknown error'}</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

