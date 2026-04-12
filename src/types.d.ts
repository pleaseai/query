declare module "picomatch" {
  function picomatch(
    glob: string | string[],
    options?: Record<string, unknown>,
  ): (test: string) => boolean;
  export = picomatch;
}
