export type AbstractCodec = {
    decode(file: File): Promise<DecodedData>;
    encode(imageData: ImageData, meta: ImageMeta): Promise<Blob>;
}

export type DecodedData = {
    imageData: ImageData;
    meta: ImageMeta;
}

export type ImageMeta = {
    width: number;
    height: number;
    colorDepth: string;
}