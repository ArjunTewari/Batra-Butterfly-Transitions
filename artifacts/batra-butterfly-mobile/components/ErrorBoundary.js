import React, { Component } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
/**
 * This is a special case for for using the class components. Error boundaries must be class components because React only provides error boundary functionality through lifecycle methods (componentDidCatch and getDerivedStateFromError) which are not available in functional components.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class ErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        this.state = { error: null };
        this.resetError = () => {
            this.setState({ error: null });
        };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        if (typeof this.props.onError === "function") {
            this.props.onError(error, info.componentStack);
        }
    }
    render() {
        const { FallbackComponent } = this.props;
        return this.state.error && FallbackComponent ? (<FallbackComponent error={this.state.error} resetError={this.resetError}/>) : (this.props.children);
    }
}
ErrorBoundary.defaultProps = {
    FallbackComponent: ErrorFallback,
};
