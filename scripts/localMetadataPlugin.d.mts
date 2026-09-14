export const LOCAL_METADATA_ROUTE: '/__local-analysis/metadata'
export const LOCAL_BINARY_ROUTE: '/__local-analysis/binary'
export const MAX_METADATA_BYTES: number
export const MAX_BINARY_BYTES: number
export interface LocalMetadataOptions { metadataPath?: string; binaryPath?: string }
export function createLocalMetadataMiddleware(options?: LocalMetadataOptions & { base?: string }): import('vite').Connect.NextHandleFunction
export function localMetadataPlugin(options?: LocalMetadataOptions): import('vite').Plugin
