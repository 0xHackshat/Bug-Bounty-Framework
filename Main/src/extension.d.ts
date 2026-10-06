interface FirefoxStorageArea {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

interface FirefoxExtensionBrowser {
  runtime?: { id?: string }
  storage?: { local?: FirefoxStorageArea }
}

declare const browser: FirefoxExtensionBrowser | undefined
