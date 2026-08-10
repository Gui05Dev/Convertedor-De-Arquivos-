import { SuccessCheckIcon } from './icons.jsx';

export function SuccessPanel({ message }) {
  return (
    <div className="success-state visible">
      <div className="success-check"><SuccessCheckIcon /></div>
      <div className="success-title">Processado com sucesso!</div>
      <div className="success-sub">{message}</div>
    </div>
  );
}
