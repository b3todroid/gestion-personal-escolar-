import { Component, type ErrorInfo, type ReactNode } from "react";

/** Evita que un fallo deje la app en blanco; registra el detalle solo en la consola. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[error]", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="text-stone-600">Ocurrió un problema inesperado. Tus datos no se borraron. Recarga la página; si continúa, descarga un respaldo desde Configuración y avísame.</p>
        <button type="button" onClick={() => window.location.reload()} className="self-start rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">Recargar</button>
      </main>
    );
  }
}
