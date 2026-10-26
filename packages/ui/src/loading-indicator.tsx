import { BrandMark } from './brand';
import { cn } from './cn';

export interface LoadingIndicatorProps {
  /** Announced to assistive technology; the animation replaces visible loading text. */
  label?: string;
  variant?: 'inline' | 'panel' | 'screen';
  className?: string;
}

/**
 * Indeterminate, branded loading state. CSS transforms provide the depth and
 * motion without a canvas, timers, or a JavaScript animation dependency.
 */
export function LoadingIndicator({
  label = 'Preparing your workspace',
  variant = 'panel',
  className,
}: LoadingIndicatorProps) {
  const Container = variant === 'screen' ? 'div' : 'span';

  return (
    <Container
      className={cn('smarteam-loader', `smarteam-loader--${variant}`, className)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="smarteam-loader__scene" aria-hidden="true">
        <span className="smarteam-loader__shadow" />
        <span className="smarteam-loader__orbit" />
        <span className="smarteam-loader__float">
          <span className="smarteam-loader__cube">
            <span className="smarteam-loader__face smarteam-loader__face--front"><BrandMark /></span>
            <span className="smarteam-loader__face smarteam-loader__face--back"><BrandMark /></span>
            <span className="smarteam-loader__face smarteam-loader__face--right" />
            <span className="smarteam-loader__face smarteam-loader__face--left" />
            <span className="smarteam-loader__face smarteam-loader__face--top" />
            <span className="smarteam-loader__face smarteam-loader__face--bottom" />
          </span>
        </span>
      </span>
      {variant === 'screen' && (
        <span className="smarteam-loader__identity" aria-hidden="true">
          <span className="smarteam-loader__wordmark">Smarteam</span>
          <span className="smarteam-loader__tagline">People · Time · Pay</span>
        </span>
      )}
      <span className="smarteam-loader__announcement">{label}</span>
    </Container>
  );
}
