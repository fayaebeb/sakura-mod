declare module "pdf2image" {
  export function convertFromPath(
    filePath: string,
    options?: any
  ): Promise<Array<{ path: string }>>;
}
