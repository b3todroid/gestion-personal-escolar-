import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { failed: boolean; message: string }

/** Evita que un fallo deje la app en blanco; permite volver al inicio sin perder datos. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[error]", error, info.componentStack);
  }

  componentDidMount() {
    // Al cambiar de pantalla se vuelve a intentar (un fallo en una pantalla no bloquea las demás).
    window.addEventListener("hashchange", this.reset);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.reset);
  }

  reset = () => { if (this.state.failed) this.setState({ failed: false, message: "" }); };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="text-stone-600">Ocurrió un problema inesperado. Tus datos no se borraron.</p>
        <div className="flex flex-wrap gap-2">
          <a href="#/" onClick={() => { window.location.hash = "/"; this.reset(); }} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">Ir al inicio</a>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-stone-300 px-4 py-2 font-semibold">Recargar</button>
        </div>
        <details className="text-xs text-stone-500"><summary>Detalle técnico</summary><p className="mt-1 break-words">{this.state.message}</p></details>
      </main>
    );
  }
}
