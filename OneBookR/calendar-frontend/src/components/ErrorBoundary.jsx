import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    // Logga till konsolen för debug
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Försök rendera om
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32,
          background: '#fff3e0',
          border: '2px solid #ff9800',
          borderRadius: 8,
          color: '#bf360c',
          maxWidth: 600,
          margin: '40px auto',
          textAlign: 'center'
        }}>
          <h2>Ett fel uppstod i {this.props.componentName || 'komponenten'}.</h2>
          <p>{this.state.error?.message || 'Något gick fel.'}</p>
          {this.state.errorInfo && (
            <details style={{ whiteSpace: 'pre-wrap', color: '#666', marginTop: 16 }}>
              {this.state.errorInfo.componentStack}
            </details>
          )}
          <button
            style={{
              marginTop: 24,
              padding: '10px 24px',
              borderRadius: 6,
              background: '#635bff',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onClick={this.handleReload}
          >
            Försök igen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
