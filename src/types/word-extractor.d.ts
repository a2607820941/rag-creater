declare module "word-extractor" {
  interface WordExtractor {
    extract(buffer: Buffer): Promise<WordDocument>;
  }

  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
    getAnnotations(): string;
    getEndnotes(): string;
  }

  const WordExtractor: {
    new (): WordExtractor;
    prototype: WordExtractor;
  };

  export default WordExtractor;
}
