import React, { Component } from 'react';
import BSOD from './OS/BSOD';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <BSOD errorMessage={this.state.error?.toString()} />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

