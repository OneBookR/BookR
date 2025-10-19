import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Logga felet så vi ser det i konsolen
    console.error('ErrorBoundary caught an error:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, border: '1px solid #f44336', borderRadius: 8, background: '#ffebee', color: '#b71c1c' }}>
          <strong>Ett fel uppstod i {this.props.componentName || 'komponenten'}.</strong>
          <div style={{ fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.message || this.state.error || '')}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, border: 'none', background: '#d32f2f', color: '#fff', cursor: 'pointer' }}
          >
            Ladda om
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
