declare module 'pdfmake' {
  export default class PdfPrinter {
    constructor(fonts: Record<string, unknown>)
    createPdfKitDocument(docDefinition: unknown, options?: unknown): NodeJS.ReadableStream & { end(): void }
  }
}

declare module 'pdfmake/build/vfs_fonts.js' {
  const vfs: { pdfMake: { vfs: Record<string, string> } }
  export default vfs
}
