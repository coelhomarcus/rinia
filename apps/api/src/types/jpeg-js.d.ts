declare module "jpeg-js" {
    export function decode(
        buffer: Buffer | Uint8Array,
        options?: { useTArray?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number; maxResolutionInMP?: number },
    ): { width: number; height: number; data: Uint8Array | Buffer };
    export function encode(image: { data: Uint8Array | Buffer; width: number; height: number }, quality?: number): { data: Uint8Array | Buffer };
}
