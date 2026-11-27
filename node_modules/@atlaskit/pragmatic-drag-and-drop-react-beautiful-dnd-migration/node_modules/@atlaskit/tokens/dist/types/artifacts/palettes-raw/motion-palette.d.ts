/**
 * THIS FILE WAS CREATED VIA CODEGEN DO NOT MODIFY {@see http://go/af-codegen}
 * @codegen <<SignedSource::51e12d8765fc794a708710af9b1684ac>>
 * @codegenCommand yarn build tokens
 */
type TokenValue = string | number | Record<string, any>;
type TokenValueOriginal = string | number | Record<string, any>;
type TokenAttributes = {
    group: string;
};
type Token = {
    value: TokenValue;
    filePath: string;
    isSource: boolean;
    attributes: TokenAttributes;
    original: {
        value: TokenValueOriginal;
        attributes: TokenAttributes;
    };
    name: string;
    path: string[];
};
declare const tokens: Token[];
export default tokens;
