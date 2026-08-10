import { AlertIcon } from './icons.jsx';

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="error-banner visible" role="alert">
      <AlertIcon />
      <span>{message}</span>
    </div>
  );
}
