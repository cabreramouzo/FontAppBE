interface Window {
  google?: {
    accounts: {
      id: {
        initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void
        renderButton(element: HTMLElement, options: {
          type: string; theme: string; size: string; width: number; text: string; shape: string
        }): void
      }
    }
  }
}
